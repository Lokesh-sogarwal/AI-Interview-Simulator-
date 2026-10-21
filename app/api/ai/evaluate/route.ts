import { evaluationSystemPrompt, evaluationUserPrompt, type InterviewType } from "@/lib/prompts";
import { getCurrentUser } from "@/lib/auth";
import { safeJsonParse } from "@/lib/openai";
import { aiUnavailableResponse, llmText } from "@/lib/llm";
import { jsonError, readJsonObject, toObjectId } from "@/lib/http";
import { getDb } from "@/lib/mongodb";
import { rememberEvaluation, turnKey } from "@/lib/interviewRecords";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";
import {
  applyRelevanceCap,
  isNonsenseAnswer,
  normalizeEval,
  strictNonsenseEvaluation,
  type Evaluation,
} from "@/lib/evaluation";

export type { Evaluation } from "@/lib/evaluation";

const INTERVIEW_TYPES: InterviewType[] = ["Technical", "HR", "Mixed"];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);

  const rl = rateLimit(request, {
    keyPrefix: "ai:evaluate",
    key: user.id,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = await readJsonObject<{
    question: string;
    answer: string;
    type: InterviewType;
    role: string;
    experience: string;
    company: string;
    focusAreas: string;
    resumeText: string;
    resumeProfile: unknown;
    interviewId: string;
  }>(request);
  if (!body) return jsonError("Invalid JSON body.", 400);

  const question = clampString(String(body.question ?? "").trim(), 800);
  const answer = clampString(String(body.answer ?? "").trim(), 4000);
  const type: InterviewType = INTERVIEW_TYPES.includes(body.type as InterviewType)
    ? (body.type as InterviewType)
    : "Technical";
  const role = clampString(String(body.role ?? "").trim(), 120);
  const experience = clampString(String(body.experience ?? "").trim(), 40);
  const company = clampString(String(body.company ?? "").trim(), 80);
  const focusAreas = clampString(String(body.focusAreas ?? "").trim(), 600);
  const resumeText = clampString(String(body.resumeText ?? "").trim(), 12000);

  const resumeProfileString = body.resumeProfile
    ? clampString(JSON.stringify(body.resumeProfile), 12000)
    : "";
  const resumeContext = (resumeProfileString || resumeText).trim();

  if (!question || !answer) {
    return jsonError("Missing question or answer.", 400);
  }

  const interviewOid = toObjectId(body.interviewId);
  async function remember(evaluation: Evaluation) {
    if (!interviewOid) return;
    const db = await getDb();
    if (!db) return;
    await rememberEvaluation(
      db.collection("interviews"),
      { _id: interviewOid, userId: user!.id },
      turnKey(question, answer),
      evaluation,
    );
  }

  // If the user provides gibberish / a non-answer, be strict and realistic.
  // This avoids the model hallucinating strengths for meaningless input.
  if (isNonsenseAnswer(answer)) {
    const evaluation = strictNonsenseEvaluation();
    await remember(evaluation);
    return Response.json({ ok: true, evaluation, source: "guard" });
  }

  const system = evaluationSystemPrompt();
  const prompt = evaluationUserPrompt({ question, answer, type, role, experience, company, focusAreas, resumeContext });

  const ai = await llmText({
    system,
    user: prompt,
    models: {
      huggingface: process.env.HUGGINGFACE_MODEL_EVAL || process.env.HUGGINGFACE_MODEL,
      openai: process.env.OPENAI_MODEL,
    },
  });
  if (ai) {
    const parsed = safeJsonParse<Evaluation>(ai.text);
    if (parsed) {
      const normalized = normalizeEval(parsed);
      const guarded = applyRelevanceCap({ question, answer, type, evaluation: normalized });
      await remember(guarded);
      return Response.json({ ok: true, evaluation: guarded, source: ai.provider });
    }
    console.error("[ai/evaluate] provider returned non-JSON output");
  }

  // Never fabricate a score: tell the client so it can keep the answer and retry.
  return aiUnavailableResponse("Answer evaluation");
}
