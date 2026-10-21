import type { Db, Document, ObjectId } from "mongodb";

import { applyRelevanceCap, isNonsenseAnswer, normalizeEval, strictNonsenseEvaluation, type Evaluation } from "@/lib/evaluation";
import { evaluationSystemPrompt, evaluationUserPrompt } from "@/lib/prompts";
import { llmText } from "@/lib/llm";
import { safeJsonParse } from "@/lib/openai";
import { noAnswerEvaluation } from "@/lib/interviewRecords";
import { parseInterviewType } from "@/lib/interviewFlow";
import { answerBlock, emptyConversation, type ConversationState } from "@/lib/conversation";

export type EvaluatedTurn = {
  questionId: string;
  question: string;
  answer: string;
  exchange: string;
  evaluation: Evaluation | null;
  evaluationPending: boolean;
  evaluationSource?: string;
  projectRef?: unknown;
  evaluatedAt: Date | null;
};

/**
 * Scores one closed main question using its whole exchange (answer plus
 * follow-ups). Returns evaluation: null + evaluationPending when the AI
 * provider fails, so nothing is invented and the turn can be retried later.
 */
export async function evaluateQuestion(interview: Document, conv: ConversationState, questionId: string, resumeContext: string): Promise<EvaluatedTurn | null> {
  const q = conv.questions.find((x) => x.id === questionId);
  if (!q) return null;
  const block = answerBlock(conv, questionId);
  const base = { questionId, question: q.text, answer: block.answer, exchange: block.exchange, projectRef: q.projectRef ?? null };

  if (!block.answer.trim()) {
    return { ...base, evaluation: noAnswerEvaluation(), evaluationPending: false, evaluationSource: block.skipped ? "skipped" : "no_answer", evaluatedAt: new Date() };
  }
  if (isNonsenseAnswer(block.answer)) {
    return { ...base, evaluation: strictNonsenseEvaluation(), evaluationPending: false, evaluationSource: "guard", evaluatedAt: new Date() };
  }

  const type = parseInterviewType(interview.type, "Mixed");
  const ai = await llmText({
    system: evaluationSystemPrompt(),
    user: evaluationUserPrompt({
      question: q.text,
      // The full exchange lets follow-up answers count toward this question.
      answer: block.exchange.slice(0, 4000),
      type,
      role: String(interview.role ?? ""),
      experience: String(interview.experience ?? ""),
      company: String(interview.company ?? ""),
      focusAreas: String(interview.focusAreas ?? ""),
      resumeContext,
    }),
    maxTokens: 900,
    models: { huggingface: process.env.HUGGINGFACE_MODEL_EVAL || process.env.HUGGINGFACE_MODEL, openai: process.env.OPENAI_MODEL },
  }).catch(() => null);

  const parsed = ai ? safeJsonParse<Evaluation>(ai.text) : null;
  if (!ai || !parsed) return { ...base, evaluation: null, evaluationPending: true, evaluatedAt: null };
  const evaluation = applyRelevanceCap({ question: q.text, answer: block.answer, type, evaluation: normalizeEval(parsed) });
  return { ...base, evaluation, evaluationPending: false, evaluationSource: ai.provider, evaluatedAt: new Date() };
}

/** Inserts or replaces the turn for a question (keyed by questionId, so reruns never duplicate). */
export async function upsertTurn(db: Db, interviewId: ObjectId, userId: string, turn: EvaluatedTurn) {
  const interviews = db.collection("interviews");
  const set = await interviews.updateOne(
    { _id: interviewId, userId, "turns.questionId": turn.questionId },
    { $set: { "turns.$": { ...turn, answeredAt: new Date() }, updatedAt: new Date() } },
  );
  if (set.matchedCount === 0) {
    await interviews.updateOne(
      { _id: interviewId, userId, "turns.questionId": { $ne: turn.questionId } },
      { $push: { turns: { ...turn, answeredAt: new Date() } } as never, $set: { updatedAt: new Date() } },
    );
  }
}

/** Questions that are closed (or, at the end, still open) but have no successful evaluation yet. */
export function questionsNeedingEvaluation(doc: Document, includeOpen: boolean) {
  const conv = (doc.conversation as ConversationState | undefined) ?? emptyConversation();
  const turns = Array.isArray(doc.turns) ? (doc.turns as Array<{ questionId?: string; evaluationPending?: boolean }>) : [];
  return conv.questions
    .filter((q) => includeOpen || q.closedAt)
    .filter((q) => {
      const t = turns.find((x) => x.questionId === q.id);
      return !t || t.evaluationPending;
    })
    .filter((q) => conv.messages.some((m) => m.questionId === q.id && m.role === "candidate"))
    .map((q) => q.id);
}

export async function evaluateMany(db: Db, doc: Document & { _id: ObjectId }, userId: string, questionIds: string[], resumeContext: string) {
  const conv = (doc.conversation as ConversationState | undefined) ?? emptyConversation();
  const results = await Promise.all(questionIds.map((qid) => evaluateQuestion(doc, conv, qid, resumeContext)));
  for (const turn of results) if (turn) await upsertTurn(db, doc._id, userId, turn);
  return results.filter(Boolean) as EvaluatedTurn[];
}
