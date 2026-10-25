import { randomUUID } from "crypto";
import type { Db, ObjectId } from "mongodb";

import { isDuplicateKeyError } from "@/lib/mongodb";
import {
  EVENT_TYPES,
  isClientEventType,
  severityFor,
  summarizeProctoring,
  type ProctoringEventType,
  type ProctoringSummary,
  type StoredProctoringEvent,
} from "@/lib/proctoring";

export const EVENTS = "proctoring_events";
export const SESSIONS = "proctoring_sessions";

export const MAX_EVENTS_PER_REQUEST = 25;
export const MAX_EVENTS_PER_SESSION = 1000;
export const MAX_EVENTS_BODY_BYTES = 16 * 1024;
const MAX_DURATION_MS = 4 * 60 * 60 * 1000;
/** Client clocks further off than this are flagged; the server receipt time is always authoritative. */
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const META_KEYS = ["reason", "faces", "checks", "error"] as const;
const META_STRING = /^[a-z0-9_-]{1,40}$/;

type Owner = { interviewId: ObjectId; userId: string };

export type ProctoringSession = { _id: string; interviewId: ObjectId; userId: string; startedAt: Date; lastEventAt: Date | null; endedAt: Date | null; endReason: string | null; maxSeq: number; eventCount: number; previousSessionId: string | null };

/**
 * Keeps only small, non-identifying technical metadata: known keys with short
 * lowercase codes or small integers. Free text, objects, frames or audio are dropped.
 */
export function sanitizeMeta(meta: unknown): Record<string, string | number> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const out: Record<string, string | number> = {};
  for (const k of META_KEYS) {
    const v = (meta as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100_000) out[k] = v;
    else if (typeof v === "string" && META_STRING.test(v)) out[k] = v;
  }
  return out;
}

function eventDoc(owner: Owner, sessionId: string | null, type: ProctoringEventType, fields: { clientEventId: string; seq: number | null; source: "client" | "server"; clientAt: Date | null; durationMs: number | null; resolved: boolean; warned: boolean; meta: Record<string, string | number>; flags?: Record<string, boolean> }) {
  const def = EVENT_TYPES[type];
  return {
    ...owner,
    sessionId,
    type,
    category: def.category,
    kind: def.kind,
    severity: severityFor(type, fields.durationMs, fields.resolved),
    receivedAt: new Date(),
    ...fields,
  };
}

/** Records an event observed by the server itself (sessions, pauses, rejected requests). Never throws. */
export async function recordServerEvent(db: Db, owner: Owner, type: ProctoringEventType, opts: { sessionId?: string | null; meta?: Record<string, string | number>; durationMs?: number | null } = {}) {
  let sessionId = opts.sessionId ?? null;
  if (sessionId === null) {
    const open = await db.collection<ProctoringSession>(SESSIONS).findOne({ interviewId: owner.interviewId, userId: owner.userId, endedAt: null }, { sort: { startedAt: -1 }, projection: { _id: 1 } });
    sessionId = open?._id ?? null;
  }
  await db
    .collection(EVENTS)
    .insertOne(eventDoc(owner, sessionId, type, { clientEventId: `srv-${randomUUID()}`, seq: null, source: "server", clientAt: null, durationMs: opts.durationMs ?? null, resolved: true, warned: false, meta: opts.meta ?? {} }))
    .catch((e) => console.error("[proctoring] server event not stored:", e instanceof Error ? e.name : "unknown"));
}

/**
 * Starts a proctoring session for an interview. Any session still open
 * (closed tab, reload, crash) is marked interrupted, and the new one is
 * recorded as a reconnect.
 */
export async function startSession(db: Db, owner: Owner) {
  const sessions = db.collection<ProctoringSession>(SESSIONS);
  const now = new Date();
  const open = await sessions.find({ interviewId: owner.interviewId, userId: owner.userId, endedAt: null }).toArray();
  for (const s of open) {
    await sessions.updateOne({ _id: s._id, endedAt: null }, { $set: { endedAt: now, endReason: "interrupted" } });
    await recordServerEvent(db, owner, "session_interrupted", { sessionId: s._id });
  }
  const previous = open[0]?._id ?? (await sessions.findOne({ interviewId: owner.interviewId, userId: owner.userId }, { sort: { startedAt: -1 }, projection: { _id: 1 } }))?._id ?? null;
  const session: ProctoringSession = { _id: randomUUID(), ...owner, startedAt: now, lastEventAt: null, endedAt: null, endReason: null, maxSeq: 0, eventCount: 0, previousSessionId: previous };
  await sessions.insertOne(session);
  await recordServerEvent(db, owner, previous ? "session_reconnected" : "session_started", { sessionId: session._id });
  return session;
}

export type IncomingEvent = { id?: unknown; seq?: unknown; type?: unknown; at?: unknown; durationMs?: unknown; resolved?: unknown; warned?: unknown; meta?: unknown };

/**
 * Validates and stores a batch of browser-reported events. Idempotent by
 * client event id (retries never duplicate), severity is recomputed here,
 * receipt time is the server's, and ordering/clock problems are flagged
 * rather than trusted.
 */
export async function ingestEvents(db: Db, owner: Owner, session: ProctoringSession, batch: IncomingEvent[]) {
  const events = db.collection(EVENTS);
  const now = Date.now();
  const valid: Array<{ e: IncomingEvent; id: string; seq: number; type: ProctoringEventType }> = [];
  let rejected = 0;
  for (const e of batch) {
    const id = typeof e?.id === "string" && ID_RE.test(e.id) ? e.id : null;
    const seq = typeof e?.seq === "number" && Number.isInteger(e.seq) && e.seq > 0 && e.seq < 1_000_000 ? e.seq : null;
    if (!id || !seq || !isClientEventType(e.type)) {
      rejected += 1;
      continue;
    }
    valid.push({ e, id, seq, type: e.type });
  }

  // Already stored (a retry after a lost response): acknowledge without storing again.
  const ids = valid.map((v) => v.id);
  const existing = new Set((await events.find({ sessionId: session._id, clientEventId: { $in: ids } }, { projection: { clientEventId: 1 } }).toArray()).map((d) => d.clientEventId as string));
  let duplicates = 0;
  let accepted = 0;
  let maxSeq = session.maxSeq;
  for (const { e, id, seq, type } of valid.sort((a, b) => a.seq - b.seq)) {
    if (existing.has(id)) {
      duplicates += 1;
      continue;
    }
    const clientMs = typeof e.at === "string" ? Date.parse(e.at) : NaN;
    const clockSkew = !Number.isFinite(clientMs) || clientMs > now + MAX_CLOCK_SKEW_MS || clientMs < session.startedAt.getTime() - MAX_CLOCK_SKEW_MS;
    const duration = typeof e.durationMs === "number" && Number.isFinite(e.durationMs) ? Math.round(Math.min(MAX_DURATION_MS, Math.max(0, e.durationMs))) : null;
    const flags = { ...(seq <= maxSeq ? { outOfOrder: true } : {}), ...(seq > maxSeq + 1 && maxSeq > 0 ? { sequenceGap: true } : {}), ...(clockSkew ? { clockSkew: true } : {}) };
    try {
      await events.insertOne(
        eventDoc(owner, session._id, type, {
          clientEventId: id,
          seq,
          source: "client",
          clientAt: clockSkew ? null : new Date(clientMs),
          durationMs: duration,
          resolved: e.resolved !== false,
          warned: e.warned === true,
          meta: sanitizeMeta(e.meta),
          ...(Object.keys(flags).length ? { flags } : {}),
        }),
      );
      accepted += 1;
      maxSeq = Math.max(maxSeq, seq);
    } catch (err) {
      // A concurrent retry stored it first (unique index on sessionId + clientEventId).
      if (isDuplicateKeyError(err)) duplicates += 1;
      else throw err;
    }
  }
  if (accepted) {
    await db.collection<ProctoringSession>(SESSIONS).updateOne({ _id: session._id }, { $max: { maxSeq }, $inc: { eventCount: accepted }, $set: { lastEventAt: new Date() } });
  }
  return { accepted, duplicates, rejected };
}

/** Closes every open session of the interview (at finish). */
export async function endSessions(db: Db, owner: Owner, reason: string) {
  const sessions = db.collection<ProctoringSession>(SESSIONS);
  const open = await sessions.find({ ...owner, endedAt: null }).toArray();
  for (const s of open) {
    await sessions.updateOne({ _id: s._id, endedAt: null }, { $set: { endedAt: new Date(), endReason: reason } });
    await recordServerEvent(db, owner, "session_ended", { sessionId: s._id, meta: { reason: reason.replace(/[^a-z_-]/g, "").slice(0, 40) || "ended" } });
  }
}

/** Recomputes the summary from stored events and saves it on the interview (keeping the candidate's note). */
export async function storeSummary(db: Db, owner: Owner): Promise<ProctoringSummary> {
  const events = (await db
    .collection(EVENTS)
    .find({ interviewId: owner.interviewId, userId: owner.userId }, { projection: { type: 1, severity: 1, kind: 1, category: 1, source: 1, durationMs: 1, resolved: 1, receivedAt: 1, flags: 1 } })
    .toArray()) as unknown as StoredProctoringEvent[];
  const interviews = db.collection("interviews");
  const current = await interviews.findOne({ _id: owner.interviewId, userId: owner.userId }, { projection: { "proctoringSummary.candidateNote": 1 } });
  const summary = summarizeProctoring(events);
  const note = (current?.proctoringSummary as { candidateNote?: string } | undefined)?.candidateNote;
  if (note) summary.candidateNote = note;
  await interviews.updateOne({ _id: owner.interviewId, userId: owner.userId }, { $set: { proctoringSummary: summary } });
  return summary;
}

export async function loadSession(db: Db, owner: Owner, sessionId: unknown) {
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/.test(sessionId)) return null;
  return db.collection<ProctoringSession>(SESSIONS).findOne({ _id: sessionId, ...owner });
}
