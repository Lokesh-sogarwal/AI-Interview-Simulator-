import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "../helpers/fakeDb";
import { goodEvaluation, jsonRequest, newUser, type TestState } from "../helpers/setup";

type LLMParams = { system: string; user: string };
const state = vi.hoisted(() => ({ user: null, db: null, llm: null }) as TestState);

vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getCurrentUser: async () => state.user }));
vi.mock("@/lib/mongodb", async (orig) => ({ ...(await orig<typeof import("@/lib/mongodb")>()), getDb: async () => state.db }));
vi.mock("@/lib/llm", async (orig) => ({
  ...(await orig<typeof import("@/lib/llm")>()),
  llmText: vi.fn(async (p: LLMParams) => (state.llm ? state.llm(p) : null)),
}));

import { POST as report } from "@/app/api/ai/report/route";
import { REPORT_SCHEMA } from "@/lib/aiSchemas";
import { llmText } from "@/lib/llm";

const aiReport = {
  candidate_summary: "Explained caching trade-offs clearly.",
  technical_knowledge_score: 7,
  communication_skill_score: 7,
  confidence_score: 7,
  problem_solving_score: 7,
  english_fluency_score: 7,
  project_knowledge_score: 6,
  strengths: ["Clear structure"],
  weaknesses: ["Few metrics"],
  final_recommendation: "Hire",
};
const reply = (o: unknown) => ({ text: typeof o === "string" ? o : JSON.stringify(o), provider: "huggingface" as const });

const interviews = () => state.db!.collection("interviews");

/** Inserts an interview for the current user, shaped like a finished conversational interview. */
async function seed(extra: Record<string, unknown> = {}) {
  const { insertedId } = await interviews().insertOne({
    userId: state.user!.id,
    role: "Backend Engineer",
    type: "HR",
    experience: "2-5 years",
    status: "completed",
    turns: [{ questionId: "q1", question: "Tell me about caching.", answer: "We cached reads in Redis.", evaluation: goodEvaluation, evaluationPending: false }],
    ...extra,
  });
  return insertedId.toHexString();
}

async function call(body: unknown) {
  const res = await report(jsonRequest("/api/ai/report", body));
  return { status: res.status, data: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

beforeEach(() => {
  state.db = new FakeDb();
  state.user = newUser();
  state.llm = null;
  vi.stubEnv("HUGGINGFACE_API_KEY", "test-key");
});

describe("POST /api/ai/report", () => {
  it("generates and stores a report from the stored, evaluated interview", async () => {
    const prompts: string[] = [];
    state.llm = (p) => (prompts.push(p.user), reply(aiReport));
    const id = await seed();
    const { status, data } = await call({ interviewId: id });
    expect(status).toBe(200);
    expect(data.report).toMatchObject({ candidate_summary: aiReport.candidate_summary, strengths: ["Clear structure"], weaknesses: ["Few metrics"], final_recommendation: "Hire" });
    // Context comes from the stored record, not request defaults.
    expect(prompts[0]).toContain("Type: HR");
    expect(prompts[0]).toContain("Role: Backend Engineer");
    expect(interviews().docs[0].finalReport).toEqual(data.report);
  });

  it("asks the evaluation provider for schema-constrained output and stores the extra report fields", async () => {
    state.llm = () => reply({ ...aiReport, improvement_suggestions: ["Quantify impact"], practice_topics: ["Cache invalidation", "  "] });
    const id = await seed();
    const { status, data } = await call({ interviewId: id });
    expect(status).toBe(200);
    expect(vi.mocked(llmText).mock.calls[0][0]).toMatchObject({ task: "evaluation", jsonSchema: REPORT_SCHEMA });
    expect(data.report).toMatchObject({ improvement_suggestions: ["Quantify impact"], practice_topics: ["Cache invalidation"] });
    expect((interviews().docs[0].finalReport as { practice_topics: string[] }).practice_topics).toEqual(["Cache invalidation"]);
  });

  it.each([
    ["a missing score", { ...aiReport, problem_solving_score: undefined }],
    ["an out-of-range score", { ...aiReport, technical_knowledge_score: 70 }],
    ["a non-list strengths field", { ...aiReport, strengths: "Clear" }],
  ])("rejects a report with %s instead of filling it in", async (_label, bad) => {
    state.llm = () => reply(bad);
    const id = await seed();
    const { status, data } = await call({ interviewId: id });
    expect(status).toBe(502);
    expect(data.code).toBe("ai_invalid_output");
    expect(interviews().docs[0].finalReport).toBeUndefined();
  });

  it("returns 422 (not 400) and skips the AI for a finished interview with no answers", async () => {
    // Reproduces the production record: finished right after the opening question.
    state.llm = vi.fn(() => reply(aiReport));
    const id = await seed({ turns: [], conversation: { messages: [{ role: "interviewer", kind: "next_question" }], questions: [{ id: "q1", closedAt: null }], completed: true } });
    const { status, data } = await call({ interviewId: id });
    expect(status).toBe(422);
    expect(data.code).toBe("no_answers");
    expect(state.llm).not.toHaveBeenCalled();
  });

  it("rejects a missing interview id", async () => {
    const { status, data } = await call({});
    expect(status).toBe(400);
    expect(data.code).toBe("missing_interview_id");
  });

  it.each([["nope"], ["6adcf8fc6012d780ea7ee4c"], [123], [{ $ne: null }]])("rejects a malformed interview id %j", async (interviewId) => {
    const { status, data } = await call({ interviewId });
    expect(status).toBe(400);
    expect(data.code).toBe("invalid_interview_id");
  });

  it.each([[""], ["{not json"], ["[]"], ["null"]])("rejects a missing or non-object body %j", async (raw) => {
    const res = await report(jsonRequest("/api/ai/report", raw));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an interview that does not exist", async () => {
    expect((await call({ interviewId: new ObjectId().toHexString() })).status).toBe(404);
  });

  it("rejects unauthenticated requests before touching the database", async () => {
    const id = await seed();
    state.user = null;
    state.db = null;
    expect((await call({ interviewId: id })).status).toBe(401);
  });

  it("does not reveal or modify another user's interview", async () => {
    state.llm = () => reply(aiReport);
    const id = await seed();
    state.user = newUser();
    const { status } = await call({ interviewId: id, turns: [{ question: "q", answer: "a", evaluation: goodEvaluation }] });
    expect(status).toBe(404);
    expect(interviews().docs[0].finalReport).toBeUndefined();
  });

  it("asks for the interview to be finished first while it is in progress", async () => {
    const id = await seed({ status: "in_progress" });
    const { status, data } = await call({ interviewId: id });
    expect(status).toBe(409);
    expect(data.code).toBe("interview_not_finished");
  });

  it("refuses to report all-zero scores while every evaluation is still pending", async () => {
    state.llm = vi.fn(() => reply(aiReport));
    const id = await seed({ turns: [{ questionId: "q1", question: "q", answer: "a", evaluation: null, evaluationPending: true }] });
    const { status, data } = await call({ interviewId: id });
    expect(status).toBe(409);
    expect(data).toMatchObject({ code: "evaluation_pending", retryable: true });
    expect(state.llm).not.toHaveBeenCalled();
  });

  it("uses stored evaluations and ignores scores sent by the browser", async () => {
    const prompts: string[] = [];
    state.llm = (p) => (prompts.push(p.user), reply(aiReport));
    const id = await seed();
    const forged = { ...goodEvaluation, technical_score: 10, overall_score: 10 };
    await call({ interviewId: id, type: "Technical", turns: [{ question: "forged", answer: "forged", evaluation: forged }] });
    expect(prompts[0]).toContain("technical 7,");
    expect(prompts[0]).not.toContain("forged");
  });

  it("sends compact per-answer scores and feedback, not the full stored evaluations", async () => {
    const prompts: string[] = [];
    state.llm = (p) => (prompts.push(p.user), reply(aiReport));
    const id = await seed({ turns: [{ question: "Tell me about caching.", answer: "We cached reads in Redis.", evaluation: { ...goodEvaluation, ideal_answer: "IDEAL-ANSWER-TEXT", follow_up_question: "FOLLOW-UP-TEXT", improvement: "IMPROVEMENT-TEXT" } }] });
    await call({ interviewId: id });
    expect(prompts[0]).toContain("We cached reads in Redis.");
    expect(prompts[0]).toContain("Clear structure.");
    expect(prompts[0]).not.toMatch(/IDEAL-ANSWER-TEXT|FOLLOW-UP-TEXT|IMPROVEMENT-TEXT/);
    expect(vi.mocked(llmText).mock.calls[0][0].maxTokens).toBe(800);
  });

  it("supports legacy records that stored answers as `transcript` with no status", async () => {
    state.llm = () => reply(aiReport);
    const id = await seed({ status: undefined, turns: undefined, transcript: [{ question: "q", answer: "a", evaluation: goodEvaluation }] });
    expect((await call({ interviewId: id })).status).toBe(200);
  });

  it("returns a saved report from the database without calling the AI", async () => {
    const id = await seed({ finalReport: { ...aiReport, candidate_summary: "saved" }, reportSource: "gemini" });
    state.llm = vi.fn(() => reply({ ...aiReport, candidate_summary: "new" }));
    const { status, data } = await call({ interviewId: id });
    expect(status).toBe(200);
    expect(data).toMatchObject({ stored: true, source: "gemini", report: { candidate_summary: "saved" } });
    expect(state.llm).not.toHaveBeenCalled();
    expect((interviews().docs[0].finalReport as { candidate_summary: string }).candidate_summary).toBe("saved");
  });

  it("does not build a permanent report while some answers still await evaluation", async () => {
    state.llm = vi.fn(() => reply(aiReport));
    const id = await seed({ turns: [
      { questionId: "q1", question: "q1", answer: "a1", evaluation: goodEvaluation, evaluationPending: false },
      { questionId: "q2", question: "q2", answer: "a2", evaluation: null, evaluationPending: true },
    ] });
    const { status, data } = await call({ interviewId: id });
    expect(status).toBe(409);
    expect(data).toMatchObject({ code: "evaluation_pending", retryable: true });
    expect(state.llm).not.toHaveBeenCalled();
  });

  it("keeps the first report when two generations race", async () => {
    const id = await seed();
    state.llm = () => {
      // Another request saves its report while this one is waiting on the AI.
      interviews().docs[0].finalReport = { ...aiReport, candidate_summary: "first" };
      return reply({ ...aiReport, candidate_summary: "second" });
    };
    const { status, data } = await call({ interviewId: id });
    expect(status).toBe(200);
    expect(data.report.candidate_summary).toBe("first");
    expect((interviews().docs[0].finalReport as { candidate_summary: string }).candidate_summary).toBe("first");
  });

  it("reports an AI provider outage as 503, not a validation error", async () => {
    state.llm = () => null;
    const id = await seed();
    const { status, data } = await call({ interviewId: id });
    expect(status).toBe(503);
    expect(data.report).toBeUndefined();
    expect(interviews().docs[0].finalReport).toBeUndefined();
  });

  it("reports a thrown provider error as 503", async () => {
    state.llm = () => {
      throw new Error("socket hang up");
    };
    const id = await seed();
    expect((await call({ interviewId: id })).status).toBe(503);
  });

  it.each([["not json at all"], ["[1,2,3]"], [JSON.stringify({ strengths: [] })]])("returns 502 and stores nothing for malformed AI output %j", async (text) => {
    state.llm = () => reply(text);
    const id = await seed();
    const { status, data } = await call({ interviewId: id });
    expect(status).toBe(502);
    expect(data).toMatchObject({ code: "ai_invalid_output", retryable: true });
    expect(interviews().docs[0].finalReport).toBeUndefined();
  });

  it("returns 503 when the database is unavailable instead of falling back to client data", async () => {
    state.llm = () => reply(aiReport);
    state.db = null;
    const { status, data } = await call({ interviewId: new ObjectId().toHexString(), turns: [{ question: "q", answer: "a", evaluation: goodEvaluation }] });
    expect(status).toBe(503);
    expect(data.code).toBe("db_unavailable");
  });

  it("returns a generic 500 without internals when a database query throws", async () => {
    const id = await seed();
    vi.spyOn(interviews(), "findOne").mockRejectedValueOnce(new Error("MongoServerError: secret detail"));
    const { status, data } = await call({ interviewId: id });
    expect(status).toBe(500);
    expect(data.code).toBe("internal_error");
    expect(JSON.stringify(data)).not.toContain("secret detail");
  });

  it("handles duplicate concurrent requests without inconsistent records", async () => {
    state.llm = () => reply(aiReport);
    const id = await seed();
    const results = await Promise.all([call({ interviewId: id }), call({ interviewId: id })]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(interviews().docs).toHaveLength(1);
    expect(interviews().docs[0].finalReport).toEqual(results[1].data.report);
    expect(interviews().docs[0].turns).toHaveLength(1);
  });

  it("never logs transcripts or answers", async () => {
    const logs: string[] = [];
    for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(String(args[0])));
    state.llm = () => reply(aiReport);
    const id = await seed();
    await call({ interviewId: id });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join("\n")).not.toContain("Redis");
    expect(JSON.parse(logs[0])).toMatchObject({ scope: "ai.report", stage: "lookup", outcome: "found" });
  });
});
