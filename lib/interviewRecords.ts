import { createHash } from "crypto";
import type { Collection, Document, ObjectId } from "mongodb";

import type { Evaluation } from "@/lib/evaluation";

/** Stable key linking a server-side evaluation to the turn it belongs to. */
export function turnKey(question: string, answer: string) {
  return createHash("sha256").update(`${question.trim()}\u0000${answer.trim()}`).digest("hex");
}

/** Deterministic zero score for questions that timed out without an answer. */
export function noAnswerEvaluation(): Evaluation {
  return {
    technical_score: 0,
    clarity_score: 0,
    confidence_score: 0,
    depth_score: 0,
    english_fluency_score: 0,
    project_knowledge_score: 0,
    overall_score: 0,
    strengths: "No strengths to assess because no answer was provided.",
    weaknesses: "No answer was provided within the allotted time.",
    improvement: "Answer directly with a clear structure and one concrete example.",
    ideal_answer: "A strong answer addresses the question directly, includes an example, and explains trade-offs.",
    follow_up_question: "",
  };
}

type PendingEvaluation = { key: string; evaluation: Evaluation; createdAt: Date };

/**
 * Remembers an evaluation produced by the server so the turn endpoint can store
 * it without trusting scores sent back by the browser.
 */
export async function rememberEvaluation(
  interviews: Collection<Document>,
  filter: { _id: ObjectId; userId: string },
  key: string,
  evaluation: Evaluation,
) {
  const entry: PendingEvaluation = { key, evaluation, createdAt: new Date() };
  await interviews.updateOne(
    { ...filter, status: { $nin: ["completed", "terminated"] } },
    { $push: { pendingEvaluations: { $each: [entry], $slice: -20 } } } as Document,
  );
}

export function findPendingEvaluation(doc: Document | null, key: string): Evaluation | null {
  const list = Array.isArray(doc?.pendingEvaluations) ? (doc.pendingEvaluations as PendingEvaluation[]) : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.key === key) return list[i].evaluation;
  }
  return null;
}

export function averageOverallScore(turns: Array<{ evaluation?: { overall_score?: unknown } | null }>) {
  const scores = turns
    .map((t) => Number(t?.evaluation?.overall_score))
    .filter((n) => Number.isFinite(n));
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}
