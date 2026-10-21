import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "../helpers/fakeDb";
import { goodEvaluation, jsonRequest, newUser, params, type TestState } from "../helpers/setup";

type LLMParams = { system: string; user: string };
const state = vi.hoisted(() => ({ user: null, db: null, llm: null, background: [] as Promise<unknown>[] }) as TestState & { background: Promise<unknown>[] });

vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getCurrentUser: async () => state.user }));
vi.mock("@/lib/mongodb", async (orig) => ({ ...(await orig<typeof import("@/lib/mongodb")>()), getDb: async () => state.db }));
vi.mock("@/lib/llm", async (orig) => ({
  ...(await orig<typeof import("@/lib/llm")>()),
  llmText: vi.fn(async (p: LLMParams) => (state.llm ? state.llm(p) : null)),
}));
// Run "after response" work inline so tests can await it.
vi.mock("@/lib/background", () => ({ runAfterResponse: (task: () => Promise<unknown>) => state.background.push(task()) }));

import { GET as getConversation, POST as converse } from "@/app/api/interviews/[id]/conversation/route";
import { POST as finish } from "@/app/api/interviews/[id]/finish/route";
import { POST as evaluatePending } from "@/app/api/interviews/[id]/evaluate-pending/route";
import { POST as createSession } from "@/app/api/interviews/session/route";

const reply = (o: Record<string, unknown>) => ({ text: JSON.stringify(o), provider: "huggingface" as const });
let n = 0;
const rid = () => `req${String(++n).padStart(8, "0")}`;

async function call(id: string, body: Record<string, unknown>) {
  const res = await converse(jsonRequest(`/api/interviews/${id}/conversation`, body), params({ id }));
  return { status: res.status, data: (await res.json()) as Record<string, unknown> & { ok: boolean; message?: { text: string; kind: string } } };
}

async function newInterview(extra: Record<string, unknown> = {}) {
  const res = await createSession(jsonRequest("/api/interviews/session", { type: "Mixed", difficulty: "Medium", role: "Backend Engineer", ...extra }));
  return String(((await res.json()) as { id: string }).id);
}

/** Scripted interviewer: evaluation prompts get a score, conversation prompts get the next scripted turn. */
function interviewer(turns: Array<Record<string, unknown> | null>, prompts: string[] = []) {
  return (p: LLMParams) => {
    if (p.system.includes("strict but fair interviewer")) return reply(goodEvaluation);
    prompts.push(p.user);
    const next = turns.shift();
    return next === null || next === undefined ? null : reply(next);
  };
}

const doc = () => state.db!.collection("interviews").docs[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
  state.db = new FakeDb();
  state.user = newUser();
  state.llm = null;
  state.background = [];
  vi.stubEnv("HUGGINGFACE_API_KEY", "test-key");
});

describe("conversational interview", () => {
  it("greets, then follows up on what the candidate actually said", async () => {
    const id = await newInterview();
    const prompts: string[] = [];
    state.llm = interviewer(
      [
        { responseText: "Hi, thanks for joining. Can you explain how you designed your AI interview simulator?", responseType: "next_question" },
        { responseText: "What made you choose MongoDB for storing interview sessions?", responseType: "follow_up", evaluationNotes: "Named stack only." },
      ],
      prompts,
    );
    const open = await call(id, { requestId: rid(), action: "start" });
    expect(open.status).toBe(200);
    expect(open.data.message?.kind).toBe("next_question");

    const r = await call(id, { requestId: rid(), action: "reply", text: "I used Next.js and MongoDB." });
    expect(r.data.message?.kind).toBe("follow_up");
    // The model saw the candidate's real answer and the conversation so far.
    expect(prompts[1]).toContain('Candidate\'s latest reply: """I used Next.js and MongoDB."""');
    expect(prompts[1]).toContain("INTERVIEWER: Hi, thanks for joining.");
    // Private notes are stored but never returned.
    expect(doc().conversation.notes[0].note).toBe("Named stack only.");
    expect(JSON.stringify(r.data)).not.toContain("Named stack only.");
  });

  it("is idempotent per requestId and never duplicates the transcript", async () => {
    const id = await newInterview();
    state.llm = interviewer([{ responseText: "Hello! Tell me about a recent project.", responseType: "next_question" }, { responseText: "Which part did you build yourself?", responseType: "follow_up" }]);
    await call(id, { requestId: rid(), action: "start" });
    const requestId = rid();
    const first = await call(id, { requestId, action: "reply", text: "A chat app with websockets." });
    const again = await call(id, { requestId, action: "reply", text: "A chat app with websockets." });
    expect(again.data.duplicate).toBe(true);
    expect(again.data.message?.text).toBe(first.data.message?.text);
    expect(doc().conversation.messages.filter((m: { role: string }) => m.role === "candidate")).toHaveLength(1);
  });

  it("rejects a concurrent turn while another is being processed", async () => {
    const id = await newInterview();
    state.llm = interviewer([{ responseText: "Hello! First question?", responseType: "next_question" }]);
    await call(id, { requestId: rid(), action: "start" });
    doc().conversationLock = { requestId: "someoneelse1", at: new Date() };
    const r = await call(id, { requestId: rid(), action: "reply", text: "my answer here" });
    expect(r.status).toBe(409);
    expect(r.data.code).toBe("busy");
  });

  it("keeps the candidate's answer when the AI fails and lets the same request be retried", async () => {
    const id = await newInterview();
    state.llm = interviewer([{ responseText: "Hello! Tell me about yourself.", responseType: "next_question" }, null, { responseText: "Thanks. What drew you to backend work?", responseType: "follow_up" }]);
    await call(id, { requestId: rid(), action: "start" });
    const requestId = rid();
    const failed = await call(id, { requestId, action: "reply", text: "I am a backend engineer." });
    expect(failed.status).toBe(503);
    expect(failed.data.candidateMessageSaved).toBe(true);
    expect(doc().conversation.messages.at(-1).text).toBe("I am a backend engineer.");
    expect(doc().conversationLock).toBeUndefined();

    const retried = await call(id, { requestId, action: "reply", text: "I am a backend engineer." });
    expect(retried.status).toBe(200);
    expect(doc().conversation.messages.filter((m: { role: string }) => m.role === "candidate")).toHaveLength(1);
  });

  it("retries once when the model invents a quote or returns malformed JSON", async () => {
    const id = await newInterview();
    const prompts: string[] = [];
    state.llm = interviewer(
      [
        { responseText: "Hello! How do you store sessions?", responseType: "next_question" },
        { responseText: 'You said "I cache everything in Redis", why?', responseType: "follow_up" },
        { responseText: "How do you stop one user reading another's sessions?", responseType: "follow_up" },
      ],
      prompts,
    );
    await call(id, { requestId: rid(), action: "start" });
    const r = await call(id, { requestId: rid(), action: "reply", text: "I stored the sessions against the user ID." });
    expect(r.data.message?.text).toContain("another's sessions");
    expect(prompts.at(-1)).toContain("Do not attribute words to the candidate");

    state.llm = interviewer(["not json" as unknown as Record<string, unknown>, null]);
    const bad = await call(id, { requestId: rid(), action: "reply", text: "By checking ownership on every query." });
    expect(bad.status).toBe(503);
  });

  it("scores a question when the interviewer moves on, and finishes with the transcript", async () => {
    const id = await newInterview();
    state.llm = interviewer([
      { responseText: "Hello! Walk me through your caching design.", responseType: "next_question" },
      { responseText: "Good. Next: how would you debug a memory leak?", responseType: "next_question" },
    ]);
    await call(id, { requestId: rid(), action: "start" });
    await call(id, { requestId: rid(), action: "reply", text: "We cached computed reports in Redis with a TTL." });
    await Promise.all(state.background);
    expect(doc().turns).toHaveLength(1);
    expect(doc().turns[0].evaluation.overall_score).toBe(7);

    // The still-open second question is scored at finish (no answer → zero, nothing invented).
    const fin = (await (await finish(jsonRequest(`/api/interviews/${id}/finish`, {}), params({ id }))).json()) as { averageScore: number; pendingEvaluations: number };
    expect(fin.averageScore).toBe(7);
    expect(fin.pendingEvaluations).toBe(0);
    expect(doc().conversation.completed).toBe(true);
  });

  it("marks evaluations pending (not invented) when scoring fails, and retries them later", async () => {
    const id = await newInterview();
    state.llm = interviewer([{ responseText: "Hello! Describe a production incident you handled.", responseType: "next_question" }]);
    await call(id, { requestId: rid(), action: "start" });
    state.llm = interviewer([{ responseText: "Thanks, that's all for today.", responseType: "closing" }]);
    const original = state.llm;
    state.llm = (p) => (p.system.includes("strict but fair interviewer") ? null : original(p));
    await call(id, { requestId: rid(), action: "reply", text: "Our API went down after a bad deploy; we rolled back and added canaries." });
    await Promise.all(state.background);
    const fin = (await (await finish(jsonRequest(`/api/interviews/${id}/finish`, {}), params({ id }))).json()) as { averageScore: number | null; pendingEvaluations: number };
    expect(fin.averageScore).toBeNull();
    expect(fin.pendingEvaluations).toBe(1);
    expect(doc().turns[0].evaluation).toBeNull();

    state.llm = () => reply(goodEvaluation);
    const res = await evaluatePending(jsonRequest(`/api/interviews/${id}/evaluate-pending`, {}), params({ id }));
    expect(res.status).toBe(200);
    expect(doc().averageScore).toBe(7);
    expect(doc().turns).toHaveLength(1);
  });

  it("skips to a new main question", async () => {
    const id = await newInterview();
    const prompts: string[] = [];
    state.llm = interviewer([{ responseText: "Hello! What is a closure?", responseType: "next_question" }, { responseText: "No problem. How does HTTP caching work?", responseType: "next_question" }], prompts);
    await call(id, { requestId: rid(), action: "start" });
    const r = await call(id, { requestId: rid(), action: "skip" });
    expect(r.data.message?.kind).toBe("next_question");
    expect(prompts.at(-1)).toContain("The candidate chose to skip");
    expect(doc().conversation.questions).toHaveLength(2);
  });

  it("validates input and ownership", async () => {
    const id = await newInterview();
    expect((await call(id, { requestId: "short", action: "start" })).status).toBe(400);
    expect((await call(id, { requestId: rid(), action: "explode" })).status).toBe(400);
    expect((await call(id, { requestId: rid(), action: "reply", text: " " })).status).toBe(400);
    expect((await call(id, { requestId: rid(), action: "reply", text: "an answer" })).status).toBe(409); // not started
    state.user = newUser();
    expect((await call(id, { requestId: rid(), action: "start" })).status).toBe(404);
    const get = await getConversation(jsonRequest(`/api/interviews/${id}/conversation`), params({ id }));
    expect(get.status).toBe(404);
    state.user = null;
    expect((await call(id, { requestId: rid(), action: "start" })).status).toBe(401);
  });

  it("uses an honest fallback greeting when the AI is down at the start", async () => {
    const id = await newInterview();
    state.llm = () => null;
    const r = await call(id, { requestId: rid(), action: "start" });
    expect(r.status).toBe(200);
    expect(r.data.fallback).toBe(true);
    expect(r.data.message?.text).toMatch(/tell me about yourself/i);
  });

  it("restores the conversation for a refreshed page without calling the AI again", async () => {
    const id = await newInterview();
    state.llm = interviewer([{ responseText: "Hello! First question?", responseType: "next_question" }]);
    await call(id, { requestId: rid(), action: "start" });
    state.llm = vi.fn(() => null);
    const again = await call(id, { requestId: rid(), action: "start" });
    expect(again.data.resumed).toBe(true);
    expect(state.llm).not.toHaveBeenCalled();
    const get = (await (await getConversation(jsonRequest(`/api/interviews/${id}/conversation`), params({ id }))).json()) as { messages: unknown[] };
    expect(get.messages).toHaveLength(1);
  });

  it("excludes paused time from the session clock", async () => {
    const id = await newInterview();
    state.llm = interviewer([{ responseText: "Hello! First question?", responseType: "next_question" }]);
    await call(id, { requestId: rid(), action: "start" });
    doc().conversationStartedAt = new Date(Date.now() - 10 * 60_000);
    await call(id, { requestId: rid(), action: "pause" });
    doc().conversationPausedAt = new Date(Date.now() - 5 * 60_000);
    const resumed = await call(id, { requestId: rid(), action: "resume" });
    const left = (resumed.data.state as { secondsLeft: number }).secondsLeft;
    expect(left).toBeGreaterThan(9 * 60);
    expect(left).toBeLessThanOrEqual(10 * 60);
  });

  it("links questions to the candidate's own resume projects", async () => {
    const resumes = state.db!.collection("resumes");
    const resumeId = new ObjectId();
    resumes.docs.push({
      _id: resumeId,
      userId: state.user!.id,
      parsed: { projects: [{ name: "Expense Tracker", description: "", technologies: ["React Native", "Firebase"], responsibilities: ["Offline sync"], achievements: [], links: [] }], skills: [], education: [], experience: [], certifications: [], achievements: [], links: [], sourceMetadata: { parserVersion: "2", parsedAt: "", source: "rules" } },
    });
    const id = await newInterview();
    doc().resumeId = String(resumeId);
    doc().useResume = true;
    const prompts: string[] = [];
    state.llm = interviewer([{ responseText: "Hello! How did you design offline sync in your Expense Tracker?", responseType: "next_question", projectIndex: 1 }], prompts);
    await call(id, { requestId: rid(), action: "start" });
    expect(prompts[0]).toContain("[P1] Expense Tracker");
    expect(doc().conversation.questions[0].projectRef).toMatchObject({ projectIndex: 0, projectName: "Expense Tracker", resumeId: String(resumeId) });
  });
});
