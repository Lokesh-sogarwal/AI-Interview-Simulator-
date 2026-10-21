import { ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "../helpers/fakeDb";
import { jsonRequest, newUser, params, type TestState } from "../helpers/setup";

const state = vi.hoisted(() => ({ user: null, db: null, llm: null }) as TestState);

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: async () => state.user,
  setAuthCookie: async () => undefined,
}));
vi.mock("@/lib/mongodb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mongodb")>()),
  getDb: async () => state.db,
}));
vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  llmText: vi.fn(async () => null),
}));

import { POST as codeExecute } from "@/app/api/code-execute/route";
import { POST as submit } from "@/app/api/contests/submissions/route";
import { POST as register } from "@/app/api/contests/[id]/register/route";
import { POST as recordScore } from "@/app/api/contests/[id]/score/route";
import { GET as getProblem } from "@/app/api/contests/[id]/problems/route";
import { POST as createContest } from "@/app/api/contests/route";
import { POST as generateDaily } from "@/app/api/admin/generate-daily-contest/route";
import { POST as uploadResume } from "@/app/api/resume/route";
import { POST as sendOtp } from "@/app/api/auth/send-phone-otp/route";
import { POST as verifyOtp } from "@/app/api/auth/verify-phone-otp/route";
import { POST as sendEmailVerification } from "@/app/api/auth/send-email-verification/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as claimChallenge } from "@/app/api/gamification/challenges/route";
import { GET as gamificationStats, POST as gamificationStatsPost } from "@/app/api/gamification/stats/route";

const DAY = 86_400_000;

function seedContest(overrides: Record<string, unknown> = {}) {
  const contest = {
    _id: new ObjectId(),
    name: "Weekly",
    startDate: new Date(Date.now() - DAY),
    endDate: new Date(Date.now() + DAY),
    maxParticipants: 100,
    problems: [
      { title: "Echo", description: "Return a", difficulty: "Easy", constraints: "", topics: [], examples: [{ input: "a = 1", output: "1" }] },
      { title: "Echo 2", description: "Return a", difficulty: "Easy", constraints: "", topics: [], examples: [{ input: "a = 2", output: "2" }] },
    ],
    ...overrides,
  };
  state.db!.collection("contests").docs.push(contest);
  return contest;
}

function sandboxReturns(stdout: string) {
  vi.stubEnv("CODE_RUNNER_URL", "http://sandbox.test/api/v2/execute");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ run: { stdout, stderr: "", code: 0, signal: null } })));
}

beforeEach(() => {
  state.db = new FakeDb();
  state.user = newUser();
  vi.stubEnv("CODE_RUNNER_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("code execution", () => {
  it("requires authentication", async () => {
    state.user = null;
    expect((await codeExecute(jsonRequest("/api/code-execute", { code: "x", language: "python", input: "" }))).status).toBe(401);
  });

  it("never executes code locally when no sandbox is configured", async () => {
    const res = await codeExecute(jsonRequest("/api/code-execute", { code: "def solve(a):\n  return a", language: "python", input: "a = 1" }));
    expect(res.status).toBe(503);
  });

  it("validates language and size", async () => {
    expect((await codeExecute(jsonRequest("/api/code-execute", { code: "x", language: "bash", input: "" }))).status).toBe(400);
    expect((await codeExecute(jsonRequest("/api/code-execute", { code: "x".repeat(60_000), language: "python", input: "" }))).status).toBe(413);
    expect((await codeExecute(jsonRequest("/api/code-execute", "nope"))).status).toBe(400);
  });
});

describe("contest submissions and scoring", () => {
  it("requires registration and an active contest", async () => {
    const contest = seedContest();
    const body = { contestId: String(contest._id), problemIndex: 0, code: "def solve(a):\n  return a", language: "python" };
    expect((await submit(jsonRequest("/api/contests/submissions", body))).status).toBe(403);

    const ended = seedContest({ startDate: new Date(Date.now() - 3 * DAY), endDate: new Date(Date.now() - DAY) });
    state.db!.collection("contest_registrations").docs.push({ userId: state.user!.id, contestId: ended._id });
    expect((await submit(jsonRequest("/api/contests/submissions", { ...body, contestId: String(ended._id) }))).status).toBe(403);
  });

  it("judges on the server and ignores a client-claimed pass", async () => {
    const contest = seedContest();
    await register(jsonRequest(`/api/contests/${contest._id}/register`, {}), params({ id: String(contest._id) }));
    sandboxReturns("999");
    const res = await submit(
      jsonRequest("/api/contests/submissions", { contestId: String(contest._id), problemIndex: 0, code: "def solve(a):\n  return 999", language: "python", passed: true }),
    );
    const data = await res.json();
    expect(data.passed).toBe(false);
    expect(state.db!.collection("contest_submissions").docs[0].passed).toBe(false);
    expect(state.db!.collection("contest_registrations").docs[0].score).toBe(0);
  });

  it("derives the contest score from accepted submissions", async () => {
    const contest = seedContest();
    await register(jsonRequest(`/api/contests/${contest._id}/register`, {}), params({ id: String(contest._id) }));
    sandboxReturns("1");
    const data = await (
      await submit(jsonRequest("/api/contests/submissions", { contestId: String(contest._id), problemIndex: 0, code: "def solve(a):\n  return a", language: "python" }))
    ).json();
    expect(data.passed).toBe(true);
    expect(data.score).toBe(50);

    // A client-supplied score is ignored by the score endpoint.
    const scored = await (await recordScore(jsonRequest(`/api/contests/${contest._id}/score`, { score: 100 }), params({ id: String(contest._id) }))).json();
    expect(scored.score).toBe(50);
  });

  it("prevents duplicate registration", async () => {
    const contest = seedContest();
    state.db!.collection("contest_registrations").uniqueKeys = [["contestId", "userId"]];
    const id = String(contest._id);
    expect((await register(jsonRequest(`/api/contests/${id}/register`, {}), params({ id }))).status).toBe(200);
    expect((await register(jsonRequest(`/api/contests/${id}/register`, {}), params({ id }))).status).toBe(409);
    expect(state.db!.collection("contest_registrations").docs).toHaveLength(1);
  });

  it("hides problems before the contest starts and strips hidden tests", async () => {
    const upcoming = seedContest({ startDate: new Date(Date.now() + DAY), endDate: new Date(Date.now() + 2 * DAY) });
    expect((await getProblem(jsonRequest(`/api/contests/${upcoming._id}/problems?index=0`), params({ id: String(upcoming._id) }))).status).toBe(403);

    const active = seedContest();
    (active.problems as Array<Record<string, unknown>>)[0].tests = [{ input: "a = 5", output: "5" }];
    const data = await (await getProblem(jsonRequest(`/api/contests/${active._id}/problems?index=0`), params({ id: String(active._id) }))).json();
    expect(data.problem.tests).toBeUndefined();
    expect((await getProblem(jsonRequest(`/api/contests/${active._id}/problems?index=9`), params({ id: String(active._id) }))).status).toBe(400);
  });
});

describe("admin authorization", () => {
  it("checks admin rights in the database, not just the token claim", async () => {
    state.user = newUser({ isAdmin: true });
    state.db!.collection("users").docs.push({ _id: new ObjectId(state.user.id), isAdmin: false });
    const body = { name: "X", startDate: new Date().toISOString(), endDate: new Date(Date.now() + DAY).toISOString() };
    expect((await createContest(jsonRequest("/api/contests", body))).status).toBe(403);
    expect((await generateDaily()).status).toBe(403);
  });

  it("allows real admins and validates input", async () => {
    state.db!.collection("users").docs.push({ _id: new ObjectId(state.user!.id), isAdmin: true });
    expect((await createContest(jsonRequest("/api/contests", { name: "X", startDate: "bad", endDate: "bad" }))).status).toBe(400);
    const ok = await createContest(
      jsonRequest("/api/contests", { name: "X", startDate: new Date().toISOString(), endDate: new Date(Date.now() + DAY).toISOString(), problemCount: 2 }),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).problemSource).toBe("curated");
  });
});

describe("resume upload", () => {
  function upload(file: File | null, extra: RequestInit = {}) {
    const form = new FormData();
    if (file) form.set("resume", file);
    return uploadResume(new Request("http://localhost/api/resume", { method: "POST", body: form, ...extra }));
  }

  it("requires authentication", async () => {
    state.user = null;
    expect((await upload(new File(["hi"], "cv.txt", { type: "text/plain" }))).status).toBe(401);
  });

  it("rejects missing, empty, unsupported and oversized files", async () => {
    expect((await upload(null)).status).toBe(400);
    expect((await upload(new File([], "cv.pdf", { type: "application/pdf" }))).status).toBe(400);
    expect((await upload(new File(["PK\u0003\u0004 word"], "cv.docx"))).status).toBe(415);
    expect((await upload(new File(["not really a pdf"], "cv.pdf", { type: "application/pdf" }))).status).toBe(415);
    expect((await upload(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "cv.pdf", { type: "application/pdf" }))).status).toBe(413);
  });

  it("rejects non-multipart bodies", async () => {
    const res = await uploadResume(new Request("http://localhost/api/resume", { method: "POST", body: "x", headers: { "Content-Type": "text/plain" } }));
    expect(res.status).toBe(400);
  });

  it("extracts plain-text resumes", async () => {
    const data = await (await upload(new File(["Jane Doe\nTypeScript, React"], "../../etc/cv.txt", { type: "text/plain" }))).json();
    expect(data.ok).toBe(true);
    expect(data.resumeText).toContain("TypeScript");
    expect(data.filename).toBe("cv.txt");
  });
});

describe("auth abuse protection", () => {
  it("does not reveal whether an account exists", async () => {
    state.db!.collection("users").docs.push({ _id: new ObjectId(), email: "has-phone@example.com", phone: "+15550100" });
    const known = await (await sendOtp(jsonRequest("/api/auth/send-phone-otp", { email: "has-phone@example.com" }))).json();
    const unknown = await (await sendOtp(jsonRequest("/api/auth/send-phone-otp", { email: "nobody@example.com" }))).json();
    expect(known).toEqual(unknown);
    const ev1 = await (await sendEmailVerification(jsonRequest("/api/auth/send-email-verification", { email: "has-phone@example.com" }))).json();
    const ev2 = await (await sendEmailVerification(jsonRequest("/api/auth/send-email-verification", { email: "nobody@example.com" }))).json();
    expect(ev1).toEqual(ev2);
  });

  it("locks an OTP after repeated wrong guesses", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    state.db!.collection("users").docs.push({
      _id: new ObjectId(),
      email: "otp@example.com",
      phoneOtpHash: await bcrypt.hash("123456", 4),
      phoneOtpExpires: new Date(Date.now() + 60_000),
    });
    for (let i = 0; i < 5; i += 1) {
      expect((await verifyOtp(jsonRequest("/api/auth/verify-phone-otp", { email: "otp@example.com", otp: "000000" }))).status).toBe(400);
    }
    // Even the right code no longer works once the attempt cap is reached.
    const res = await verifyOtp(jsonRequest("/api/auth/verify-phone-otp", { email: "otp@example.com", otp: "123456" }));
    expect(res.status).toBe(400);
  });

  it("rejects duplicate signups even when they race", async () => {
    vi.stubEnv("JWT_SECRET", "x".repeat(40));
    state.db!.collection("users").uniqueKeys = [["email"]];
    const body = { name: "A", email: "dup@example.com", password: "password123", dob: "2000-01-01" };
    expect((await signup(jsonRequest("/api/auth/signup", body))).status).toBe(200);
    expect((await signup(jsonRequest("/api/auth/signup", body))).status).toBe(409);
  });

  it("validates signup input", async () => {
    expect((await signup(jsonRequest("/api/auth/signup", { name: "A", email: "bad", password: "password123", dob: "2000-01-01" }))).status).toBe(400);
    expect((await signup(jsonRequest("/api/auth/signup", { name: "A", email: "a@b.co", password: "short", dob: "2000-01-01" }))).status).toBe(400);
    expect((await signup(jsonRequest("/api/auth/signup", { name: "A", email: "a@b.co", password: "password123", dob: "2099-01-01" }))).status).toBe(403);
  });
});

describe("gamification integrity", () => {
  it("refuses to award challenge points without real activity", async () => {
    state.db!.collection("users").docs.push({ _id: new ObjectId(state.user!.id) });
    const res = await claimChallenge(jsonRequest("/api/gamification/challenges", { challengeId: "improve_score" }));
    expect(res.status).toBe(400);
  });

  it("awards a challenge once when its requirement is met", async () => {
    state.db!.collection("users").docs.push({ _id: new ObjectId(state.user!.id) });
    state.db!.collection("interviews").docs.push({ userId: state.user!.id, status: "completed", completedAt: new Date(), averageScore: 8.5 });
    expect((await claimChallenge(jsonRequest("/api/gamification/challenges", { challengeId: "improve_score" }))).status).toBe(200);
    expect((await claimChallenge(jsonRequest("/api/gamification/challenges", { challengeId: "improve_score" }))).status).toBe(409);
  });

  it("derives points from activity and ignores client-sent actions", async () => {
    state.db!.collection("users").docs.push({ _id: new ObjectId(state.user!.id) });
    const posted = await (await gamificationStatsPost()).json();
    expect(posted.points).toBe(0);
    state.db!.collection("interviews").docs.push({ userId: state.user!.id, status: "completed", completedAt: new Date(), averageScore: 9 });
    const stats = await (await gamificationStats()).json();
    expect(stats).toMatchObject({ points: 75, totalInterviews: 1, bestScore: 9 });
  });
});
