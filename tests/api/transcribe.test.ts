import { ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "../helpers/fakeDb";
import { newUser, params, type TestState } from "../helpers/setup";

const state = vi.hoisted(() => ({ user: null, db: null, llm: null }) as TestState);
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getCurrentUser: async () => state.user }));
vi.mock("@/lib/mongodb", async (orig) => ({ ...(await orig<typeof import("@/lib/mongodb")>()), getDb: async () => state.db }));

import { POST as transcribe } from "@/app/api/interviews/[id]/transcribe/route";

function audioRequest(id: string, blob: Blob | null) {
  const form = new FormData();
  if (blob) form.append("audio", blob, "answer.webm");
  return new Request(`http://localhost/api/interviews/${id}/transcribe`, { method: "POST", body: form, headers: { "x-forwarded-for": `10.1.${Math.floor(Math.random() * 255)}.1` } });
}
const webm = (bytes = 2048) => new Blob([new Uint8Array(bytes)], { type: "audio/webm;codecs=opus" });

let groq: ReturnType<typeof vi.fn>;
async function seed(extra: Record<string, unknown> = {}) {
  const { insertedId } = await state.db!.collection("interviews").insertOne({ userId: state.user!.id, status: "in_progress", ...extra });
  return insertedId.toHexString();
}

beforeEach(() => {
  state.db = new FakeDb();
  state.user = newUser();
  vi.stubEnv("GROQ_API_KEY", "gsk-test");
  groq = vi.fn(async () => new Response(JSON.stringify({ text: " I would use Redis. " }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", groq);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/interviews/[id]/transcribe", () => {
  it("transcribes one answer with Groq Whisper and returns only the text", async () => {
    const id = await seed();
    const res = await transcribe(audioRequest(id, webm()), params({ id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, text: "I would use Redis." });
    const [url, init] = groq.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    const sent = init.body as FormData;
    expect(sent.get("model")).toBe("whisper-large-v3-turbo");
    expect(sent.get("language")).toBe("en");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gsk-test");
    // Nothing about the audio is persisted.
    expect(Object.keys(state.db!.collection("interviews").docs[0]).sort()).toEqual(["_id", "status", "userId"]);
  });

  it("guides spelling with the stored question being answered, not anything from the client", async () => {
    const id = await seed({ role: "Backend Engineer", conversation: { currentQuestionId: "q2", questions: [{ id: "q1", text: "Old question" }, { id: "q2", text: "How does Redis eviction work?" }] } });
    await transcribe(audioRequest(id, webm()), params({ id }));
    const sent = (groq.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect(sent.get("prompt")).toBe("Interview for Backend Engineer. How does Redis eviction work?");
  });

  it("rejects unauthenticated callers and other users' interviews", async () => {
    const id = await seed();
    state.user = null;
    expect((await transcribe(audioRequest(id, webm()), params({ id }))).status).toBe(401);
    state.user = newUser();
    expect((await transcribe(audioRequest(id, webm()), params({ id }))).status).toBe(404);
    expect(groq).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed id", "nope", webm(), 400],
    ["missing audio", null, null, 400],
    ["oversized audio", null, webm(5 * 1024 * 1024), 413],
    ["a non-audio file", null, new Blob(["x"], { type: "application/pdf" }), 415],
  ])("rejects %s", async (_label, badId, blob, status) => {
    const id = badId ?? (await seed());
    expect((await transcribe(audioRequest(id, blob as Blob | null), params({ id }))).status).toBe(status);
    expect(groq).not.toHaveBeenCalled();
  });

  it("refuses finished interviews", async () => {
    const id = await seed({ status: "completed" });
    expect((await transcribe(audioRequest(id, webm()), params({ id }))).status).toBe(409);
  });

  it("says clearly when server transcription is not configured", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const id = await seed();
    const res = await transcribe(audioRequest(id, webm()), params({ id }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("stt_not_configured");
  });

  it.each([
    [429, "Rate limit reached for model whisper-large-v3-turbo on audio seconds per day (ASD)", "quota", false],
    [503, "Service Unavailable", "timeout", true],
  ])("reports a provider %s as a recoverable failure with its reason", async (status, message, reason, retryable) => {
    groq.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message } }), { status }));
    const id = await seed();
    const res = await transcribe(audioRequest(id, webm()), params({ id }));
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "transcription_failed", reason, retryable });
    expect(body.error).toMatch(/recording is kept/);
  });

  it("is not reachable with a random interview id", async () => {
    const id = new ObjectId().toHexString();
    expect((await transcribe(audioRequest(id, webm()), params({ id }))).status).toBe(404);
  });
});
