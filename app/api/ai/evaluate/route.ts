import {
  evaluationSystemPrompt,
  evaluationUserPrompt,
  type InterviewType,
} from "@/lib/prompts";
import { safeJsonParse } from "@/lib/openai";
import { llmText } from "@/lib/llm";

export type Evaluation = {
  technical_score: number;
  clarity_score: number;
  confidence_score: number;
  depth_score: number;
  overall_score: number;
  strengths: string;
  weaknesses: string;
  improvement: string;
  ideal_answer: string;
  follow_up_question: string;
};

function clamp0to10(value: number) {
  return Math.max(0, Math.min(10, value));
}

function fallbackEvaluation(answer: string): Evaluation {
  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  const clarity = clamp0to10(Math.round(Math.min(10, wordCount / 25)));
  const confidence = clamp0to10(Math.round(Math.min(10, wordCount / 30)));
  const technical = clamp0to10(Math.round(Math.min(10, wordCount / 35)));
  const depth = clamp0to10(Math.round(Math.min(10, wordCount / 40)));
  const overall = clamp0to10(Math.round((technical + clarity + confidence + depth) / 4));

  return {
    technical_score: technical,
    clarity_score: clarity,
    confidence_score: confidence,
    depth_score: depth,
    overall_score: overall,
    strengths: "You provided a structured response with some relevant detail.",
    weaknesses: "Some points could be clearer or more specific.",
    improvement:
      "Use a clearer structure (context → action → result) and add one concrete example.",
    ideal_answer:
      "A strong answer should explain the concept clearly, give an example, and mention trade-offs.",
    follow_up_question:
      "Can you share one concrete example from a real project and explain the trade-offs you considered?",
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        question?: string;
        answer?: string;
        type?: InterviewType;
        role?: string;
        experience?: string;
        company?: string;
        focusAreas?: string;
        resumeText?: string;
        resumeProfile?: unknown;
      }
    | null;

  const question = body?.question?.trim() || "";
  const answer = body?.answer?.trim() || "";
  const type = (body?.type || "Technical") as InterviewType;
  const role = body?.role?.trim() || "";
  const experience = body?.experience?.trim() || "";
  const company = body?.company?.trim() || "";
  const focusAreas = body?.focusAreas?.trim() || "";
  const resumeText = body?.resumeText?.trim() || "";

  const resumeProfileString = body?.resumeProfile ? JSON.stringify(body.resumeProfile) : "";
  const resumeContext = (resumeProfileString || resumeText).trim();

  if (!question || !answer) {
    return Response.json(
      { ok: false, error: "Missing question or answer." },
      { status: 400 },
    );
  }

  const system = evaluationSystemPrompt();
  const user = evaluationUserPrompt({ question, answer, type, role, experience, company, focusAreas, resumeContext });

  const ai = await llmText({
    system,
    user,
    models: {
      huggingface: process.env.HUGGINGFACE_MODEL_EVAL || process.env.HUGGINGFACE_MODEL,
      openai: process.env.OPENAI_MODEL,
    },
  });
  if (ai) {
    const parsed = safeJsonParse<Evaluation>(ai.text);
    if (parsed) {
      return Response.json({ ok: true, evaluation: parsed, source: ai.provider });
    }
  }

  return Response.json({ ok: true, evaluation: fallbackEvaluation(answer), source: "fallback" });
}
