import { REPORT_SCHEMA, isValidReport } from "@/lib/aiSchemas";
import { llmText, type LLMProvider } from "@/lib/llm";
import { safeJsonParse } from "@/lib/openai";
import type { InterviewType } from "@/lib/prompts";

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
  /** Added with the Gemini reports; older stored reports may not have them. */
  improvement_suggestions?: string[];
  practice_topics?: string[];
  final_recommendation: "Hire" | "No Hire";
};

const stringList = (value: unknown) => (Array.isArray(value) ? value.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 8) : []);

function clamp0to10(value: number) {
  if (!Number.isFinite(value)) return 0;
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

  const strengths = stringList(report.strengths);
  const weaknesses = stringList(report.weaknesses);
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
    improvement_suggestions: stringList(report.improvement_suggestions),
    practice_topics: stringList(report.practice_topics),
    final_recommendation: recommendation ?? derivedRecommendation,
  };
}

export type ReportTurn = {
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
  } | null;
};

export type ReportContext = { type: InterviewType; role: string; experience: string; company: string; focusAreas: string };

export type ReportOutcome =
  | { ok: true; report: FinalReport; provider: LLMProvider }
  | { ok: false; reason: "provider_unavailable" | "malformed_output"; provider?: LLMProvider };

/**
 * Asks the AI for the final report card over the given (already evaluated)
 * turns and validates the result. Scores are normalised against the averages
 * of the per-answer evaluations; nothing is templated when the AI fails.
 */
export async function generateFinalReport(turns: ReportTurn[], ctx: ReportContext, opts: { freeOnly?: boolean } = {}): Promise<ReportOutcome> {
  const { type, role, experience, company, focusAreas } = ctx;
  const evals = turns
    .map((t) => t.evaluation)
    .filter((e): e is NonNullable<ReportTurn["evaluation"]> => Boolean(e) && typeof e === "object");

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
  const system = [
    "You write the FINAL REPORT CARD for a completed mock interview.",
    "- Use only the transcript and the computed scores below; never invent projects, technologies or details.",
    "- Your scores must stay consistent with the computed averages.",
    "- Reflect incorrect or irrelevant answers in weaknesses and practice topics.",
    "- Be concise: candidate_summary at most 3 sentences; each list 2-5 items of under 15 words. Do not restate questions or answers.",
    "- Recommend No Hire if several answers are incorrect/irrelevant or communication is weak; Hire only if technical knowledge and communication both fit the experience level.",
    "Output JSON only:",
    '{"candidate_summary": "", "technical_knowledge_score": n, "communication_skill_score": n, "confidence_score": n, "problem_solving_score": n, "english_fluency_score": n, "project_knowledge_score": n, "strengths": [], "weaknesses": [], "improvement_suggestions": [], "practice_topics": [], "final_recommendation": "Hire" | "No Hire"}',
  ].join("\n");

  // One compact block per answer: the scores plus the short feedback, not the full stored evaluation.
  const clip = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const transcript = turns.map((t, i) => {
    const e = t.evaluation as (ReportTurn["evaluation"] & { strengths?: unknown; weaknesses?: unknown }) | null | undefined;
    const scores = e ? `overall ${e.overall_score ?? "?"}; technical ${e.technical_score ?? "?"}, clarity ${e.clarity_score ?? "?"}, confidence ${e.confidence_score ?? "?"}, depth ${e.depth_score ?? "?"}` : "not evaluated";
    const notes = e ? [clip(e.strengths, 160) && `+ ${clip(e.strengths, 160)}`, clip(e.weaknesses, 160) && `- ${clip(e.weaknesses, 160)}`].filter(Boolean).join(" ") : "";
    return [`Q${i + 1} [${scores}]: ${clip(t.question, 220)}`, `A: ${clip(t.answer, 500) || "(no answer)"}`, notes].filter(Boolean).join("\n");
  });

  const prompt = [
    [`Type: ${type}`, role && `Role: ${role}`, experience && `Experience: ${experience}`, company && `Company: ${company}`, focusAreas && `Focus: ${focusAreas}`].filter(Boolean).join(". "),
    `Computed averages (0-10): overall ${round1(avgOverall)}, technical ${round1(avgTechnicalKnowledge)}, communication ${round1(avgCommunicationSkill)}, confidence ${round1(avgConfidence)}, problem solving ${round1(avgProblemSolving)}, English ${round1(avgEnglishFluency)}, project knowledge ${round1(avgProjectKnowledge)}.`,
    "Answers:",
    transcript.join("\n\n"),
  ].join("\n");

  const ai = await llmText({
    system,
    user: prompt,
    // ~500-800 tokens of JSON; the provider layer retries once with more room if it is cut off.
    maxTokens: 800,
    task: "evaluation",
    jsonSchema: REPORT_SCHEMA,
    freeOnly: opts.freeOnly,
    models: {
      huggingface: process.env.HUGGINGFACE_MODEL_REPORT || process.env.HUGGINGFACE_MODEL_EVAL || process.env.HUGGINGFACE_MODEL,
      openai: process.env.OPENAI_MODEL,
    },
  }).catch(() => null);

  if (!ai) return { ok: false, reason: "provider_unavailable" };
  const parsed = safeJsonParse<FinalReport>(ai.text);
  if (!isValidReport(parsed)) {
    return { ok: false, reason: "malformed_output", provider: ai.provider };
  }
  return {
    ok: true,
    provider: ai.provider,
    report: normalizeReport(parsed, {
      avgTechnicalKnowledge,
      avgCommunicationSkill,
      avgConfidence,
      avgProblemSolving,
      avgEnglishFluency,
      avgProjectKnowledge,
    }),
  };
}
