import { starUserPrompt } from "@/lib/prompts";
import { STAR_SCHEMA } from "@/lib/aiSchemas";
import { safeJsonParse } from "@/lib/openai";
import { getCurrentUser } from "@/lib/auth";
import { aiUnavailableResponse, llmText } from "@/lib/llm";
import { jsonError } from "@/lib/http";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";

type StarAnalysis = {
  star_used: boolean;
  emotional_intelligence_score: number;
  structure_score: number;
  improvement_feedback: string;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);

  const rl = rateLimit(request, {
    keyPrefix: "ai:star",
    key: user.id,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as
    | { question?: string; answer?: string }
    | null;

  const question = clampString(body?.question?.trim() || "", 800);
  const answer = clampString(body?.answer?.trim() || "", 4000);

  if (!question || !answer) {
    return Response.json(
      { ok: false, error: "Missing question or answer." },
      { status: 400 },
    );
  }

  const system = "Return ONLY JSON.";
  const prompt = starUserPrompt({ question, answer });

  const ai = await llmText({
    system,
    user: prompt,
    maxTokens: 200,
    task: "evaluation",
    jsonSchema: STAR_SCHEMA,
    models: {
      huggingface: process.env.HUGGINGFACE_MODEL_EVAL || process.env.HUGGINGFACE_MODEL,
      openai: process.env.OPENAI_MODEL,
    },
  });
  if (ai) {
    const parsed = safeJsonParse<StarAnalysis>(ai.text);
    if (parsed && typeof parsed.star_used === "boolean") {
      const score = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 0;
      };
      return Response.json({
        ok: true,
        star: {
          star_used: parsed.star_used,
          emotional_intelligence_score: score(parsed.emotional_intelligence_score),
          structure_score: score(parsed.structure_score),
          improvement_feedback: String(parsed.improvement_feedback ?? ""),
        },
        source: ai.provider,
      });
    }
  }

  // STAR analysis is optional; the interview continues without it.
  return aiUnavailableResponse("STAR analysis");
}
