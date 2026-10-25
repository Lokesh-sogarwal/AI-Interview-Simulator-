import { getCurrentUser } from "@/lib/auth";
import { jsonError, toObjectId } from "@/lib/http";
import { isClosedStatus } from "@/lib/interviewFlow";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";
import { PROCTORING_POLICY_VERSION, PROCTORING_RETENTION_DAYS, PROCTORING_THRESHOLDS } from "@/lib/proctoring";
import { startSession } from "@/lib/proctoringStore";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Starts (or, after a reload / second tab, restarts) the proctoring session
 * for the caller's interview. The server issues the session id; an earlier
 * session still open is recorded as interrupted.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);
  const rl = rateLimit(request, { keyPrefix: "proctoring:session", key: user.id, limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const { id } = await context.params;
  const oid = toObjectId(id);
  if (!oid) return jsonError("Invalid interview id.", 400, { code: "invalid_interview_id" });
  const db = await getDb();
  if (!db) return jsonError(dbUnavailableMessage(), 503, { code: "db_unavailable", retryable: true });

  const interview = await db.collection("interviews").findOne({ _id: oid, userId: user.id }, { projection: { status: 1 } });
  if (!interview) return jsonError("Interview not found.", 404, { code: "not_found" });
  // A finished interview can't be reopened as an active session.
  if (isClosedStatus(interview.status)) return jsonError("This interview has already ended.", 409, { code: "interview_closed" });

  const session = await startSession(db, { interviewId: oid, userId: user.id });
  return Response.json({
    ok: true,
    sessionId: session._id,
    reconnected: Boolean(session.previousSessionId),
    policy: { version: PROCTORING_POLICY_VERSION, retentionDays: PROCTORING_RETENTION_DAYS, thresholds: PROCTORING_THRESHOLDS },
  });
}
