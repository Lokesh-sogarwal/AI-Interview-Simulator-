import { randomUUID } from "crypto";

import { getCurrentUser } from "@/lib/auth";
import { scoreAnswers } from "@/lib/conversationEval";
import { generateFinalReport } from "@/lib/finalReport";
import { jsonError, toObjectId } from "@/lib/http";
import { averageOverallScore } from "@/lib/interviewRecords";
import { MAX_REEVALUATIONS, REEVALUATION_LIMIT_MESSAGE, reevaluationsLeft } from "@/lib/reevaluation";
import { isClosedStatus, parseInterviewType } from "@/lib/interviewFlow";
import { aiFailureDetail, aiUnavailableResponse, hasFreeLLMProvider } from "@/lib/llm";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { interviewResumeContext } from "@/lib/resumeStore";
import { clampString } from "@/lib/validators";

// Re-evaluation is user-triggered and repeatable, so it only ever uses free models: Gemini's
// free tier when GEMINI_API_KEY is set, otherwise OpenRouter ":free" models. Answers are
// scored in batches, so a typical run is two AI calls (answers + report).
const FREE_ONLY = { freeOnly: true } as const;

export const maxDuration = 60;

/** A run older than this is assumed to have died and may be taken over. */
const LOCK_TTL_MS = 2 * 60_000;

const LIMIT_MESSAGE = REEVALUATION_LIMIT_MESSAGE;

/*
 * Re-evaluation state, stored on the interview document:
 *
 *   available  reevaluationsUsed < 1, no `reevaluation` lock
 *     │  POST: atomic updateOne(used < 1 AND no live lock) sets
 *     │  reevaluation = { requestId, startedAt }          (the reservation)
 *     ▼
 *   running ──── failure (AI, invalid output, DB error) ──► available
 *     │           the lock is removed; used stays 0, reevaluationStatus = "failed"
 *     │           (a crashed run's lock expires after LOCK_TTL_MS and can be taken over)
 *     │
 *     │  one atomic updateOne(lock still ours AND used < 1) that writes the new
 *     │  evaluations + report, $inc reevaluationsUsed, removes the lock
 *     ▼
 *   used       reevaluationsUsed = 1, reevaluationStatus = "succeeded": every later POST → 409
 *
 * Concurrent POSTs: only one can win the reservation; the rest get 409. Even a
 * run whose lock was taken over cannot double-count, because the final write
 * requires both its own requestId and used < 1.
 */
const underLimit = { $or: [{ reevaluationsUsed: { $exists: false } }, { reevaluationsUsed: { $lt: MAX_REEVALUATIONS } }] };
const usedUp = (doc: Record<string, unknown> | null) => reevaluationsLeft(doc) === 0;

type StoredTurn = { question?: unknown; answer?: unknown; exchange?: unknown; evaluation?: unknown; [key: string]: unknown };

function logReevaluate(level: "info" | "warn" | "error", requestId: string, stage: string, fields: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ scope: "interviews.reevaluate", requestId, stage, ...fields }));
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Re-runs the AI evaluation of every saved answer of a finished interview and
 * regenerates its report. All-or-nothing: the stored evaluations and report are
 * replaced only when every answer and the report were produced successfully,
 * so a failure always leaves the last good result in place.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get("x-vercel-id") || randomUUID();
  const fail = (status: number, code: string, error: string, extra?: Record<string, unknown>) =>
    jsonError(error, status, { code, requestId, ...(extra ?? {}) });

  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);

  const rl = rateLimit(request, { keyPrefix: "interviews:reevaluate", key: user.id, limit: 5, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const { id } = await context.params;
  const oid = toObjectId(id);
  if (!oid) return fail(400, "invalid_interview_id", "Invalid interview id.");

  if (!hasFreeLLMProvider()) {
    return fail(503, "ai_not_configured", "Re-evaluation needs a free AI model, which isn't configured on this server.");
  }

  const db = await getDb();
  if (!db) return fail(503, "db_unavailable", dbUnavailableMessage(), { retryable: true });

  const interviews = db.collection("interviews");
  // Ownership is part of every query; the user id comes from the session only.
  const filter = { _id: oid, userId: user.id };
  let lockTaken = false;
  let failure: string | null = null;

  try {
    const doc = await interviews.findOne(filter);
    if (!doc) {
      logReevaluate("warn", requestId, "lookup", { interviewId: id, outcome: "not_found" });
      return fail(404, "not_found", "Interview not found.");
    }
    if (doc.status !== undefined && doc.status !== null && !isClosedStatus(doc.status)) {
      return fail(409, "interview_not_finished", "Finish the interview before re-evaluating it.");
    }
    if (usedUp(doc)) {
      logReevaluate("warn", requestId, "limit", { interviewId: id, outcome: "limit_reached" });
      return fail(409, "reevaluation_limit_reached", LIMIT_MESSAGE, { remaining: 0 });
    }

    // Older records stored the answers under `transcript`; write back to the same field.
    const field = Array.isArray(doc.turns) && doc.turns.length ? "turns" : Array.isArray(doc.transcript) ? "transcript" : "turns";
    const turns = (Array.isArray(doc[field]) ? doc[field] : []) as StoredTurn[];
    const answered = turns.filter((t) => t && typeof t === "object" && str(t.answer)).length;
    logReevaluate("info", requestId, "lookup", { interviewId: id, outcome: "found", turns: turns.length, answered });
    if (answered === 0) {
      return fail(422, "no_answers", "No answers were recorded in this interview, so there is nothing to re-evaluate.");
    }

    // Reserve the single allowance atomically: only one request can hold it at a time.
    const now = new Date();
    const lock = await interviews.updateOne(
      { ...filter, $and: [underLimit, { $or: [{ reevaluation: null }, { "reevaluation.startedAt": { $lt: new Date(now.getTime() - LOCK_TTL_MS) } }] }] },
      { $set: { reevaluation: { requestId, startedAt: now }, reevaluationStatus: "running", reevaluationAttemptedAt: now } },
    );
    if (lock.matchedCount === 0) {
      // Either the allowance was just used by a concurrent request, or one is running now.
      const current = await interviews.findOne(filter, { projection: { reevaluationsUsed: 1 } });
      if (usedUp(current)) return fail(409, "reevaluation_limit_reached", LIMIT_MESSAGE, { remaining: 0 });
      logReevaluate("warn", requestId, "lock", { interviewId: id, outcome: "busy" });
      return fail(409, "reevaluation_in_progress", "This interview is already being re-evaluated. Please wait a moment.", { retryable: true });
    }
    lockTaken = true;
    failure = "unknown";

    const resume = await interviewResumeContext(db, doc);
    // Unanswered and skipped questions keep their deterministic zero score; the rest are re-scored in batches.
    const toScore = turns.map((t, i) => ({ i, answer: str(t?.answer) })).filter((x) => x.answer);
    const { results: scored, providerFailures } = await scoreAnswers(
      doc,
      toScore.map(({ i, answer }) => ({ question: str(turns[i].question), answer, promptAnswer: str(turns[i].exchange) || undefined })),
      resume.context,
      FREE_ONLY,
    );
    const failed = scored.filter((r) => r === null).length;
    if (failed) {
      const reason = aiFailureDetail().reason;
      logReevaluate("error", requestId, "evaluate", { outcome: providerFailures ? "provider_failed" : "invalid_output", failed, answered, reason });
      failure = providerFailures ? "provider_failed" : "invalid_output";
      return providerFailures
        ? aiUnavailableResponse("Re-evaluation")
        : fail(502, "ai_invalid_output", `The AI couldn't produce a valid evaluation for ${failed} of ${answered} answers. Your previous report is unchanged; please try again.`, { retryable: true });
    }
    const newTurns = turns.map((t) => ({ ...t }));
    toScore.forEach(({ i }, k) => {
      const r = scored[k]!;
      newTurns[i] = { ...turns[i], evaluation: r.evaluation, evaluationPending: false, evaluationSource: r.source, evaluatedAt: now };
    });

    const outcome = await generateFinalReport(newTurns as Parameters<typeof generateFinalReport>[0], {
      type: parseInterviewType(doc.type, "Technical"),
      role: clampString(str(doc.role), 120),
      experience: clampString(str(doc.experience), 40),
      company: clampString(str(doc.company), 80),
      focusAreas: clampString(str(doc.focusAreas), 600),
    }, FREE_ONLY);
    if (!outcome.ok) {
      logReevaluate("error", requestId, "report", { outcome: outcome.reason, provider: outcome.provider ?? null });
      failure = outcome.reason;
      return outcome.reason === "provider_unavailable"
        ? aiUnavailableResponse("Re-evaluation")
        : fail(502, "ai_invalid_output", "The AI returned an unusable report. Your previous report is unchanged; please try again.", { retryable: true });
    }

    const averageScore = averageOverallScore(newTurns as Array<{ evaluation?: { overall_score?: unknown } | null }>);
    const evaluatedAt = new Date();
    // Only the evaluation fields change; questions, answers and metadata are copied as stored.
    // Saving the result and consuming the allowance is one atomic write.
    const saved = await interviews.updateOne(
      { ...filter, "reevaluation.requestId": requestId, ...underLimit },
      {
        $set: {
          reevaluationStatus: "succeeded",
          reevaluatedAt: evaluatedAt,
          [field]: newTurns,
          averageScore,
          unevaluatedCount: 0,
          finalReport: outcome.report,
          reportSource: outcome.provider,
          reportGeneratedAt: evaluatedAt,
          lastEvaluatedAt: evaluatedAt,
          updatedAt: evaluatedAt,
        },
        $inc: { evaluationVersion: 1, reevaluationsUsed: 1 },
        $unset: { reevaluation: "" },
      },
    );
    if (saved.matchedCount === 0) {
      // Our run outlived its lock and another one took over; let that one win.
      logReevaluate("warn", requestId, "save", { outcome: "lock_lost" });
      failure = null; // the other run owns the state now
      return fail(409, "reevaluation_in_progress", "Another re-evaluation replaced this one. Reload to see the latest report.", { retryable: true });
    }
    lockTaken = false;
    failure = null;

    logReevaluate("info", requestId, "save", { outcome: "ok", provider: outcome.provider, answered });
    return Response.json({ ok: true, report: outcome.report, averageScore, evaluatedAt: evaluatedAt.toISOString(), source: outcome.provider, remaining: 0 });
  } catch (e) {
    logReevaluate("error", requestId, "unexpected", { error: e instanceof Error ? e.name : "unknown" });
    return fail(500, "internal_error", "Something went wrong while re-evaluating. Your previous report is unchanged.", { retryable: true });
  } finally {
    // Definitive failure: release the reservation so the user can retry; the allowance is not consumed.
    if (lockTaken) {
      await interviews
        .updateOne(
          { _id: oid, "reevaluation.requestId": requestId },
          { $unset: { reevaluation: "" }, $set: { reevaluationStatus: "failed", reevaluationFailure: failure ?? "unknown" } },
        )
        .catch(() => undefined);
    }
  }
}
