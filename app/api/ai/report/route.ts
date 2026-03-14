import { llmText } from "@/lib/llm";
import { safeJsonParse } from "@/lib/openai";
import {
  interviewSimulatorSystemPrompt,
  type InterviewType,
} from "@/lib/prompts";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";

export type FinalReport = {
  overall_score: number;
  technical_score: number;
  communication_score: number;
  problem_solving_score: number;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  recommended_focus_areas: string[];
};

function clamp0to10(value: number) {
  return Math.max(0, Math.min(10, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function normalizeReport(report: FinalReport, computed: {
  avgOverall: number;
  avgTechnical: number;
  avgCommunication: number;
  avgProblemSolving: number;
}): FinalReport {
  const avgOverall = clamp0to10(round1(computed.avgOverall));
  const avgTechnical = clamp0to10(round1(computed.avgTechnical));
  const avgCommunication = clamp0to10(round1(computed.avgCommunication));
  const avgProblemSolving = clamp0to10(round1(computed.avgProblemSolving));

  const overall = clamp0to10(Number(report.overall_score ?? avgOverall));
  const technical = clamp0to10(Number(report.technical_score ?? avgTechnical));
  const communication = clamp0to10(Number(report.communication_score ?? avgCommunication));
  const problemSolving = clamp0to10(Number(report.problem_solving_score ?? avgProblemSolving));

  const strengths = Array.isArray(report.strengths)
    ? report.strengths.map(String).filter(Boolean).slice(0, 8)
    : [];
  const weaknesses = Array.isArray(report.weaknesses)
    ? report.weaknesses.map(String).filter(Boolean).slice(0, 8)
    : [];
  const improvement = Array.isArray(report.improvement_suggestions)
    ? report.improvement_suggestions.map(String).filter(Boolean).slice(0, 10)
    : [];
  const focus = Array.isArray(report.recommended_focus_areas)
    ? report.recommended_focus_areas.map(String).filter(Boolean).slice(0, 10)
    : [];

  // Guard against inflated scores: if model returns numbers far above computed averages,
  // snap scores back to computed values.
  const snapIfTooHigh = (val: number, computedVal: number) => (val - computedVal >= 1.5 ? computedVal : val);

  return {
    overall_score: snapIfTooHigh(overall, avgOverall),
    technical_score: snapIfTooHigh(technical, avgTechnical),
    communication_score: snapIfTooHigh(communication, avgCommunication),
    problem_solving_score: snapIfTooHigh(problemSolving, avgProblemSolving),
    strengths,
    weaknesses,
    improvement_suggestions: improvement,
    recommended_focus_areas: focus,
  };
}

function fallbackReport(params: {
  avgOverall: number;
  avgTechnical: number;
  avgCommunication: number;
  avgProblemSolving: number;
  focusAreas?: string;
}): FinalReport {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const improvement_suggestions: string[] = [];

  if (params.avgOverall >= 7) strengths.push("You maintained a strong overall performance across questions.");
  else if (params.avgOverall >= 5) strengths.push("You covered the core points, with room to improve depth and clarity.");
  else strengths.push("You showed effort, but answers often lacked clarity and specificity.");

  if (params.avgTechnical >= 7) strengths.push("Technical reasoning was generally solid.");
  else if (params.avgTechnical <= 4) weaknesses.push("Technical explanations were often shallow or inaccurate.");

  if (params.avgCommunication >= 7) strengths.push("Communication was clear and confident.");
  else if (params.avgCommunication <= 4) weaknesses.push("Communication lacked structure or confidence.");

  if (params.avgProblemSolving >= 7) strengths.push("Problem-solving depth and reasoning were strong.");
  else if (params.avgProblemSolving <= 4) weaknesses.push("Problem-solving steps and trade-offs were often unclear.");

  if (weaknesses.length === 0) weaknesses.push("Some answers could be more specific and backed by concrete examples.");

  improvement_suggestions.push(
    "Use a simple structure: context → approach → trade-offs → result.",
    "Add one concrete example (numbers, constraints, or impact) in each answer.",
  );

  const recommended_focus_areas = params.focusAreas
    ? params.focusAreas
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  return {
    overall_score: clamp0to10(round1(params.avgOverall)),
    technical_score: clamp0to10(round1(params.avgTechnical)),
    communication_score: clamp0to10(round1(params.avgCommunication)),
    problem_solving_score: clamp0to10(round1(params.avgProblemSolving)),
    strengths,
    weaknesses,
    improvement_suggestions,
    recommended_focus_areas,
  };
}

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "ai:report",
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as
    | {
        turns?: Array<{
          question?: string;
          answer?: string;
          evaluation?: {
            overall_score?: number;
            technical_score?: number;
            clarity_score?: number;
            confidence_score?: number;
            depth_score?: number;
          };
        }>;
        type?: InterviewType;
        role?: string;
        experience?: string;
        company?: string;
        focusAreas?: string;
      }
    | null;

  const turns = Array.isArray(body?.turns) ? body!.turns.slice(0, 50) : [];
  const type = (body?.type || "Technical") as InterviewType;
  const role = clampString(body?.role?.trim() || "", 120);
  const experience = clampString(body?.experience?.trim() || "", 40);
  const company = clampString(body?.company?.trim() || "", 80);
  const focusAreas = clampString(body?.focusAreas?.trim() || "", 600);

  const evals = turns
    .map((t) => t.evaluation)
    .filter(Boolean) as Array<NonNullable<(typeof turns)[number]["evaluation"]>>;

  const overallScores = evals.map((e) => Number(e.overall_score ?? 0)).filter((n) => Number.isFinite(n));
  const technicalScores = evals.map((e) => Number(e.technical_score ?? 0)).filter((n) => Number.isFinite(n));
  const clarityScores = evals.map((e) => Number(e.clarity_score ?? 0)).filter((n) => Number.isFinite(n));
  const confidenceScores = evals.map((e) => Number(e.confidence_score ?? 0)).filter((n) => Number.isFinite(n));
  const depthScores = evals.map((e) => Number(e.depth_score ?? 0)).filter((n) => Number.isFinite(n));

  const avgOverall = mean(overallScores);
  const avgTechnical = mean(technicalScores);
  const avgCommunication = mean([...clarityScores, ...confidenceScores]);
  const avgProblemSolving = mean(depthScores);

  if (turns.length === 0) {
    return Response.json(
      { ok: false, error: "No turns provided." },
      { status: 400 },
    );
  }

  const system = [
    interviewSimulatorSystemPrompt(),
    "",
    "You are generating the FINAL REPORT CARD for the completed interview.",
    "CRITICAL RULES:",
    "- Base your feedback ONLY on the provided transcript + computed scoring summary.",
    "- Do NOT invent projects/technologies/details the candidate did not explicitly mention.",
    "- Your scores MUST be consistent with the computed averages provided.",
    "- If the transcript shows incorrect/irrelevant answers, reflect that in weaknesses and suggested focus areas.",
    "Respond ONLY with valid JSON and no extra text.",
    "Use this exact schema:",
    "{",
    '  "overall_score": number,',
    '  "technical_score": number,',
    '  "communication_score": number,',
    '  "problem_solving_score": number,',
    '  "strengths": string[],',
    '  "weaknesses": string[],',
    '  "improvement_suggestions": string[],',
    '  "recommended_focus_areas": string[]',
    "}",
  ].join("\n");

  const user = [
    "Interview context:",
    `Type: ${type}`,
    role ? `Role: ${role}` : "",
    experience ? `Experience: ${experience}` : "",
    company ? `Company: ${company}` : "",
    focusAreas ? `Focus Areas: ${focusAreas}` : "",
    "",
    "Scoring summary (computed):",
    `Average overall score: ${round1(avgOverall)}/10`,
    `Average technical score: ${round1(avgTechnical)}/10`,
    `Average communication score (from clarity+confidence): ${round1(avgCommunication)}/10`,
    `Average problem-solving score (from depth): ${round1(avgProblemSolving)}/10`,
    "",
    "Transcript (latest first is fine):",
    JSON.stringify(
      turns.map((t) => ({
        question: t.question ?? "",
        answer: t.answer ?? "",
        evaluation: t.evaluation ?? null,
      })),
    ),
    "",
    "Create a concise report card. Keep items concrete and actionable.",
  ]
    .filter(Boolean)
    .join("\n");

  const ai = await llmText({
    system,
    user,
    models: {
      huggingface: process.env.HUGGINGFACE_MODEL_REPORT || process.env.HUGGINGFACE_MODEL_EVAL || process.env.HUGGINGFACE_MODEL,
      openai: process.env.OPENAI_MODEL,
    },
  });

  if (ai) {
    const parsed = safeJsonParse<FinalReport>(ai.text);
    if (parsed) {
      const normalized = normalizeReport(parsed, {
        avgOverall,
        avgTechnical,
        avgCommunication,
        avgProblemSolving,
      });
      return Response.json({ ok: true, report: normalized, source: ai.provider });
    }
  }

  return Response.json({
    ok: true,
    report: fallbackReport({
      avgOverall,
      avgTechnical,
      avgCommunication,
      avgProblemSolving,
      focusAreas,
    }),
    source: "fallback",
  });
}
