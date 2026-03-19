import { llmText } from "@/lib/llm";
import { safeJsonParse } from "@/lib/openai";
import {
  interviewSimulatorSystemPrompt,
  type InterviewType,
} from "@/lib/prompts";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";

export type FinalReport = {
  candidate_summary: string;
  technical_knowledge_score: number;
  communication_skill_score: number;
  confidence_score: number;
  problem_solving_score: number;
  english_fluency_score: number;
  project_knowledge_score: number;
  strengths: string[];
  weaknesses: string[];
  final_recommendation: "Hire" | "No Hire";
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

function normalizeReport(
  report: FinalReport,
  computed: {
    avgTechnicalKnowledge: number;
    avgCommunicationSkill: number;
    avgConfidence: number;
    avgProblemSolving: number;
    avgEnglishFluency: number;
    avgProjectKnowledge: number;
  },
): FinalReport {
  const avgTechnicalKnowledge = clamp0to10(round1(computed.avgTechnicalKnowledge));
  const avgCommunicationSkill = clamp0to10(round1(computed.avgCommunicationSkill));
  const avgConfidence = clamp0to10(round1(computed.avgConfidence));
  const avgProblemSolving = clamp0to10(round1(computed.avgProblemSolving));
  const avgEnglishFluency = clamp0to10(round1(computed.avgEnglishFluency));
  const avgProjectKnowledge = clamp0to10(round1(computed.avgProjectKnowledge));

  const technical = clamp0to10(
    Number(report.technical_knowledge_score ?? avgTechnicalKnowledge),
  );
  const communication = clamp0to10(
    Number(report.communication_skill_score ?? avgCommunicationSkill),
  );
  const confidence = clamp0to10(Number(report.confidence_score ?? avgConfidence));
  const problemSolving = clamp0to10(
    Number(report.problem_solving_score ?? avgProblemSolving),
  );
  const english = clamp0to10(
    Number(report.english_fluency_score ?? avgEnglishFluency),
  );
  const project = clamp0to10(
    Number(report.project_knowledge_score ?? avgProjectKnowledge),
  );

  const strengths = Array.isArray(report.strengths)
    ? report.strengths.map(String).filter(Boolean).slice(0, 8)
    : [];
  const weaknesses = Array.isArray(report.weaknesses)
    ? report.weaknesses.map(String).filter(Boolean).slice(0, 8)
    : [];
  const summary =
    typeof report.candidate_summary === "string" ? report.candidate_summary.trim() : "";

  const recommendation =
    report.final_recommendation === "Hire" || report.final_recommendation === "No Hire"
      ? report.final_recommendation
      : null;

  // Guard against inflated scores: if model returns numbers far above computed averages,
  // snap scores back to computed values.
  const snapIfTooHigh = (val: number, computedVal: number) =>
    val - computedVal >= 1.5 ? computedVal : val;

  const derivedAvg = mean([technical, communication, confidence, problemSolving, english, project]);
  const derivedRecommendation: FinalReport["final_recommendation"] =
    derivedAvg >= 6.8 && technical >= 6 && communication >= 6 ? "Hire" : "No Hire";

  return {
    candidate_summary:
      summary || "Candidate summary not available from transcript.",
    technical_knowledge_score: snapIfTooHigh(technical, avgTechnicalKnowledge),
    communication_skill_score: snapIfTooHigh(communication, avgCommunicationSkill),
    confidence_score: snapIfTooHigh(confidence, avgConfidence),
    problem_solving_score: snapIfTooHigh(problemSolving, avgProblemSolving),
    english_fluency_score: snapIfTooHigh(english, avgEnglishFluency),
    project_knowledge_score: snapIfTooHigh(project, avgProjectKnowledge),
    strengths,
    weaknesses,
    final_recommendation: recommendation ?? derivedRecommendation,
  };
}

function fallbackReport(params: {
  avgTechnicalKnowledge: number;
  avgCommunicationSkill: number;
  avgConfidence: number;
  avgProblemSolving: number;
  avgEnglishFluency: number;
  avgProjectKnowledge: number;
}): FinalReport {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const avg = mean([
    params.avgTechnicalKnowledge,
    params.avgCommunicationSkill,
    params.avgConfidence,
    params.avgProblemSolving,
    params.avgEnglishFluency,
    params.avgProjectKnowledge,
  ]);

  if (avg >= 7) strengths.push("You maintained a strong overall performance across questions.");
  else if (avg >= 5) strengths.push("You covered the core points, with room to improve depth and clarity.");
  else strengths.push("You showed effort, but answers often lacked clarity and specificity.");

  if (params.avgTechnicalKnowledge >= 7) strengths.push("Technical knowledge was generally solid.");
  else if (params.avgTechnicalKnowledge <= 4) weaknesses.push("Technical explanations were often shallow or inaccurate.");

  if (params.avgCommunicationSkill >= 7) strengths.push("Communication was clear and professional.");
  else if (params.avgCommunicationSkill <= 4) weaknesses.push("Communication lacked structure or clarity.");

  if (params.avgProblemSolving >= 7) strengths.push("Problem-solving depth and reasoning were strong.");
  else if (params.avgProblemSolving <= 4) weaknesses.push("Problem-solving steps and trade-offs were often unclear.");

  if (weaknesses.length === 0) weaknesses.push("Some answers could be more specific and backed by concrete examples.");

  const final_recommendation: FinalReport["final_recommendation"] =
    avg >= 6.8 && params.avgTechnicalKnowledge >= 6 && params.avgCommunicationSkill >= 6
      ? "Hire"
      : "No Hire";

  return {
    candidate_summary:
      "Based on the transcript, the candidate showed their current level of knowledge and communication under interview conditions.",
    technical_knowledge_score: clamp0to10(round1(params.avgTechnicalKnowledge)),
    communication_skill_score: clamp0to10(round1(params.avgCommunicationSkill)),
    confidence_score: clamp0to10(round1(params.avgConfidence)),
    problem_solving_score: clamp0to10(round1(params.avgProblemSolving)),
    english_fluency_score: clamp0to10(round1(params.avgEnglishFluency)),
    project_knowledge_score: clamp0to10(round1(params.avgProjectKnowledge)),
    strengths,
    weaknesses,
    final_recommendation,
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
            english_fluency_score?: number;
            project_knowledge_score?: number;
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
  const englishScores = evals
    .map((e) => Number(e.english_fluency_score ?? 0))
    .filter((n) => Number.isFinite(n));
  const projectScores = evals
    .map((e) => Number(e.project_knowledge_score ?? 0))
    .filter((n) => Number.isFinite(n));

  const avgOverall = mean(overallScores);
  const avgTechnicalKnowledge = mean(technicalScores);
  const avgCommunicationSkill = mean([...clarityScores, ...confidenceScores]);
  const avgConfidence = mean(confidenceScores);
  const avgProblemSolving = mean(depthScores);
  const avgEnglishFluency = mean(englishScores);
  const avgProjectKnowledge = mean(projectScores);

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
    '  "candidate_summary": string,',
    '  "technical_knowledge_score": number,',
    '  "communication_skill_score": number,',
    '  "confidence_score": number,',
    '  "problem_solving_score": number,',
    '  "english_fluency_score": number,',
    '  "project_knowledge_score": number,',
    '  "strengths": string[],',
    '  "weaknesses": string[],',
    '  "final_recommendation": "Hire" | "No Hire"',
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
    `Average technical knowledge score: ${round1(avgTechnicalKnowledge)}/10`,
    `Average communication skill score (from clarity+confidence): ${round1(avgCommunicationSkill)}/10`,
    `Average confidence score: ${round1(avgConfidence)}/10`,
    `Average problem-solving score (from depth): ${round1(avgProblemSolving)}/10`,
    `Average English fluency score: ${round1(avgEnglishFluency)}/10`,
    `Average project knowledge score: ${round1(avgProjectKnowledge)}/10`,
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
    "Recommendation rule of thumb:",
    "- If multiple answers are incorrect/irrelevant or communication is weak, recommend No Hire.",
    "- Recommend Hire only if technical knowledge AND communication are both strong enough for the stated experience level.",
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
        avgTechnicalKnowledge,
        avgCommunicationSkill,
        avgConfidence,
        avgProblemSolving,
        avgEnglishFluency,
        avgProjectKnowledge,
      });
      return Response.json({ ok: true, report: normalized, source: ai.provider });
    }
  }

  return Response.json({
    ok: true,
    report: fallbackReport({
      avgTechnicalKnowledge,
      avgCommunicationSkill,
      avgConfidence,
      avgProblemSolving,
      avgEnglishFluency,
      avgProjectKnowledge,
    }),
    source: "fallback",
  });
}
