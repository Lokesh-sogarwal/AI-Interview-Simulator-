import { starUserPrompt } from "@/lib/prompts";
import { safeJsonParse } from "@/lib/openai";
import { llmText } from "@/lib/llm";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";

type StarAnalysis = {
  star_used: boolean;
  emotional_intelligence_score: number;
  structure_score: number;
  improvement_feedback: string;
};

function fallbackStar(answer: string): StarAnalysis {
  const lower = answer.toLowerCase();
  const hasSituation = /(situation|context)/.test(lower);
  const hasAction = /(action|did|implemented|handled)/.test(lower);
  const hasResult = /(result|impact|outcome|improved|reduced|increased)/.test(lower);

  const starUsed = hasSituation && hasAction && hasResult;

  return {
    star_used: starUsed,
    emotional_intelligence_score: starUsed ? 7 : 5,
    structure_score: starUsed ? 7 : 4,
    improvement_feedback:
      "Use STAR: briefly set the situation, your task, the actions you took, and the measurable result.",
  };
}

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "ai:star",
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
  const user = starUserPrompt({ question, answer });

  const ai = await llmText({
    system,
    user,
    models: {
      huggingface: process.env.HUGGINGFACE_MODEL_EVAL || process.env.HUGGINGFACE_MODEL,
      openai: process.env.OPENAI_MODEL,
    },
  });
  if (ai) {
    const parsed = safeJsonParse<StarAnalysis>(ai.text);
    if (parsed) {
      return Response.json({ ok: true, star: parsed, source: ai.provider });
    }
  }

  return Response.json({ ok: true, star: fallbackStar(answer), source: "fallback" });
}
