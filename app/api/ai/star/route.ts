import { starUserPrompt } from "@/lib/prompts";
import { safeJsonParse } from "@/lib/openai";
import { llmText } from "@/lib/llm";

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
  const body = (await request.json().catch(() => null)) as
    | { question?: string; answer?: string }
    | null;

  const question = body?.question?.trim() || "";
  const answer = body?.answer?.trim() || "";

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
