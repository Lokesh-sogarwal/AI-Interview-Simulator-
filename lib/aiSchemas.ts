/**
 * JSON Schemas for structured AI output (enforced by Gemini via
 * `responseJsonSchema`) plus the server-side checks applied to every reply,
 * whichever provider produced it. Field names match the stored documents.
 */

const score = { type: "number", minimum: 0, maximum: 10 } as const;
const text = { type: "string" } as const;
const list = { type: "array", items: { type: "string" }, maxItems: 8 } as const;

export const EVALUATION_FIELDS = ["technical_score", "clarity_score", "confidence_score", "depth_score", "english_fluency_score", "project_knowledge_score", "overall_score"] as const;

export const EVALUATION_SCHEMA = {
  type: "object",
  properties: {
    ...Object.fromEntries(EVALUATION_FIELDS.map((f) => [f, score])),
    strengths: text,
    weaknesses: text,
    improvement: text,
    ideal_answer: text,
  },
  // follow_up_question is no longer requested (the live interviewer writes its own follow-ups).
  required: [...EVALUATION_FIELDS, "strengths", "weaknesses", "improvement", "ideal_answer"],
} as const;

/** Several answers scored in one call: one entry per input item, matched by `id`. */
export const BATCH_EVALUATION_SCHEMA = {
  type: "object",
  properties: {
    evaluations: {
      type: "array",
      items: { ...EVALUATION_SCHEMA, properties: { id: { type: "integer" }, ...EVALUATION_SCHEMA.properties }, required: ["id", ...EVALUATION_SCHEMA.required] },
    },
  },
  required: ["evaluations"],
} as const;

export const REPORT_SCORE_FIELDS = ["technical_knowledge_score", "communication_skill_score", "confidence_score", "problem_solving_score", "english_fluency_score", "project_knowledge_score"] as const;

export const REPORT_SCHEMA = {
  type: "object",
  properties: {
    candidate_summary: text,
    ...Object.fromEntries(REPORT_SCORE_FIELDS.map((f) => [f, score])),
    strengths: list,
    weaknesses: list,
    improvement_suggestions: list,
    practice_topics: list,
    final_recommendation: { type: "string", enum: ["Hire", "No Hire"] },
  },
  required: ["candidate_summary", ...REPORT_SCORE_FIELDS, "strengths", "weaknesses", "improvement_suggestions", "practice_topics", "final_recommendation"],
} as const;

export const STAR_SCHEMA = {
  type: "object",
  properties: {
    star_used: { type: "boolean" },
    emotional_intelligence_score: score,
    structure_score: score,
    improvement_feedback: text,
  },
  required: ["star_used", "emotional_intelligence_score", "structure_score", "improvement_feedback"],
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** A score must be a real number on the 0–10 scale; strings like "7/10" or 0–100 scales are rejected. */
export function isScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10;
}

/**
 * True when an evaluation reply has every core score in range. Optional
 * dimensions (English fluency, project knowledge) may be missing from older
 * prompts/providers and are approximated by `normalizeEval`.
 */
export function isValidEvaluation(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const core = ["technical_score", "clarity_score", "confidence_score", "depth_score", "overall_score"];
  if (!core.every((f) => isScore(value[f]))) return false;
  return ["english_fluency_score", "project_knowledge_score"].every((f) => value[f] === undefined || value[f] === null || isScore(value[f]));
}

/** True when a report reply has a summary, all six scores in range and list fields as arrays. */
export function isValidReport(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  if (typeof value.candidate_summary !== "string" || !value.candidate_summary.trim()) return false;
  if (!REPORT_SCORE_FIELDS.every((f) => isScore(value[f]))) return false;
  return ["strengths", "weaknesses"].every((f) => Array.isArray(value[f]));
}
