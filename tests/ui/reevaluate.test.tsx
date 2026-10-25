// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "../helpers/fakeDb";
import { goodEvaluation, newUser, type TestState } from "../helpers/setup";

const state = vi.hoisted(() => ({ user: null, db: null, llm: null, refresh: vi.fn() }) as TestState & { refresh: () => void });

vi.mock("next/navigation", () => ({
  usePathname: () => "/history",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: state.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getCurrentUser: async () => state.user }));
vi.mock("@/lib/mongodb", async (orig) => ({ ...(await orig<typeof import("@/lib/mongodb")>()), getDb: async () => state.db }));
vi.mock("@/lib/llm", async (orig) => ({ ...(await orig<typeof import("@/lib/llm")>()), llmText: vi.fn(async () => null) }));

import InterviewReportView from "@/app/history/interviews/InterviewReportView";
import ReevaluateButton from "@/app/history/interviews/ReevaluateButton";
import { llmText } from "@/lib/llm";

const report = {
  candidate_summary: "Solid fundamentals.",
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

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeAll(() => {
  // jsdom lacks the modal API of <dialog>.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  state.db = new FakeDb();
  state.user = newUser();
  state.refresh = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderReport(extra: Record<string, unknown> = {}) {
  const { insertedId } = await state.db!.collection("interviews").insertOne({
    userId: state.user!.id,
    role: "Backend Engineer",
    status: "completed",
    finalReport: report,
    turns: [{ question: "Explain caching.", answer: "Redis with a TTL.", evaluation: goodEvaluation }],
    ...extra,
  });
  render(await InterviewReportView({ id: insertedId.toHexString() }));
  return insertedId.toHexString();
}

const openButton = () => screen.getByRole("button", { name: /Re-evaluate Interview/ });

describe("interview details page", () => {
  it("shows the Re-evaluate button next to the score of a completed interview, alongside the existing report", async () => {
    await renderReport();
    expect(openButton()).toBeTruthy();
    expect(screen.getByText("Solid fundamentals.")).toBeTruthy();
    expect(screen.getByText("• Clear structure")).toBeTruthy();
    expect(screen.getByText("Explain caching.")).toBeTruthy();
  });

  it("renders a saved report straight from the database without any AI call", async () => {
    await renderReport({ finalReport: { ...report, improvement_suggestions: ["Quantify impact"], practice_topics: ["Cache invalidation"] } });
    expect(screen.getByText("• Quantify impact")).toBeTruthy();
    expect(screen.getByText("Cache invalidation")).toBeTruthy();
    expect(llmText).not.toHaveBeenCalled();
  });

  it("shows the limit message on the page for an interview that was already re-evaluated", async () => {
    await renderReport({ reevaluationsUsed: 1 });
    expect(screen.getByText("Re-evaluation limit reached. This interview cannot be re-evaluated again.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Re-evaluate Interview/ })).toBeNull();
  });

  it("still opens interviews taken in the old typing mode", async () => {
    await renderReport({ interactionMode: "typing" });
    expect(screen.getByText("Typing")).toBeTruthy();
    expect(screen.getByText("Solid fundamentals.")).toBeTruthy();
  });

  it.each([
    ["an unfinished interview", { status: "in_progress" }],
    ["an interview without answers", { turns: [{ question: "q", answer: "" }] }],
  ])("hides the button for %s", async (_label, extra) => {
    await renderReport(extra);
    expect(screen.queryByRole("button", { name: /Re-evaluate Interview/ })).toBeNull();
  });
});

describe("Re-evaluate button", () => {
  it("asks for confirmation and does nothing on cancel", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReevaluateButton interviewId="abc" remaining={1} />);
    fireEvent.click(openButton());
    expect(screen.getByText("Re-evaluate this interview?")).toBeTruthy();
    expect(screen.getByText(/^The AI will analyze your saved interview answers again and generate an updated evaluation report\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Re-evaluate this interview?")?.closest("dialog")?.hasAttribute("open")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-evaluates on confirm, shows progress, then success and refreshes the report", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReevaluateButton interviewId="abc" remaining={1} />);
    fireEvent.click(openButton());
    fireEvent.click(screen.getByRole("button", { name: "Re-evaluate" }));
    const busy = screen.getByRole("button", { name: /Re-evaluating…/ }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/interviews/abc/reevaluate", { method: "POST" });
    resolve(jsonResponse(200, { ok: true, report }));
    expect(await screen.findByText("Interview re-evaluated successfully.")).toBeTruthy();
    expect(state.refresh).toHaveBeenCalledOnce();
  });

  it("prevents duplicate submissions while a request is running", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReevaluateButton interviewId="abc" remaining={1} />);
    fireEvent.click(openButton());
    const confirm = screen.getByRole("button", { name: "Re-evaluate" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole("button", { name: /Re-evaluating…/ }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a validation error (400) without a success message or retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(400, { ok: false, code: "invalid_interview_id", error: "Invalid interview id." })));
    render(<ReevaluateButton interviewId="abc" remaining={1} />);
    fireEvent.click(openButton());
    fireEvent.click(screen.getByRole("button", { name: "Re-evaluate" }));
    expect(await screen.findByText(/Invalid interview id\. Your previous report is unchanged\./)).toBeTruthy();
    expect(screen.queryByText("Interview re-evaluated successfully.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it("lets the user retry an AI-provider failure and keeps the old report until it succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { ok: false, code: "ai_unavailable", retryable: true, error: "Re-evaluation is temporarily unavailable." }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, report }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReevaluateButton interviewId="abc" remaining={1} />);
    fireEvent.click(openButton());
    fireEvent.click(screen.getByRole("button", { name: "Re-evaluate" }));
    expect(await screen.findByText(/temporarily unavailable\. Your previous report is unchanged and your re-evaluation is still available\./)).toBeTruthy();
    expect(state.refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Interview re-evaluated successfully.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a network failure as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    render(<ReevaluateButton interviewId="abc" remaining={1} />);
    fireEvent.click(openButton());
    fireEvent.click(screen.getByRole("button", { name: "Re-evaluate" }));
    expect(await screen.findByText(/Couldn't reach the server/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows that one re-evaluation is available, then the limit message after it succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { ok: true, report, remaining: 0 })));
    render(<ReevaluateButton interviewId="abc" remaining={1} />);
    expect(screen.getByText("1 re-evaluation available for this interview.")).toBeTruthy();
    fireEvent.click(openButton());
    expect(screen.getByText(/You can do this only once per interview/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Re-evaluate" }));
    expect(await screen.findByText("Interview re-evaluated successfully.")).toBeTruthy();
    expect(screen.getByText("Re-evaluation limit reached. This interview cannot be re-evaluated again.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Re-evaluate Interview/ })).toBeNull();
  });

  it("shows the limit message instead of the button once it has been used", () => {
    render(<ReevaluateButton interviewId="abc" remaining={0} />);
    expect(screen.getByText("Re-evaluation limit reached. This interview cannot be re-evaluated again.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Re-evaluate Interview/ })).toBeNull();
  });

  it("switches to the limit message if the server says the limit was reached elsewhere", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(409, { ok: false, code: "reevaluation_limit_reached", error: "Re-evaluation limit reached. This interview cannot be re-evaluated again." })));
    render(<ReevaluateButton interviewId="abc" remaining={1} />);
    fireEvent.click(openButton());
    fireEvent.click(screen.getByRole("button", { name: "Re-evaluate" }));
    expect(await screen.findByText("Re-evaluation limit reached. This interview cannot be re-evaluated again.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Re-evaluate Interview/ })).toBeNull();
  });

  it("spans the full width of its card so it fits small screens", () => {
    render(<ReevaluateButton interviewId="abc" remaining={1} />);
    expect(openButton().className).toContain("w-full");
  });
});
