import type { Db, Document, ObjectId } from "mongodb";

import { applyRelevanceCap, isNonsenseAnswer, normalizeEval, strictNonsenseEvaluation, type Evaluation } from "@/lib/evaluation";
import { EVALUATION_SCHEMA, BATCH_EVALUATION_SCHEMA, isValidEvaluation } from "@/lib/aiSchemas";
import { batchEvaluationUserPrompt, evaluationSystemPrompt, evaluationUserPrompt } from "@/lib/prompts";
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
  /** The answer (or lack of one) was submitted by the answer timer. */
  timedOut?: boolean;
};

/** Output limits (the provider layer retries once with double room if a reply is cut off). */
const ANSWER_MAX_TOKENS = 320;
const BATCH_ITEM_MAX_TOKENS = 250;

const evalModels = () => ({ huggingface: process.env.HUGGINGFACE_MODEL_EVAL || process.env.HUGGINGFACE_MODEL, openai: process.env.OPENAI_MODEL });

function promptContext(interview: Document, resumeContext: string) {
  return {
    type: parseInterviewType(interview.type, "Mixed"),
    role: String(interview.role ?? ""),
    experience: String(interview.experience ?? ""),
    company: String(interview.company ?? ""),
    focusAreas: String(interview.focusAreas ?? ""),
    resumeContext,
  };
}

/** Validates a raw model evaluation and applies the deterministic guards; null when unusable. */
function finishEvaluation(interview: Document, input: { question: string; answer: string }, raw: unknown): Evaluation | null {
  if (!isValidEvaluation(raw)) return null;
  const type = parseInterviewType(interview.type, "Mixed");
  return applyRelevanceCap({ question: input.question, answer: input.answer, type, evaluation: normalizeEval(raw as Evaluation) });
}

export type AnswerInput = { question: string; answer: string; promptAnswer?: string };
type Scored = { evaluation: Evaluation; source: string };

/**
 * Scores one answer with the AI evaluator (plus the nonsense and relevance
 * guards). `promptAnswer` is what the model sees, e.g. the full exchange with
 * follow-ups. Returns null when the provider fails or returns unusable output,
 * so callers never invent a score.
 */
export async function scoreAnswer(interview: Document, input: AnswerInput, resumeContext: string, opts: { freeOnly?: boolean } = {}): Promise<Scored | null> {
  if (isNonsenseAnswer(input.answer)) return { evaluation: strictNonsenseEvaluation(), source: "guard" };

  const ai = await llmText({
    system: evaluationSystemPrompt(),
    user: evaluationUserPrompt({ ...promptContext(interview, resumeContext), question: input.question, answer: (input.promptAnswer ?? input.answer).slice(0, 4000) }),
    // Measured ~250 output tokens for one evaluation on Gemini Flash.
    maxTokens: ANSWER_MAX_TOKENS,
    task: "evaluation",
    jsonSchema: EVALUATION_SCHEMA,
    freeOnly: opts.freeOnly,
    models: evalModels(),
  }).catch(() => null);

  const evaluation = ai ? finishEvaluation(interview, input, safeJsonParse<unknown>(ai.text)) : null;
  return ai && evaluation ? { evaluation, source: ai.provider } : null;
}

const BATCH_SIZE = 6;

/**
 * Scores several answers with one AI call per batch (same rubric and guards
 * as `scoreAnswer`), which keeps re-evaluation inside free-tier request
 * quotas. Items the batch reply misses or gets wrong are retried once on
 * their own. Result order matches `items`; null marks an answer that could
 * not be scored. `providerFailures` counts batches the provider didn't answer
 * at all (as opposed to answering with unusable output).
 */
export async function scoreAnswers(
  interview: Document,
  items: AnswerInput[],
  resumeContext: string,
  opts: { freeOnly?: boolean } = {},
): Promise<{ results: Array<Scored | null>; providerFailures: number }> {
  let providerFailures = 0;
  const results: Array<Scored | null> = items.map((it) => (isNonsenseAnswer(it.answer) ? { evaluation: strictNonsenseEvaluation(), source: "guard" } : null));
  const todo = items.map((_, i) => i).filter((i) => !results[i]);
  const batches: number[][] = [];
  for (let i = 0; i < todo.length; i += BATCH_SIZE) batches.push(todo.slice(i, i + BATCH_SIZE));

  await Promise.all(
    batches.map(async (batch) => {
      const ai = await llmText({
        system: evaluationSystemPrompt(),
        user: batchEvaluationUserPrompt({
          ...promptContext(interview, resumeContext),
          items: batch.map((i) => ({ id: i + 1, question: items[i].question, answer: (items[i].promptAnswer ?? items[i].answer).slice(0, 4000) })),
        }),
        // Measured ~195 output tokens per answer in a batch.
        maxTokens: BATCH_ITEM_MAX_TOKENS * batch.length + 60,
        task: "evaluation",
        jsonSchema: BATCH_EVALUATION_SCHEMA,
        freeOnly: opts.freeOnly,
        models: evalModels(),
      }).catch(() => null);
      if (!ai) {
        providerFailures += 1; // provider down: retrying item by item would only burn quota
        return;
      }
      const parsed = safeJsonParse<{ evaluations?: unknown }>(ai.text);
      const list = Array.isArray(parsed?.evaluations) ? (parsed.evaluations as Array<Record<string, unknown>>) : [];
      for (const i of batch) {
        const raw = list.find((e) => e && Number(e.id) === i + 1);
        const evaluation = raw ? finishEvaluation(interview, items[i], raw) : null;
        results[i] = evaluation ? { evaluation, source: ai.provider } : await scoreAnswer(interview, items[i], resumeContext, opts);
      }
    }),
  );
  return { results, providerFailures };
}

/**
 * Scores one closed main question using its whole exchange (answer plus
 * follow-ups). Returns evaluation: null + evaluationPending when the AI
 * provider fails, so nothing is invented and the turn can be retried later.
 */
export async function evaluateQuestion(interview: Document, conv: ConversationState, questionId: string, resumeContext: string): Promise<EvaluatedTurn | null> {
  const q = conv.questions.find((x) => x.id === questionId);
  if (!q) return null;
  const block = answerBlock(conv, questionId);
  const base = { questionId, question: q.text, answer: block.answer, exchange: block.exchange, projectRef: q.projectRef ?? null, ...(block.timedOut ? { timedOut: true } : {}) };

  if (!block.answer.trim()) {
    return { ...base, evaluation: noAnswerEvaluation(), evaluationPending: false, evaluationSource: block.timedOut ? "timed_out" : block.skipped ? "skipped" : "no_answer", evaluatedAt: new Date() };
  }

  // The full exchange lets follow-up answers count toward this question.
  const scored = await scoreAnswer(interview, { question: q.text, answer: block.answer, promptAnswer: block.exchange }, resumeContext);
  if (!scored) return { ...base, evaluation: null, evaluationPending: true, evaluatedAt: null };
  return { ...base, evaluation: scored.evaluation, evaluationPending: false, evaluationSource: scored.source, evaluatedAt: new Date() };
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
