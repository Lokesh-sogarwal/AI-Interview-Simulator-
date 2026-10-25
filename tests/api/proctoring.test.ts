import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "../helpers/fakeDb";
import { goodEvaluation, jsonRequest, newUser, params, type TestState } from "../helpers/setup";

type LLMParams = { system: string; user: string };
const state = vi.hoisted(() => ({ user: null, db: null, llm: null }) as TestState);
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getCurrentUser: async () => state.user }));
vi.mock("@/lib/mongodb", async (orig) => ({ ...(await orig<typeof import("@/lib/mongodb")>()), getDb: async () => state.db }));
vi.mock("@/lib/llm", async (orig) => ({ ...(await orig<typeof import("@/lib/llm")>()), llmText: vi.fn(async (p: LLMParams) => (state.llm ? state.llm(p) : null)) }));

import { POST as startSessionRoute } from "@/app/api/interviews/[id]/proctoring/session/route";
import { POST as eventsRoute } from "@/app/api/interviews/[id]/proctoring/events/route";
import { POST as noteRoute } from "@/app/api/interviews/[id]/proctoring/note/route";
import { DELETE as deleteRoute } from "@/app/api/interviews/[id]/proctoring/route";
import { POST as finishRoute } from "@/app/api/interviews/[id]/finish/route";
import { POST as converse } from "@/app/api/interviews/[id]/conversation/route";
import { POST as reevaluate } from "@/app/api/interviews/[id]/reevaluate/route";
import { POST as report } from "@/app/api/ai/report/route";
import { llmText } from "@/lib/llm";

const events = () => state.db!.collection("proctoring_events").docs as Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const sessions = () => state.db!.collection("proctoring_sessions").docs as Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const interviewDoc = () => state.db!.collection("interviews").docs[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function seedInterview(extra: Record<string, unknown> = {}) {
  const { insertedId } = await state.db!.collection("interviews").insertOne({ userId: state.user!.id, status: "in_progress", role: "Backend Engineer", type: "Technical", turns: [{ questionId: "q1", question: "Explain caching.", answer: "Redis with a TTL.", evaluation: goodEvaluation }], ...extra });
  return insertedId.toHexString();
}
async function startSession(id: string) {
  const res = await startSessionRoute(jsonRequest(`/api/interviews/${id}/proctoring/session`, {}), params({ id }));
  return { status: res.status, data: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
let n = 0;
const evt = (type: string, extra: Record<string, unknown> = {}) => ({ id: `evt${String(++n).padStart(10, "0")}`, seq: n, type, at: new Date().toISOString(), ...extra });
async function send(id: string, sessionId: unknown, list: unknown[], raw?: string) {
  const res = await eventsRoute(jsonRequest(`/api/interviews/${id}/proctoring/events`, raw ?? { sessionId, events: list }), params({ id }));
  return { status: res.status, data: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

beforeEach(() => {
  state.db = new FakeDb();
  state.db.collection("proctoring_events").uniqueKeys = [["sessionId", "clientEventId"]];
  state.user = newUser();
  state.llm = null;
  n = 0;
  vi.stubEnv("GEMINI_API_KEY", "test-key");
});

describe("proctoring sessions", () => {
  it("issues a server session id and records the start", async () => {
    const id = await seedInterview();
    const { status, data } = await startSession(id);
    expect(status).toBe(200);
    expect(data.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.policy.retentionDays).toBe(180);
    expect(events().map((e) => [e.type, e.source, e.sessionId])).toEqual([["session_started", "server", data.sessionId]]);
  });

  it("marks an open session interrupted on reload and records the reconnect", async () => {
    const id = await seedInterview();
    const first = (await startSession(id)).data.sessionId;
    const second = (await startSession(id)).data.sessionId;
    expect(second).not.toBe(first);
    expect(sessions().find((s) => s._id === first)).toMatchObject({ endReason: "interrupted" });
    expect(events().map((e) => e.type)).toEqual(["session_started", "session_interrupted", "session_reconnected"]);
    expect(events().find((e) => e.type === "session_interrupted")!.severity).toBe("warning");
  });

  it("rejects anonymous callers, other users' interviews and finished interviews", async () => {
    const id = await seedInterview();
    state.user = null;
    expect((await startSession(id)).status).toBe(401);
    state.user = newUser();
    expect((await startSession(id)).status).toBe(404);
    expect((await startSession("nope")).status).toBe(400);
    state.user = { ...state.user, id: interviewDoc().userId };
    interviewDoc().status = "completed";
    expect((await startSession(id)).data.code).toBe("interview_closed");
  });
});

describe("event ingestion", () => {
  it("stores events with server-side severity, receipt time and owner, ignoring client claims", async () => {
    const id = await seedInterview();
    const sid = (await startSession(id)).data.sessionId;
    const before = Date.now();
    const { status, data } = await send(id, sid, [evt("tab_hidden", { durationMs: 45_000, severity: "info", userId: "someone-else", count: 999 })]);
    expect(status).toBe(200);
    expect(data).toMatchObject({ accepted: 1, duplicates: 0, rejected: 0 });
    const stored = events().find((e) => e.type === "tab_hidden")!;
    expect(stored).toMatchObject({ severity: "review", source: "client", userId: state.user!.id, sessionId: sid, durationMs: 45_000, kind: "integrity" });
    expect(stored.receivedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored.count).toBeUndefined();
  });

  it("is idempotent: retried batches are acknowledged but stored once", async () => {
    const id = await seedInterview();
    const sid = (await startSession(id)).data.sessionId;
    const batch = [evt("window_blur", { durationMs: 3_000 }), evt("fullscreen_exit")];
    await send(id, sid, batch);
    const retry = await send(id, sid, batch);
    expect(retry.data).toMatchObject({ accepted: 0, duplicates: 2 });
    expect(events().filter((e) => e.source === "client")).toHaveLength(2);
  });

  it("rejects server-only and unknown event types and malformed entries", async () => {
    const id = await seedInterview();
    const sid = (await startSession(id)).data.sessionId;
    const { data } = await send(id, sid, [evt("session_started"), evt("pause_used"), evt("cheating_detected"), { id: "x", seq: 1, type: "tab_hidden" }, evt("fullscreen_exit")]);
    expect(data).toMatchObject({ accepted: 1, rejected: 4 });
  });

  it("flags out-of-order events, sequence gaps and implausible clocks instead of trusting them", async () => {
    const id = await seedInterview();
    const sid = (await startSession(id)).data.sessionId;
    await send(id, sid, [{ ...evt("window_blur"), seq: 5 }]);
    await send(id, sid, [{ ...evt("fullscreen_exit"), seq: 3 }, { ...evt("camera_turned_off"), seq: 9, at: "2001-01-01T00:00:00Z" }]);
    const flags = Object.fromEntries(events().filter((e) => e.source === "client").map((e) => [e.type, e.flags ?? {}]));
    expect(flags.fullscreen_exit).toMatchObject({ outOfOrder: true });
    expect(flags.camera_turned_off).toMatchObject({ sequenceGap: true, clockSkew: true });
    expect(events().find((e) => e.type === "camera_turned_off")!.clientAt).toBeNull();
  });

  it("keeps only whitelisted technical metadata", async () => {
    const id = await seedInterview();
    const sid = (await startSession(id)).data.sessionId;
    await send(id, sid, [evt("multiple_faces", { durationMs: 7_000, meta: { faces: 2, frame: "data:image/jpeg;base64,AAAA", name: "Alice" } })]);
    const stored = events().find((e) => e.type === "multiple_faces")!;
    expect(stored.meta).toEqual({ faces: 2 });
    expect(JSON.stringify(events())).not.toMatch(/base64|Alice/);
  });

  it("enforces ownership of both the interview and the session", async () => {
    const id = await seedInterview();
    const sid = (await startSession(id)).data.sessionId;
    const owner = state.user!;
    state.user = newUser();
    expect((await send(id, sid, [evt("tab_hidden")])).status).toBe(404);
    // Another user's session id can't be attached to my own interview either.
    const mine = await seedInterview();
    await startSession(mine);
    expect((await send(mine, sid, [evt("tab_hidden")])).data.code).toBe("unknown_session");
    state.user = owner;
    expect((await send(id, "00000000-0000-4000-8000-000000000000", [evt("tab_hidden")])).data.code).toBe("unknown_session");
  });

  it("rejects events for a finished interview", async () => {
    const id = await seedInterview();
    const sid = (await startSession(id)).data.sessionId;
    interviewDoc().status = "completed";
    expect((await send(id, sid, [evt("tab_hidden")])).status).toBe(409);
  });

  it("limits batch size, body size, total events per session and request rate", async () => {
    const id = await seedInterview();
    const sid = (await startSession(id)).data.sessionId;
    expect((await send(id, sid, Array.from({ length: 26 }, () => evt("window_blur")))).data.code).toBe("too_many_events");
    expect((await send(id, sid, [], JSON.stringify({ sessionId: sid, events: [evt("window_blur", { meta: { pad: "x".repeat(20_000) } })] }))).status).toBe(413);
    expect((await send(id, sid, [], "not json")).status).toBe(400);
    sessions()[0].eventCount = 999;
    expect((await send(id, sid, [evt("window_blur"), evt("window_blur")])).data.code).toBe("event_limit");
    sessions()[0].eventCount = 0;
    let last = 0;
    for (let i = 0; i < 125 && last !== 429; i += 1) last = (await send(id, sid, [evt("window_blur")])).status;
    expect(last).toBe(429);
  });

  it("never changes answers, scores or status", async () => {
    const id = await seedInterview({ averageScore: 7 });
    const sid = (await startSession(id)).data.sessionId;
    const before = JSON.stringify({ turns: interviewDoc().turns, averageScore: interviewDoc().averageScore, status: interviewDoc().status });
    await send(id, sid, [evt("multiple_faces", { durationMs: 20_000 }), evt("tab_hidden", { durationMs: 120_000 })]);
    expect(JSON.stringify({ turns: interviewDoc().turns, averageScore: interviewDoc().averageScore, status: interviewDoc().status })).toBe(before);
  });
});

describe("summary at finish", () => {
  it("is built from stored events, ignores browser-sent numbers and never terminates the interview", async () => {
    const id = await seedInterview({ conversation: undefined });
    const sid = (await startSession(id)).data.sessionId;
    await send(id, sid, [evt("tab_hidden", { durationMs: 40_000 }), evt("mic_lost", { durationMs: 8_000 })]);
    const res = await finishRoute(jsonRequest(`/api/interviews/${id}/finish`, { endedReason: "proctor_violations", proctoring: { violations: 99, lastViolation: "client says cheating" } }), params({ id }));
    const data = await res.json();
    expect(data).toMatchObject({ ok: true, status: "completed", averageScore: 7, proctoring: { status: "review_recommended", reviewStatus: "pending" } });
    const doc = interviewDoc();
    expect(doc.status).toBe("completed");
    expect(doc.endedReason).toBe("manual_end");
    expect(doc.proctoring).toBeUndefined();
    expect(doc.proctoringSummary).toMatchObject({ tabHidden: { count: 1, totalMs: 40_000 }, devices: { micInterruptions: 1 }, sessions: { started: 1 } });
    expect(JSON.stringify(doc.proctoringSummary)).not.toContain("client says cheating");
    expect(sessions()[0].endedAt).toBeInstanceOf(Date);
    expect(events().map((e) => e.type)).toContain("session_ended");
  });

  it("keeps the integrity summary out of scoring and report prompts", async () => {
    const prompts: string[] = [];
    state.llm = (p) => (prompts.push(p.system + p.user), { text: JSON.stringify({ candidate_summary: "Good.", technical_knowledge_score: 7, communication_skill_score: 7, confidence_score: 7, problem_solving_score: 7, english_fluency_score: 7, project_knowledge_score: 6, strengths: [], weaknesses: [], improvement_suggestions: [], practice_topics: [], final_recommendation: "Hire" }), provider: "gemini" as const });
    const id = await seedInterview();
    const sid = (await startSession(id)).data.sessionId;
    await send(id, sid, [evt("multiple_faces", { durationMs: 30_000 })]);
    await finishRoute(jsonRequest(`/api/interviews/${id}/finish`, {}), params({ id }));
    expect((await report(jsonRequest("/api/ai/report", { interviewId: id }))).status).toBe(200);
    expect(interviewDoc().averageScore).toBe(7);
    expect(interviewDoc().finalReport.technical_knowledge_score).toBe(7);
    expect(prompts.join("\n")).not.toMatch(/proctor|multiple_faces|tab_hidden|integrity/i);
  });

  it("survives the one re-evaluation unchanged", async () => {
    state.llm = (p) => ({ text: p.system.includes("FINAL REPORT CARD") ? JSON.stringify({ candidate_summary: "Re-evaluated.", technical_knowledge_score: 7, communication_skill_score: 7, confidence_score: 7, problem_solving_score: 7, english_fluency_score: 7, project_knowledge_score: 6, strengths: [], weaknesses: [], improvement_suggestions: [], practice_topics: [], final_recommendation: "Hire" }) : JSON.stringify({ evaluations: [{ id: 1, ...goodEvaluation }] }), provider: "gemini" as const });
    const id = await seedInterview();
    const sid = (await startSession(id)).data.sessionId;
    await send(id, sid, [evt("tab_hidden", { durationMs: 12_000 })]);
    await finishRoute(jsonRequest(`/api/interviews/${id}/finish`, {}), params({ id }));
    const summaryBefore = JSON.stringify(interviewDoc().proctoringSummary);
    const eventCount = events().length;
    const res = await reevaluate(jsonRequest(`/api/interviews/${id}/reevaluate`, {}), params({ id }));
    expect(res.status).toBe(200);
    expect(events()).toHaveLength(eventCount);
    expect(JSON.stringify(interviewDoc().proctoringSummary)).toBe(summaryBefore);
    expect(interviewDoc().reevaluationsUsed).toBe(1);
  });
});

describe("server-observed events", () => {
  it("records pauses and rejected overlapping requests from the server side", async () => {
    state.llm = () => ({ text: JSON.stringify({ responseText: "Hello! First question: how do you cache?", responseType: "next_question" }), provider: "groq" as const });
    const id = await seedInterview({ turns: [] });
    await startSession(id);
    const call = (body: Record<string, unknown>) => converse(jsonRequest(`/api/interviews/${id}/conversation`, body), params({ id }));
    await call({ requestId: "req00000001", action: "start" });
    await call({ requestId: "req00000002", action: "pause" });
    interviewDoc().conversationLock = { requestId: "someoneelse", at: new Date() };
    const busy = await call({ requestId: "req00000003", action: "reply", text: "an answer here" });
    expect(busy.status).toBe(409);
    expect(events().filter((e) => e.source === "server").map((e) => e.type)).toEqual(expect.arrayContaining(["pause_used", "concurrent_request_rejected"]));
    expect(vi.mocked(llmText)).toHaveBeenCalledTimes(1); // proctoring itself never calls an AI model
  });
});

describe("candidate note and deletion", () => {
  it("lets the candidate add plain-text context once a summary exists", async () => {
    const id = await seedInterview();
    const post = (note: unknown) => noteRoute(jsonRequest(`/api/interviews/${id}/proctoring/note`, { note }), params({ id }));
    expect((await post("Headset died")).status).toBe(404);
    await startSession(id);
    await finishRoute(jsonRequest(`/api/interviews/${id}/finish`, {}), params({ id }));
    expect((await post("x".repeat(1001))).status).toBe(400);
    const ok = await post("  My headset\u0000 disconnected at question 3.  ");
    expect(ok.status).toBe(200);
    expect(interviewDoc().proctoringSummary.candidateNote).toBe("My headset disconnected at question 3.");
    state.user = newUser();
    expect((await post("not mine")).status).toBe(404);
  });

  it("allows only administrators to delete proctoring records, and audits it", async () => {
    const id = await seedInterview();
    const sid = (await startSession(id)).data.sessionId;
    await send(id, sid, [evt("tab_hidden", { durationMs: 2_000 })]);
    await finishRoute(jsonRequest(`/api/interviews/${id}/finish`, {}), params({ id }));
    const del = () => deleteRoute(jsonRequest(`/api/interviews/${id}/proctoring`, undefined, { method: "DELETE" }), params({ id }));
    expect((await del()).status).toBe(403); // the candidate can't erase their own integrity record
    const admin = newUser({ isAdmin: true });
    await state.db!.collection("users").insertOne({ _id: new ObjectId(admin.id), role: "admin" });
    state.user = admin;
    const res = await del();
    expect(res.status).toBe(200);
    expect(events()).toHaveLength(0);
    expect(sessions()).toHaveLength(0);
    expect(interviewDoc().proctoringSummary).toBeUndefined();
    expect(interviewDoc().turns).toHaveLength(1);
    expect(state.db!.collection("audit_logs").docs[0]).toMatchObject({ action: "proctoring.delete", actorId: admin.id, interviewId: id });
  });
});
