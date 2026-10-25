import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "../helpers/fakeDb";
import { goodEvaluation, jsonRequest, newUser, params, type TestState } from "../helpers/setup";

const state = vi.hoisted(() => ({ user: null, db: null, llm: null }) as TestState);

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: async () => state.user,
}));
vi.mock("@/lib/mongodb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mongodb")>()),
  getDb: async () => state.db,
}));
vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  llmText: vi.fn(async (p: { system: string; user: string }) => (state.llm ? state.llm(p) : null)),
}));

import { POST as createSession } from "@/app/api/interviews/session/route";
import { GET as getInterview } from "@/app/api/interviews/[id]/route";
import { POST as postTurn } from "@/app/api/interviews/[id]/turn/route";
import { POST as finish } from "@/app/api/interviews/[id]/finish/route";
import { GET as listInterviews, POST as legacySave } from "@/app/api/interviews/route";
import { POST as startInterview } from "@/app/api/start-interview/route";
import { POST as nextQuestion } from "@/app/api/next-question/route";
import { POST as evaluate } from "@/app/api/ai/evaluate/route";
import { POST as report } from "@/app/api/ai/report/route";

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown> & { ok: boolean };
}

async function createInterview(body: Record<string, unknown> = {}) {
  const res = await createSession(jsonRequest("/api/interviews/session", body));
  const data = await json(res);
  return String(data.id);
}

beforeEach(() => {
  state.db = new FakeDb();
  state.user = newUser();
  state.llm = null;
  vi.stubEnv("HUGGINGFACE_API_KEY", "test-key");
});

describe("authentication", () => {
  it("rejects anonymous callers on AI and lifecycle endpoints", async () => {
    vi.stubEnv("NODE_ENV", "production");
    state.user = null;
    const id = new ObjectId().toString();
    expect((await evaluate(jsonRequest("/api/ai/evaluate", { question: "q", answer: "a" }))).status).toBe(401);
    expect((await report(jsonRequest("/api/ai/report", { turns: [] }))).status).toBe(401);
    expect((await nextQuestion(jsonRequest("/api/next-question", { interviewId: id }))).status).toBe(401);
    expect((await startInterview(jsonRequest("/api/start-interview", {}))).status).toBe(401);
    expect((await postTurn(jsonRequest(`/api/interviews/${id}/turn`, { question: "q" }), params({ id }))).status).toBe(401);
    expect((await finish(jsonRequest(`/api/interviews/${id}/finish`, {}), params({ id }))).status).toBe(401);
    vi.unstubAllEnvs();
  });
});

describe("interview setup", () => {
  it.each([
    ["HR", "Easy"],
    ["Technical", "Medium"],
    ["Mixed", "Hard"],
    ["Mixed", "Adaptive"],
  ])("persists a %s / %s configuration exactly", async (type, difficulty) => {
    const id = await createInterview({ type, difficulty, role: "Backend Engineer", experience: "2-5 years", company: "Acme", focusAreas: "APIs" });
    const res = await getInterview(jsonRequest(`/api/interviews/${id}`), params({ id }));
    const data = await json(res);
    expect(data.interview).toMatchObject({ type, difficulty, role: "Backend Engineer", experience: "2-5 years", company: "Acme", focusAreas: "APIs" });
  });

  it("falls back to safe defaults for unknown values instead of storing them", async () => {
    const id = await createInterview({ type: "<script>", difficulty: "Impossible" });
    const data = await json(await getInterview(jsonRequest(`/api/interviews/${id}`), params({ id })));
    expect(data.interview).toMatchObject({ type: "Mixed", difficulty: "Adaptive" });
  });
});

describe("ownership", () => {
  it("prevents other users from reading or modifying an interview", async () => {
    const id = await createInterview({ type: "HR" });
    state.user = newUser();
    expect((await getInterview(jsonRequest(`/api/interviews/${id}`), params({ id }))).status).toBe(404);
    expect((await postTurn(jsonRequest(`/api/interviews/${id}/turn`, { question: "q", answer: "a" }), params({ id }))).status).toBe(404);
    expect((await finish(jsonRequest(`/api/interviews/${id}/finish`, {}), params({ id }))).status).toBe(404);
    expect((await nextQuestion(jsonRequest("/api/next-question", { interviewId: id }))).status).toBe(403);
    expect((await startInterview(jsonRequest("/api/start-interview", { interviewId: id }))).status).toBe(403);
    expect((await report(jsonRequest("/api/ai/report", { interviewId: id, turns: [{ question: "q", answer: "a" }] }))).status).toBe(404);
  });

  it("lists only the caller's interviews and hides private fields", async () => {
    await createInterview();
    state.db!.collection("interviews").docs[0].resumeText = "secret resume";
    const mine = await json(await listInterviews(jsonRequest("/api/interviews")));
    expect(mine.interviews).toHaveLength(1);
    state.user = newUser();
    const theirs = await json(await listInterviews(jsonRequest("/api/interviews")));
    expect(theirs.interviews).toHaveLength(0);
  });

  it("rejects malformed ids", async () => {
    expect((await getInterview(jsonRequest("/api/interviews/nope"), params({ id: "nope" }))).status).toBe(400);
  });
});

describe("answer evaluation", () => {
  it("returns 503 instead of inventing a score when the AI provider fails", async () => {
    state.llm = () => null;
    const res = await evaluate(jsonRequest("/api/ai/evaluate", { question: "Explain caching.", answer: "Caching stores computed results for reuse to cut latency." }));
    expect(res.status).toBe(503);
    const data = await json(res);
    expect(data.evaluation).toBeUndefined();
    expect(data.retryable).toBe(true);
  });

  it("returns 503 for malformed AI output", async () => {
    state.llm = () => ({ text: "Sure! Here is my evaluation: great answer", provider: "huggingface" });
    const res = await evaluate(jsonRequest("/api/ai/evaluate", { question: "Explain caching.", answer: "Caching stores computed results for reuse to cut latency." }));
    expect(res.status).toBe(503);
  });

  it("rejects malformed JSON and missing fields", async () => {
    expect((await evaluate(jsonRequest("/api/ai/evaluate", "{not json"))).status).toBe(400);
    expect((await evaluate(jsonRequest("/api/ai/evaluate", { question: "q" }))).status).toBe(400);
  });

  it("does not run the AI for gibberish", async () => {
    state.llm = vi.fn(() => ({ text: JSON.stringify(goodEvaluation), provider: "huggingface" as const }));
    const data = await json(await evaluate(jsonRequest("/api/ai/evaluate", { question: "Explain caching.", answer: "hugjhkgkhyjvtfj" })));
    expect(data.source).toBe("guard");
    expect((data.evaluation as { overall_score: number }).overall_score).toBe(0);
    expect(state.llm).not.toHaveBeenCalled();
  });
});

describe("turns and completion", () => {
  async function evaluateAndSave(id: string, question: string, answer: string, evaluation = goodEvaluation) {
    state.llm = () => ({ text: JSON.stringify(evaluation), provider: "huggingface" });
    const ev = await evaluate(jsonRequest("/api/ai/evaluate", { interviewId: id, question, answer, type: "Mixed" }));
    expect(ev.status).toBe(200);
    return postTurn(
      // A tampered client tries to send a perfect score.
      jsonRequest(`/api/interviews/${id}/turn`, { question, answer, evaluation: { ...goodEvaluation, overall_score: 10 } }),
      params({ id }),
    );
  }

  it("stores the server's evaluation, not the one sent by the client", async () => {
    const id = await createInterview({ type: "Technical" });
    const res = await evaluateAndSave(id, "Explain caching.", "Caching stores computed results for reuse to cut latency.");
    expect((await json(res)).evaluated).toBe(true);
    const doc = state.db!.collection("interviews").docs[0] as { turns: Array<{ evaluation: { overall_score: number } }> };
    expect(doc.turns[0].evaluation.overall_score).toBe(7);
  });

  it("treats duplicate submissions as idempotent", async () => {
    const id = await createInterview();
    await evaluateAndSave(id, "Q1?", "A detailed answer about queues and retries.");
    const again = await postTurn(jsonRequest(`/api/interviews/${id}/turn`, { question: "Q1?", answer: "A detailed answer about queues and retries." }), params({ id }));
    expect((await json(again)).duplicate).toBe(true);
    const doc = state.db!.collection("interviews").docs[0] as { turns: unknown[] };
    expect(doc.turns).toHaveLength(1);
  });

  it("records unanswered (timed-out) questions with a zero score", async () => {
    const id = await createInterview();
    const res = await postTurn(jsonRequest(`/api/interviews/${id}/turn`, { question: "Q?", answer: "" }), params({ id }));
    expect(res.status).toBe(200);
    const doc = state.db!.collection("interviews").docs[0] as { turns: Array<{ evaluation: { overall_score: number } }> };
    expect(doc.turns[0].evaluation.overall_score).toBe(0);
  });

  it("computes the final score server-side and ignores repeated completion", async () => {
    const id = await createInterview();
    await evaluateAndSave(id, "Q1?", "A detailed answer about queues and retries.", { ...goodEvaluation, overall_score: 6 });
    await evaluateAndSave(id, "Q2?", "Another detailed answer about indexes and joins.", { ...goodEvaluation, overall_score: 8 });

    const first = await json(await finish(jsonRequest(`/api/interviews/${id}/finish`, { averageScore: 10, endedReason: "manual_end" }), params({ id })));
    expect(first.averageScore).toBe(7);
    const doc = state.db!.collection("interviews").docs[0] as { status: string; completedAt: Date; pendingEvaluations?: unknown };
    expect(doc.status).toBe("completed");
    expect(doc.pendingEvaluations).toBeUndefined();
    const completedAt = doc.completedAt;

    const second = await json(await finish(jsonRequest(`/api/interviews/${id}/finish`, { endedReason: "proctor_violations" }), params({ id })));
    expect(second.alreadyFinished).toBe(true);
    const after = state.db!.collection("interviews").docs[0] as { status: string; completedAt: Date };
    expect(after.status).toBe("completed");
    expect(after.completedAt).toEqual(completedAt);
  });

  it("rejects new answers and questions once the interview has ended", async () => {
    const id = await createInterview();
    await finish(jsonRequest(`/api/interviews/${id}/finish`, {}), params({ id }));
    expect((await postTurn(jsonRequest(`/api/interviews/${id}/turn`, { question: "Q?", answer: "A" }), params({ id }))).status).toBe(409);
    expect((await nextQuestion(jsonRequest("/api/next-question", { interviewId: id }))).status).toBe(409);
    expect((await startInterview(jsonRequest("/api/start-interview", { interviewId: id }))).status).toBe(409);
  });

  it("resumes an in-progress interview instead of restarting it", async () => {
    const id = await createInterview({ type: "Mixed" });
    await evaluateAndSave(id, "Tell me about yourself.", "I am a backend engineer working on payments.");
    const data = await json(await startInterview(jsonRequest("/api/start-interview", { interviewId: id, type: "HR" })));
    expect(data.resumed).toBe(true);
    expect(data.turns).toHaveLength(1);
    expect((data.config as { type: string }).type).toBe("Mixed");
  });

  it("retires the legacy save endpoint that trusted client scores", async () => {
    const res = await legacySave();
    expect(res.status).toBe(410);
    expect(state.db!.collection("interviews").docs).toHaveLength(0);
  });
});

describe("question generation", () => {
  it("uses the stored interview type and adaptive difficulty, not client overrides", async () => {
    const id = await createInterview({ type: "Mixed", difficulty: "Adaptive" });
    const doc = state.db!.collection("interviews").docs[0] as Record<string, unknown>;
    doc.turns = [{ question: "Tell me about yourself.", answer: "…", evaluation: { overall_score: 9 } }];

    const prompts: string[] = [];
    state.llm = (p) => {
      prompts.push(p.user);
      return { text: "How would you shard a write-heavy table?", provider: "huggingface" };
    };
    const data = await json(await nextQuestion(jsonRequest("/api/next-question", { interviewId: id, type: "HR", difficulty: "Easy" })));
    expect(data.difficulty).toBe("Hard");
    expect(prompts[0]).toContain("Interview Type: Mixed");
    expect(prompts[0]).toContain("Difficulty: Hard");
  });

  it("falls back to an unasked question bank entry, never a repeat", async () => {
    const id = await createInterview({ type: "HR" });
    state.llm = () => null;
    const seen = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      const res = await nextQuestion(jsonRequest("/api/next-question", { interviewId: id }));
      const data = await json(res);
      expect(data.source).toBe("fallback");
      expect(seen.has(String(data.question))).toBe(false);
      seen.add(String(data.question));
    }
    // Bank exhausted: report unavailability instead of repeating.
    expect((await nextQuestion(jsonRequest("/api/next-question", { interviewId: id }))).status).toBe(503);
  });
});

describe("final report", () => {
  it("returns 503 instead of a templated report when AI is unavailable", async () => {
    state.llm = () => null;
    const id = await createInterview();
    Object.assign(state.db!.collection("interviews").docs[0], { status: "completed", turns: [{ question: "q", answer: "a", evaluation: goodEvaluation }] });
    const res = await report(jsonRequest("/api/ai/report", { interviewId: id }));
    expect(res.status).toBe(503);
    expect((await json(res)).report).toBeUndefined();
  });

  it("no longer builds reports from answers sent by the browser", async () => {
    state.llm = vi.fn(() => ({ text: "{}", provider: "huggingface" as const }));
    const res = await report(jsonRequest("/api/ai/report", { turns: [{ question: "q", answer: "a", evaluation: goodEvaluation }] }));
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("missing_interview_id");
    expect(state.llm).not.toHaveBeenCalled();
  });
});

describe("provider routing", () => {
  it("generates the next interview question through the question provider", async () => {
    state.llm = () => ({ text: "How would you shard a write-heavy table?", provider: "huggingface" });
    const id = await createInterview({ type: "Technical" });
    const res = await nextQuestion(jsonRequest("/api/next-question", { interviewId: id }));
    expect(res.status).toBe(200);
    const { llmText } = await import("@/lib/llm");
    const calls = vi.mocked(llmText).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(([p]) => p.task === "question")).toBe(true);
  });

  it("evaluates a single answer through the evaluation provider with a schema", async () => {
    state.llm = () => ({ text: JSON.stringify(goodEvaluation), provider: "huggingface" });
    const res = await evaluate(jsonRequest("/api/ai/evaluate", { question: "Explain caching.", answer: "Caching keeps computed results close to readers to cut latency." }));
    expect(res.status).toBe(200);
    const { llmText } = await import("@/lib/llm");
    expect(vi.mocked(llmText).mock.calls[0][0]).toMatchObject({ task: "evaluation" });
    expect(vi.mocked(llmText).mock.calls[0][0].jsonSchema).toBeTruthy();
  });

  it("rejects an evaluation with missing or out-of-range scores instead of scoring it 0", async () => {
    state.llm = () => ({ text: JSON.stringify({ ...goodEvaluation, technical_score: "7/10", depth_score: 42 }), provider: "huggingface" });
    const res = await evaluate(jsonRequest("/api/ai/evaluate", { question: "Explain caching.", answer: "Caching keeps computed results close to readers to cut latency." }));
    expect(res.status).toBe(503);
    expect((await res.json()).evaluation).toBeUndefined();
  });
});

describe("video-only interviews", () => {
  it("stores new interviews as video even if a client asks for typing", async () => {
    const id = await createInterview({ interactionMode: "typing" });
    const data = await json(await getInterview(jsonRequest(`/api/interviews/${id}`), params({ id })));
    expect((data.interview as { interactionMode: string }).interactionMode).toBe("video");
    const started = await json(await startInterview(jsonRequest("/api/start-interview", { interactionMode: "typing", type: "HR" })));
    const doc = state.db!.collection("interviews").docs.find((d) => String(d._id) === started.interviewId)!;
    expect(doc.interactionMode).toBe("video");
  });

  it("still reports the original mode of interviews taken by typing", async () => {
    const id = await createInterview();
    state.db!.collection("interviews").docs[0].interactionMode = "typing";
    const data = await json(await getInterview(jsonRequest(`/api/interviews/${id}`), params({ id })));
    expect((data.interview as { interactionMode: string }).interactionMode).toBe("typing");
  });
});
