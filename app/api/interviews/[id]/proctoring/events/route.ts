import { getCurrentUser } from "@/lib/auth";
import { jsonError, toObjectId } from "@/lib/http";
import { isClosedStatus } from "@/lib/interviewFlow";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";
import { MAX_EVENTS_BODY_BYTES, MAX_EVENTS_PER_REQUEST, MAX_EVENTS_PER_SESSION, ingestEvents, loadSession, type IncomingEvent } from "@/lib/proctoringStore";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Receives a batch of proctoring events observed in the browser. Events are
 * observations only: they never change answers, scores or interview status.
 * Retries are safe (idempotent per event id).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);

  const { id } = await context.params;
  const oid = toObjectId(id);
  if (!oid) return jsonError("Invalid interview id.", 400, { code: "invalid_interview_id" });

  // Size limit before parsing: event batches are small.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_EVENTS_BODY_BYTES) return jsonError("Too much event data in one request.", 413, { code: "payload_too_large" });
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_EVENTS_BODY_BYTES) return jsonError("Too much event data in one request.", 413, { code: "payload_too_large" });
  let body: { sessionId?: unknown; events?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object" || !Array.isArray(body.events)) return jsonError("Expected { sessionId, events: [...] }.", 400, { code: "invalid_body" });
  if (body.events.length === 0) return Response.json({ ok: true, accepted: 0, duplicates: 0, rejected: 0 });
  if (body.events.length > MAX_EVENTS_PER_REQUEST) return jsonError(`At most ${MAX_EVENTS_PER_REQUEST} events per request.`, 400, { code: "too_many_events" });

  const rl = rateLimit(request, { keyPrefix: "proctoring:events", key: `${user.id}:${String(body.sessionId).slice(0, 64)}`, limit: 120, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const db = await getDb();
  if (!db) return jsonError(dbUnavailableMessage(), 503, { code: "db_unavailable", retryable: true });

  const owner = { interviewId: oid, userId: user.id };
  const interview = await db.collection("interviews").findOne({ _id: oid, userId: user.id }, { projection: { status: 1 } });
  if (!interview) return jsonError("Interview not found.", 404, { code: "not_found" });
  if (isClosedStatus(interview.status)) return jsonError("This interview has already ended.", 409, { code: "interview_closed" });
  // The session must belong to this user and interview (ids from other sessions are rejected).
  const session = await loadSession(db, owner, body.sessionId);
  if (!session) return jsonError("Unknown proctoring session.", 404, { code: "unknown_session" });
  if (session.eventCount + body.events.length > MAX_EVENTS_PER_SESSION) return jsonError("Event limit for this session reached.", 429, { code: "event_limit" });

  const result = await ingestEvents(db, owner, session, body.events as IncomingEvent[]);
  return Response.json({ ok: true, ...result });
}
