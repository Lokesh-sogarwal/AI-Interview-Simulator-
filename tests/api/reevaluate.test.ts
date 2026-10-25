import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "../helpers/fakeDb";
import { goodEvaluation, jsonRequest, newUser, params, type TestState } from "../helpers/setup";

type LLMParams = { system: string; user: string };
const state = vi.hoisted(() => ({ user: null, db: null, llm: null }) as TestState);

vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getCurrentUser: async () => state.user }));
vi.mock("@/lib/mongodb", async (orig) => ({ ...(await orig<typeof import("@/lib/mongodb")>()), getDb: async () => state.db }));
vi.mock("@/lib/llm", async (orig) => ({
  ...(await orig<typeof import("@/lib/llm")>()),
  llmText: vi.fn(async (p: LLMParams) => (state.llm ? state.llm(p) : null)),
}));

import { POST as reevaluate } from "@/app/api/interviews/[id]/reevaluate/route";
import { POST as report } from "@/app/api/ai/report/route";
import { llmText } from "@/lib/llm";

const reply = (o: unknown) => ({ text: typeof o === "string" ? o : JSON.stringify(o), provider: "huggingface" as const });
const newEval = { ...goodEvaluation, technical_score: 8, clarity_score: 8, confidence_score: 8, depth_score: 8, overall_score: 8, strengths: "Re-scored strength." };
const newReport = {
  candidate_summary: "Updated summary.",
  technical_knowledge_score: 8,
  communication_skill_score: 8,
  confidence_score: 8,
  problem_solving_score: 8,
  english_fluency_score: 7,
  project_knowledge_score: 6,
  strengths: ["Depth"],
  weaknesses: ["Brevity"],
  final_recommendation: "Hire",
};
const oldReport = { ...newReport, candidate_summary: "Original summary." };

/**
 * Evaluation prompts get `evalReply` (wrapped per item for batch prompts),
 * report prompts get `reportReply`.
 */
function ai(evalReply: unknown = newEval, reportReply: unknown = newReport, calls: string[] = []) {
  return (p: LLMParams) => {
    const isReport = p.system.includes("FINAL REPORT CARD");
    const ids = [...p.user.matchAll(/^### Item (\d+)$/gm)].map((m) => Number(m[1]));
    calls.push(isReport ? "report" : ids.length ? "batch" : "eval");
    const out = isReport ? reportReply : evalReply;
    if (out === null) return null;
    return reply(!isReport && ids.length && typeof out === "object" ? { evaluations: ids.map((id) => ({ id, ...(out as object) })) } : out);
  };
}

const interviews = () => state.db!.collection("interviews");
const stored = () => interviews().docs[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function seed(extra: Record<string, unknown> = {}) {
  const { insertedId } = await interviews().insertOne({
    userId: state.user!.id,
    role: "Backend Engineer",
    type: "Technical",
    status: "completed",
    averageScore: 7,
    finalReport: oldReport,
    turns: [
      { questionId: "q1", question: "Explain caching.", answer: "We cached reads in Redis with a TTL.", exchange: "Candidate: We cached reads in Redis with a TTL.", evaluation: goodEvaluation, evaluationPending: false, star: { star_used: true } },
      { questionId: "q2", question: "Skipped one.", answer: "", evaluation: { ...goodEvaluation, overall_score: 0 }, evaluationPending: false },
    ],
    ...extra,
  });
  return insertedId.toHexString();
}

async function call(id: string) {
  const res = await reevaluate(jsonRequest(`/api/interviews/${id}/reevaluate`, {}), params({ id }));
  return { status: res.status, data: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

beforeEach(() => {
  state.db = new FakeDb();
  state.user = newUser();
  state.llm = null;
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
});

describe("POST /api/interviews/[id]/reevaluate", () => {
  it("re-scores every saved answer, regenerates the report and persists both", async () => {
    const calls: string[] = [];
    state.llm = ai(newEval, newReport, calls);
    const id = await seed();
    const { status, data } = await call(id);
    expect(status).toBe(200);
    expect(calls).toEqual(["batch", "report"]); // one call for all answers; the unanswered one is not sent
    expect(data.report.candidate_summary).toBe("Updated summary.");
    const doc = stored();
    expect(doc.finalReport.candidate_summary).toBe("Updated summary.");
    expect(doc.turns[0].evaluation.strengths).toBe("Re-scored strength.");
    expect(doc.averageScore).toBe(data.averageScore);
    expect(doc.evaluationVersion).toBe(1);
    expect(doc.lastEvaluatedAt).toBeInstanceOf(Date);
    expect(doc.reevaluation).toBeUndefined();
  });

  it("uses only free models for every AI call", async () => {
    state.llm = ai();
    const id = await seed();
    expect((await call(id)).status).toBe(200);
    const calls = vi.mocked(llmText).mock.calls;
    expect(calls.length).toBe(2);
    expect(calls.every(([p]) => p.freeOnly === true && p.task === "evaluation" && p.jsonSchema)).toBe(true);
  });

  it("scores more answers than one batch holds in several batches", async () => {
    const calls: string[] = [];
    state.llm = ai(newEval, newReport, calls);
    const turns = Array.from({ length: 8 }, (_, i) => ({ questionId: `q${i}`, question: `Question ${i}?`, answer: `A real answer about topic ${i} with detail.`, evaluation: goodEvaluation }));
    const id = await seed({ turns });
    expect((await call(id)).status).toBe(200);
    expect(calls.filter((c) => c === "batch")).toHaveLength(2);
    expect(stored().turns.every((t: { evaluation: { strengths: string } }) => t.evaluation.strengths === "Re-scored strength.")).toBe(true);
  });

  it("retries an item the batch reply left out, on its own", async () => {
    const calls: string[] = [];
    state.llm = (p) => {
      const base = ai(newEval, newReport, calls)(p);
      if (p.user.includes("### Item")) return reply({ evaluations: [] }); // model dropped the item
      return base;
    };
    const id = await seed();
    expect((await call(id)).status).toBe(200);
    expect(calls).toEqual(["batch", "eval", "report"]);
  });

  it("rejects out-of-range or missing scores as invalid output and keeps the old result", async () => {
    state.llm = ai({ ...newEval, technical_score: 85, clarity_score: undefined });
    const id = await seed();
    const { status, data } = await call(id);
    expect(status).toBe(502);
    expect(data.code).toBe("ai_invalid_output");
    expect(stored().turns[0].evaluation).toEqual(goodEvaluation);
  });

  it("refuses with 503 when no free model is configured, before touching any data", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "paid-key");
    state.llm = vi.fn(ai());
    const id = await seed();
    const { status, data } = await call(id);
    expect(status).toBe(503);
    expect(data.code).toBe("ai_not_configured");
    expect(state.llm).not.toHaveBeenCalled();
    expect(stored().finalReport.candidate_summary).toBe("Original summary.");
  });

  it("preserves questions, answers, transcript extras and metadata", async () => {
    state.llm = ai();
    const id = await seed();
    const before = structuredClone({ turns: stored().turns.map(({ question, answer, exchange, star }: Record<string, unknown>) => ({ question, answer, exchange, star })), role: stored().role });
    await call(id);
    expect(stored().turns.map(({ question, answer, exchange, star }: Record<string, unknown>) => ({ question, answer, exchange, star }))).toEqual(before.turns);
    expect(stored().turns[1].evaluation.overall_score).toBe(0);
    expect(stored().role).toBe(before.role);
    expect(interviews().docs).toHaveLength(1);
  });

  it("rejects unauthenticated requests", async () => {
    const id = await seed();
    state.user = null;
    expect((await call(id)).status).toBe(401);
  });

  it("does not reveal or touch another user's interview", async () => {
    state.llm = ai();
    const id = await seed();
    state.user = newUser();
    expect((await call(id)).status).toBe(404);
    expect(stored().finalReport.candidate_summary).toBe("Original summary.");
  });

  it("rejects a malformed id and a missing interview", async () => {
    expect((await call("nope")).data.code).toBe("invalid_interview_id");
    expect((await call(new ObjectId().toHexString())).status).toBe(404);
  });

  it("returns 422 when there are no saved answers", async () => {
    state.llm = vi.fn(ai());
    const id = await seed({ turns: [] });
    const { status, data } = await call(id);
    expect(status).toBe(422);
    expect(data.code).toBe("no_answers");
    expect(state.llm).not.toHaveBeenCalled();
  });

  it("refuses interviews that are still in progress", async () => {
    const id = await seed({ status: "in_progress" });
    expect((await call(id)).data.code).toBe("interview_not_finished");
  });

  it("keeps the previous evaluation and report when an answer can't be re-scored", async () => {
    state.llm = ai(null);
    const id = await seed();
    const { status, data } = await call(id);
    expect(status).toBe(503);
    expect(data.retryable).toBe(true);
    expect(stored().finalReport.candidate_summary).toBe("Original summary.");
    expect(stored().turns[0].evaluation).toEqual(goodEvaluation);
    expect(stored().reevaluation).toBeUndefined();
  });

  it("keeps the previous result when the report step fails or returns malformed output", async () => {
    const id = await seed();
    state.llm = ai(newEval, null);
    expect((await call(id)).status).toBe(503);
    state.llm = ai(newEval, "not json");
    const bad = await call(id);
    expect(bad.status).toBe(502);
    expect(bad.data.code).toBe("ai_invalid_output");
    expect(stored().finalReport.candidate_summary).toBe("Original summary.");
    expect(stored().turns[0].evaluation).toEqual(goodEvaluation);
  });

  it("allows only one re-evaluation at a time per interview", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls: string[] = [];
    const base = ai(newEval, newReport, calls);
    state.llm = vi.fn(async (p: LLMParams) => (await gate, base(p))) as unknown as TestState["llm"];
    const id = await seed();
    const first = call(id);
    await vi.waitFor(() => expect(stored().reevaluation).toBeTruthy());
    const second = await call(id);
    expect(second.status).toBe(409);
    expect(second.data.code).toBe("reevaluation_in_progress");
    release();
    expect((await first).status).toBe(200);
    expect(calls.filter((c) => c === "report")).toHaveLength(1);
    expect(stored().evaluationVersion).toBe(1);
  });

  it("takes over a lock left behind by a crashed run", async () => {
    state.llm = ai();
    const id = await seed({ reevaluation: { requestId: "dead", startedAt: new Date(Date.now() - 10 * 60_000) } });
    expect((await call(id)).status).toBe(200);
  });

  it("returns 503 when the database is unavailable and 500 without internals when it throws", async () => {
    const id = await seed();
    vi.spyOn(interviews(), "findOne").mockRejectedValueOnce(new Error("MongoServerError: secret"));
    const thrown = await call(id);
    expect(thrown.status).toBe(500);
    expect(JSON.stringify(thrown.data)).not.toContain("secret");
    state.db = null;
    expect((await call(id)).data.code).toBe("db_unavailable");
  });

  it("re-evaluates legacy records stored under `transcript` in place", async () => {
    state.llm = ai();
    const id = await seed({ status: undefined, turns: undefined, transcript: [{ question: "q", answer: "A real answer about indexes.", evaluation: goodEvaluation }] });
    expect((await call(id)).status).toBe(200);
    expect(stored().transcript[0].evaluation.strengths).toBe("Re-scored strength.");
    expect(stored().turns).toBeUndefined();
  });

  describe("one re-evaluation per interview", () => {
    it("allows the first, records it, and rejects the second without calling the AI", async () => {
      state.llm = ai();
      const id = await seed();
      const first = await call(id);
      expect(first.status).toBe(200);
      expect(first.data.remaining).toBe(0);
      expect(stored()).toMatchObject({ reevaluationsUsed: 1, reevaluationStatus: "succeeded" });
      expect(stored().reevaluatedAt).toBeInstanceOf(Date);

      state.llm = vi.fn(ai(newEval, { ...newReport, candidate_summary: "Should never be saved." }));
      const second = await call(id);
      expect(second.status).toBe(409);
      expect(second.data).toMatchObject({ code: "reevaluation_limit_reached", error: "Re-evaluation limit reached. This interview cannot be re-evaluated again." });
      expect(state.llm).not.toHaveBeenCalled();
      expect(stored().finalReport.candidate_summary).toBe("Updated summary.");
      expect(stored().reevaluationsUsed).toBe(1);
    });

    it("does not count failed attempts, so the user can retry", async () => {
      const id = await seed();
      state.llm = ai(null);
      expect((await call(id)).status).toBe(503);
      expect(stored()).toMatchObject({ reevaluationStatus: "failed" });
      expect(stored().reevaluationsUsed).toBeUndefined();
      expect(stored().reevaluation).toBeUndefined();
      state.llm = ai();
      expect((await call(id)).status).toBe(200);
      expect(stored().reevaluationsUsed).toBe(1);
      expect((await call(id)).status).toBe(409);
    });

    it("lets only one of several simultaneous requests through", async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const base = ai();
      state.llm = vi.fn(async (p: LLMParams) => (await gate, base(p))) as unknown as TestState["llm"];
      const id = await seed();
      const runs = [call(id), call(id), call(id)];
      await vi.waitFor(() => expect(stored().reevaluation).toBeTruthy());
      release();
      const results = await Promise.all(runs);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      expect(stored().reevaluationsUsed).toBe(1);
      expect((await call(id)).data.code).toBe("reevaluation_limit_reached");
    });

    it("can't double-count when a stalled run's reservation was taken over", async () => {
      const id = await seed();
      let takeover = true;
      state.llm = (p) => {
        // While the first run waits on the AI, its lock goes stale and a second run takes over and succeeds.
        if (takeover && p.system.includes("FINAL REPORT CARD")) {
          takeover = false;
          Object.assign(stored(), { reevaluation: { requestId: "other-run", startedAt: new Date() } });
          Object.assign(stored(), { reevaluationsUsed: 1, reevaluationStatus: "succeeded" });
          delete stored().reevaluation;
        }
        return ai()(p);
      };
      const res = await call(id);
      expect(res.status).toBe(409);
      expect(stored().reevaluationsUsed).toBe(1);
    });

    it("ignores any counter or user id sent by the client", async () => {
      state.llm = ai();
      const id = await seed({ reevaluationsUsed: 1 });
      const res = await reevaluate(jsonRequest(`/api/interviews/${id}/reevaluate`, { reevaluationsUsed: 0, userId: state.user!.id }), params({ id }));
      expect(res.status).toBe(409);
    });
  });

  it("leaves the regular report endpoint working on the re-evaluated record", async () => {
    state.llm = ai();
    const id = await seed();
    await call(id);
    const res = await report(jsonRequest("/api/ai/report", { interviewId: id }));
    expect(res.status).toBe(200);
  });
});
