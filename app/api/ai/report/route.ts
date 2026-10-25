import { randomUUID } from "crypto";

import { getCurrentUser } from "@/lib/auth";
import { generateFinalReport, type ReportTurn } from "@/lib/finalReport";
import { aiFailureDetail, aiUnavailableResponse } from "@/lib/llm";
import { jsonError, readJsonObject, toObjectId } from "@/lib/http";
import { isClosedStatus, parseInterviewType } from "@/lib/interviewFlow";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";

export type { FinalReport } from "@/lib/finalReport";

type ReportBody = { interviewId?: unknown };

/**
 * One structured log line per stage. Only ids, counts and outcome categories
 * are logged — never transcripts, answers or credentials.
 */
function logReport(level: "info" | "warn" | "error", requestId: string, stage: string, fields: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ scope: "ai.report", requestId, stage, ...fields }));
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asTurns(value: unknown): ReportTurn[] {
  return (Array.isArray(value) ? value : []).filter((t): t is ReportTurn => Boolean(t) && typeof t === "object").slice(0, 50);
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-vercel-id") || randomUUID();
  const fail = (status: number, code: string, error: string, extra?: Record<string, unknown>) =>
    jsonError(error, status, { code, requestId, ...(extra ?? {}) });

  try {
    const user = await getCurrentUser();
    if (!user) {
      logReport("warn", requestId, "auth", { outcome: "unauthenticated" });
      return jsonError("Unauthorized", 401);
    }

    const rl = rateLimit(request, {
      keyPrefix: "ai:report",
      key: user.id,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!rl.ok) {
      logReport("warn", requestId, "rate_limit", { outcome: "limited" });
      return rateLimitResponse(rl.resetAt);
    }

    const body = await readJsonObject<ReportBody>(request);
    if (!body) {
      logReport("warn", requestId, "validation", { outcome: "invalid_body" });
      return fail(400, "invalid_body", "Request body must be a JSON object.");
    }

    const hasInterviewId = body.interviewId !== undefined && body.interviewId !== null && body.interviewId !== "";
    const interviewOid = hasInterviewId ? toObjectId(body.interviewId) : null;
    if (hasInterviewId && !interviewOid) {
      logReport("warn", requestId, "validation", { outcome: "invalid_interview_id" });
      return fail(400, "invalid_interview_id", "Invalid interview id.");
    }
    // Reports are only generated for saved interviews, from the stored, server-evaluated
    // record; answers or scores sent by the browser are never used.
    if (!interviewOid) {
      logReport("warn", requestId, "validation", { outcome: "missing_interview_id" });
      return fail(400, "missing_interview_id", "interviewId is required.");
    }
    const db = await getDb();
    if (!db) {
      logReport("error", requestId, "db", { outcome: "unavailable" });
      return fail(503, "db_unavailable", dbUnavailableMessage(), { retryable: true });
    }
    const interviews = db.collection("interviews");
    const stored = await interviews.findOne(
      { _id: interviewOid, userId: user.id },
      { projection: { turns: 1, transcript: 1, status: 1, type: 1, role: 1, experience: 1, company: 1, focusAreas: 1, finalReport: 1, reportSource: 1 } },
    );
    if (!stored) {
      logReport("warn", requestId, "lookup", { interviewId: interviewOid.toHexString(), outcome: "not_found" });
      return fail(404, "not_found", "Interview not found.");
    }
    // Legacy records may have no status; those predate the finish step and are treated as complete.
    if (stored.status !== undefined && stored.status !== null && !isClosedStatus(stored.status)) {
      logReport("warn", requestId, "lookup", { interviewId: interviewOid.toHexString(), outcome: "not_finished", status: String(stored.status) });
      return fail(409, "interview_not_finished", "Finish the interview before generating its report.");
    }
    // A saved report is returned as is: no AI call. Only the explicit, limited
    // re-evaluation (/api/interviews/[id]/reevaluate) can replace it.
    if (stored.finalReport) {
      logReport("info", requestId, "lookup", { interviewId: interviewOid.toHexString(), outcome: "stored_report" });
      return Response.json({ ok: true, report: stored.finalReport, source: stored.reportSource ?? "stored", stored: true });
    }

    // Older records stored the answers under `transcript`.
    const turns = asTurns(Array.isArray(stored.turns) && stored.turns.length ? stored.turns : stored.transcript);
    const ctx = stored;
    const type = parseInterviewType(ctx.type, "Technical");
    const role = clampString(str(ctx.role), 120);
    const experience = clampString(str(ctx.experience), 40);
    const company = clampString(str(ctx.company), 80);
    const focusAreas = clampString(str(ctx.focusAreas), 600);

    const evals = turns
      .map((t) => t.evaluation)
      .filter((e): e is NonNullable<ReportTurn["evaluation"]> => Boolean(e) && typeof e === "object");

    logReport("info", requestId, "lookup", {
      interviewId: interviewOid.toHexString(),
      outcome: "found",
      turns: turns.length,
      evaluated: evals.length,
    });

    if (turns.length === 0) {
      return fail(422, "no_answers", "No answers were recorded in this interview, so there is nothing to evaluate.");
    }
    // The report is kept permanently, so don't build it while answers still await evaluation.
    const pending = turns.filter((t) => (t as { evaluationPending?: unknown }).evaluationPending === true).length;
    if (evals.length === 0 || pending > 0) {
      // Averages over zero evaluations would be 0 and snap every score to 0 — never report that.
      logReport("warn", requestId, "evaluation", { outcome: "all_pending", turns: turns.length });
      return fail(409, "evaluation_pending", "Your answers haven't been evaluated yet. Retry the evaluation, then generate the report.", { retryable: true });
    }

    const outcome = await generateFinalReport(turns, { type, role, experience, company, focusAreas });
    if (!outcome.ok && outcome.reason === "provider_unavailable") {
      logReport("error", requestId, "generate", { outcome: "provider_unavailable", reason: aiFailureDetail().reason });
      // Do not present a templated report as AI analysis; the client still shows
      // the per-answer averages it already has.
      return aiUnavailableResponse("Report generation");
    }
    if (!outcome.ok) {
      logReport("error", requestId, "generate", { outcome: "malformed_output", provider: outcome.provider });
      return fail(502, "ai_invalid_output", "The AI returned an unusable report. Please try again.", { retryable: true });
    }
    const { report: normalized, provider } = outcome;
    // Written only if no report exists yet, so concurrent requests can't store two different ones.
    const write = await interviews.updateOne(
      { _id: interviewOid, userId: user.id, finalReport: null },
      { $set: { finalReport: normalized, reportSource: provider, reportGeneratedAt: new Date(), updatedAt: new Date() } },
    );
    if (write.matchedCount === 0) {
      const winner = await interviews.findOne({ _id: interviewOid, userId: user.id }, { projection: { finalReport: 1, reportSource: 1 } });
      logReport("info", requestId, "generate", { outcome: "lost_race", provider });
      return Response.json({ ok: true, report: winner?.finalReport ?? normalized, source: winner?.reportSource ?? provider, stored: true });
    }
    logReport("info", requestId, "generate", { outcome: "ok", provider, persisted: true });
    return Response.json({ ok: true, report: normalized, source: provider });
  } catch (e) {
    logReport("error", requestId, "unexpected", { error: e instanceof Error ? e.name : "unknown" });
    return fail(500, "internal_error", "Something went wrong while generating the report. Please try again.", { retryable: true });
  }
}
