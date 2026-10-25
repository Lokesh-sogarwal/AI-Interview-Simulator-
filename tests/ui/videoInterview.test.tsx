// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/interview",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// The face detector loads MediaPipe; it is not under test here.
vi.mock("@/app/interview/faceDetector", () => ({ createFaceDetector: async () => null }));

import ConversationInterview from "@/app/interview/ConversationInterview";
import { DETAILS_KEY } from "@/app/lib/interviewStorage";

// ---------- Fake media, speech and server ----------

class FakeTrack {
  enabled = true;
  readyState = "live";
  private listeners: Record<string, Array<() => void>> = {};
  stop = vi.fn(() => {
    this.readyState = "ended";
  });
  constructor(public kind: "audio" | "video") {}
  addEventListener(type: string, fn: () => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  /** Simulates the device being unplugged. */
  unplug() {
    this.readyState = "ended";
    this.listeners.ended?.forEach((f) => f());
  }
}

class FakeMediaStream {
  tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
  addTrack(t: FakeTrack) {
    this.tracks.push(t);
  }
  removeTrack(t: FakeTrack) {
    this.tracks = this.tracks.filter((x) => x !== t);
  }
}

type ResultList = Array<{ isFinal: boolean; 0: { transcript: string } }>;
class FakeRecognition {
  static last: FakeRecognition | null = null;
  continuous = false;
  interimResults = false;
  lang = "";
  running = false;
  /** Words the recogniser finalises when stopped (as Chrome does with pending speech). */
  finalOnStop = "";
  onresult: ((e: { resultIndex: number; results: ResultList }) => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => {
    if (this.running) throw new Error("already started");
    this.running = true;
  });
  stop = vi.fn(() => {
    if (!this.running) return;
    this.running = false;
    const pending = this.finalOnStop;
    this.finalOnStop = "";
    queueMicrotask(() => {
      if (pending) this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: pending } }] });
      this.onend?.();
    });
  });
  abort = vi.fn(() => {
    this.running = false;
  });
  constructor() {
    FakeRecognition.last = this;
  }
  say(text: string, isFinal: boolean) {
    act(() => this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] }));
  }
}

class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  lang = "";
  rate = 1;
  voice: unknown = null;
  constructor(public text: string) {}
}
const synth = {
  speaking: false,
  queue: [] as FakeUtterance[],
  speak: vi.fn((u: FakeUtterance) => {
    synth.speaking = true;
    synth.queue.push(u);
  }),
  cancel: vi.fn(() => {
    synth.speaking = false;
  }),
  getVoices: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  /** The interviewer finishes reading the current question. */
  finish() {
    const u = synth.queue.shift();
    synth.speaking = false;
    u?.onend?.();
  },
};

class FakeRecorder {
  static isTypeSupported = () => true;
  static last: FakeRecorder | null = null;
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  pause() {
    this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(4000)], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

const ID = "6adcf94ce47615dfd94083e8";
type Turn = { requestId: string; action: string; text: string; timedOut?: boolean };
type Reply = { status: number; body: Record<string, unknown> } | Promise<{ status: number; body: Record<string, unknown> }>;
let tracks: FakeTrack[] = [];

function fakeServer(onTurn: (turn: Turn, n: number) => Reply, onTranscribe: (n: number) => Reply = () => ({ status: 200, body: { ok: true, text: "I would cache reads in Redis" } })) {
  const turns: Turn[] = [];
  const calls: string[] = [];
  const proctorEvents: Array<{ type: string; durationMs?: number; resolved?: boolean }> = [];
  let questions = 1;
  let transcribes = 0;
  const messages: Array<Record<string, unknown>> = [];
  const state = (completed = false) => ({ status: completed ? "completed" : "awaiting_candidate", questionNumber: questions, maxMainQuestions: 6, secondsLeft: 900, sessionSeconds: 900 });
  const interviewer = (text: string) => {
    const m = { id: `i${messages.length}`, role: "interviewer", text, kind: "next_question", questionId: `q${questions}`, at: new Date().toISOString() };
    messages.push(m);
    return m;
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (url === "/api/start-interview") return json(200, { ok: true, interviewId: ID });
    if (url === `/api/interviews/${ID}/proctoring/session`) return json(200, { ok: true, sessionId: "00000000-0000-4000-8000-000000000001" });
    if (url === `/api/interviews/${ID}/proctoring/events`) {
      proctorEvents.push(...(JSON.parse(String(init?.body)).events as Array<{ type: string }>));
      return json(200, { ok: true });
    }
    if (url === `/api/interviews/${ID}`) return json(200, { ok: true, interview: { status: "in_progress", scheduledFor: null } });
    if (url === `/api/interviews/${ID}/conversation` && method === "GET") return json(200, { ok: true, messages: [] });
    if (url === `/api/interviews/${ID}/transcribe`) {
      const r = await onTranscribe(++transcribes);
      return json(r.status, r.body);
    }
    if (url === `/api/interviews/${ID}/conversation`) {
      const turn = JSON.parse(String(init?.body)) as Turn;
      if (turn.action === "start") return json(200, { ok: true, message: interviewer("Hi! First question: how would you cache a read-heavy API?"), messages: [...messages], state: state() });
      turns.push(turn);
      const r = await onTurn(turn, turns.length);
      if (r.status !== 200) return json(r.status, r.body);
      messages.push({ id: `c${messages.length}`, role: "candidate", text: turn.text || "(No answer: time ran out)", kind: turn.action === "skip" ? "skip" : "answer", questionId: `q${questions}`, at: new Date().toISOString() });
      const closing = r.body.closing === true;
      if (!closing) questions += 1;
      const message = interviewer(closing ? "Thanks, that's the end of the interview." : `Question ${questions}: next one.`);
      return json(200, { ok: true, message, messages: [...messages], state: state(closing) });
    }
    if (url === `/api/interviews/${ID}/finish`) return json(200, { ok: true, status: "completed", averageScore: 6, pendingEvaluations: 0 });
    if (url === "/api/ai/report") return json(200, { ok: true, report: { candidate_summary: "Summary.", technical_knowledge_score: 6, communication_skill_score: 6, confidence_score: 6, problem_solving_score: 6, english_fluency_score: 6, project_knowledge_score: 5, strengths: [], weaknesses: [], final_recommendation: "No Hire" } });
    return json(404, { ok: false });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { turns, calls, proctorEvents };
}

const ok = () => ({ status: 200, body: {} });
const flush = (ms = 0) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});
const answerClock = () => screen.getByText(/Answer time|Time's up/).parentElement!.textContent ?? "";
const rec = () => FakeRecognition.last!;

/** Lobby → allow devices → start → the interviewer has read the first question. */
async function joinCall({ strict = false, readQuestion = true } = {}) {
  render(strict ? <StrictMode><ConversationInterview /></StrictMode> : <ConversationInterview />);
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "Allow camera and microphone" }));
  await flush();
  fireEvent.click(screen.getByLabelText(/agree to proctoring/));
  fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
  await flush();
  await flush();
  if (readQuestion) {
    act(() => synth.finish());
    await flush();
  }
}

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  window.localStorage.setItem(DETAILS_KEY, JSON.stringify({ type: "Technical", difficulty: "Medium", role: "Backend Engineer", experience: "2-5 years" }));
  tracks = [];
  synth.queue = [];
  synth.speaking = false;
  FakeRecognition.last = null;
  FakeRecorder.last = null;
  vi.stubGlobal("MediaStream", FakeMediaStream);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechRecognition", FakeRecognition);
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async (c: { audio?: unknown; video?: unknown }) => {
        const made = [c.audio ? new FakeTrack("audio") : null, c.video ? new FakeTrack("video") : null].filter(Boolean) as FakeTrack[];
        tracks.push(...made);
        return new FakeMediaStream(made);
      }),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------- Tests ----------

describe("video interview lobby", () => {
  it("requests camera and microphone together and only then allows starting", async () => {
    fakeServer(ok);
    render(<ConversationInterview />);
    await flush();
    expect((screen.getByRole("button", { name: "Start interview" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/type/i, { selector: "button" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Allow camera and microphone" }));
    await flush();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: expect.anything(), video: expect.anything() }));
    expect(screen.getByLabelText("Your camera preview")).toBeTruthy();
    // Still needs the proctoring agreement.
    expect((screen.getByRole("button", { name: "Start interview" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/agree to proctoring/));
    expect((screen.getByRole("button", { name: "Start interview" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("blocks starting when the microphone is denied, but not when only the camera is missing", async () => {
    fakeServer(ok);
    const gum = vi.fn(async (c: { audio?: unknown; video?: unknown }) => {
      if (c.video) throw Object.assign(new Error("no camera"), { name: "NotFoundError" });
      return new FakeMediaStream([new FakeTrack("audio")]);
    });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: gum } });
    render(<ConversationInterview />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Allow camera and microphone" }));
    await flush();
    expect(screen.getByText(/You can still interview with audio only/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/agree to proctoring/));
    expect((screen.getByRole("button", { name: "Start interview" }) as HTMLButtonElement).disabled).toBe(false);

    cleanup();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }))) } });
    render(<ConversationInterview />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Allow camera and microphone" }));
    await flush();
    expect(screen.getAllByText(/Blocked\. Allow it in your browser/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText(/agree to proctoring/));
    expect((screen.getByRole("button", { name: "Start interview" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("in the call", () => {
  it("reads the question aloud and only starts the 60s timer once it has been read", async () => {
    fakeServer(ok);
    await joinCall({ readQuestion: false });
    expect(synth.speak).toHaveBeenCalledWith(expect.objectContaining({ text: "Hi! First question: how would you cache a read-heavy API?" }));
    expect(screen.getAllByText("Interviewer is speaking").length).toBeGreaterThan(0);
    expect(rec()?.running ?? false).toBe(false); // never listens over the interviewer
    await flush(20_000);
    expect(answerClock()).toContain("01:00");
    act(() => synth.finish());
    await flush();
    expect(rec().running).toBe(true);
    await flush(1_000);
    expect(answerClock()).toContain("00:59");
  });

  it("captures spoken words as captions and saves the answer after a pause", async () => {
    const server = fakeServer(ok);
    await joinCall();
    rec().say("I would use Redis", false);
    expect(screen.getByText("I would use Redis")).toBeTruthy();
    rec().say("I would use Redis with a TTL", true);
    await flush(1_800);
    expect(server.turns).toEqual([expect.objectContaining({ action: "reply", text: "I would use Redis with a TTL" })]);
    expect(server.turns[0].timedOut).toBeUndefined();
  });

  it("at time-out stops listening, finalises pending speech and submits it once", async () => {
    const server = fakeServer(ok);
    await joinCall();
    rec().say("cache aside with", false);
    rec().finalOnStop = "cache aside with invalidation";
    await flush(60_000);
    await flush();
    expect(rec().stop).toHaveBeenCalled();
    expect(server.turns).toEqual([expect.objectContaining({ action: "reply", text: "cache aside with invalidation", timedOut: true })]);
  });

  it("keeps unfinalised words if the recogniser doesn't finalise them in time", async () => {
    const server = fakeServer(ok);
    await joinCall();
    rec().say("partial thought about sharding", false);
    await flush(60_000);
    await flush(1_500);
    expect(server.turns[0]).toMatchObject({ action: "reply", text: "partial thought about sharding", timedOut: true });
  });

  it("records a timed-out question with no speech as unanswered", async () => {
    const server = fakeServer(ok);
    await joinCall();
    await flush(60_000);
    await flush(1_500);
    expect(server.turns[0]).toMatchObject({ action: "skip", text: "", timedOut: true });
  });

  it("gives the next question a fresh 60 seconds once it has been read", async () => {
    fakeServer(ok);
    await joinCall();
    await flush(30_000);
    rec().say("my full answer here", true);
    fireEvent.click(screen.getByRole("button", { name: "Done answering" }));
    await flush();
    await flush();
    expect(screen.getAllByText("Question 2: next one.").length).toBeGreaterThan(0);
    await flush(5_000); // still being read aloud
    expect(answerClock()).toContain("01:00");
    act(() => synth.finish());
    await flush();
    await flush(1_000);
    expect(answerClock()).toContain("00:59");
  });

  it("does not double-submit when Done and the timeout land together", async () => {
    const server = fakeServer(ok);
    await joinCall();
    // Still speaking (not finalised), so the pause-to-send hasn't fired.
    rec().say("answer at the very end", false);
    await flush(59_999);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Done answering" }));
      vi.advanceTimersByTime(300);
    });
    await flush(2_000);
    expect(server.turns).toHaveLength(1);
  });

  it("keeps the answer and offers a retry when saving fails, without advancing", async () => {
    const server = fakeServer((_t, n) => (n === 1 ? { status: 503, body: { ok: false, retryable: true, error: "The interviewer couldn't respond just now. Your answer is saved; please retry." } } : ok()));
    await joinCall();
    rec().say("an answer that must survive", true);
    await flush(60_000);
    await flush(1_500);
    expect(screen.getByText(/couldn't respond just now/)).toBeTruthy();
    expect(screen.queryAllByText("Question 2: next one.")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await flush();
    expect(server.turns[1]).toEqual(server.turns[0]);
    expect(screen.getAllByText("Question 2: next one.").length).toBeGreaterThan(0);
  });

  it("explains a speech-recognition failure and lets the candidate retry listening", async () => {
    fakeServer(ok);
    await joinCall();
    act(() => rec().onerror?.({ error: "network" }));
    expect(screen.getByText(/Speech recognition lost its connection/)).toBeTruthy();
    rec().running = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry listening" }));
    expect(rec().running).toBe(true);
  });

  it("mutes the microphone and turns the camera off for real", async () => {
    fakeServer(ok);
    await joinCall();
    const [audio, video] = [tracks.find((t) => t.kind === "audio")!, tracks.find((t) => t.kind === "video")!];
    fireEvent.click(screen.getByRole("button", { name: "Mute microphone" }));
    await flush();
    expect(audio.enabled).toBe(false);
    expect(rec().running).toBe(false);
    expect(screen.getAllByText("Your microphone is muted").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Turn camera off" }));
    await flush();
    expect(video.stop).toHaveBeenCalled();
    expect(screen.getAllByText("Camera off").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Unmute microphone" }));
    await flush();
    expect(audio.enabled).toBe(true);
    expect(rec().running).toBe(true);
  });

  it("tells the candidate when the microphone is unplugged", async () => {
    fakeServer(ok);
    await joinCall();
    act(() => tracks.find((t) => t.kind === "audio")!.unplug());
    await flush();
    expect(screen.getByText(/Your microphone has disconnected/)).toBeTruthy();
    expect(rec().running).toBe(false);
  });

  it("finishes once after the last answer, generates the report once and releases the devices", async () => {
    const server = fakeServer(() => ({ status: 200, body: { closing: true } }));
    await joinCall();
    rec().say("final answer", true);
    await flush(60_000);
    await flush(1_500);
    act(() => synth.finish());
    await flush();
    await flush();
    expect(server.calls.filter((c) => c.endsWith("/finish"))).toHaveLength(1);
    expect(server.calls.filter((c) => c.endsWith("/api/ai/report"))).toHaveLength(1);
    expect(screen.getByText("Your results")).toBeTruthy();
    expect(tracks.every((t) => t.stop.mock.calls.length > 0)).toBe(true);
    await flush(180_000);
    expect(server.turns).toHaveLength(1);
  });

  it("submits once under React Strict Mode", async () => {
    const server = fakeServer(ok);
    await joinCall({ strict: true });
    rec().say("strict mode answer", true);
    await flush(60_000);
    await flush(1_500);
    expect(server.turns).toHaveLength(1);
  });

  it("stops the camera and microphone when the page unmounts", async () => {
    fakeServer(ok);
    await joinCall();
    cleanup();
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks.every((t) => t.stop.mock.calls.length > 0)).toBe(true);
  });
});

describe("browsers without speech recognition", () => {
  beforeEach(() => vi.stubGlobal("SpeechRecognition", undefined));

  it("records the answer, transcribes it on the server, then saves the text", async () => {
    const server = fakeServer(ok);
    await joinCall();
    expect(FakeRecorder.last?.state).toBe("recording");
    fireEvent.click(screen.getByRole("button", { name: "Done answering" }));
    await flush();
    await flush();
    expect(server.calls).toContain(`POST /api/interviews/${ID}/transcribe`);
    expect(server.turns).toEqual([expect.objectContaining({ action: "reply", text: "I would cache reads in Redis" })]);
  });

  it("keeps the recording when transcription fails and retries it", async () => {
    const server = fakeServer(ok, (n) => (n === 1 ? { status: 502, body: { ok: false, retryable: true, error: "Your answer couldn't be transcribed. Your recording is kept; please retry." } } : { status: 200, body: { ok: true, text: "second try worked" } }));
    await joinCall();
    await flush(60_000);
    await flush();
    expect(screen.getByText(/Your recording is kept/)).toBeTruthy();
    expect(server.turns).toHaveLength(0);
    await flush(60_000); // the timer stays stopped while the failure is shown
    fireEvent.click(screen.getByRole("button", { name: "Retry transcription" }));
    await flush();
    expect(server.turns).toEqual([expect.objectContaining({ action: "reply", text: "second try worked", timedOut: true })]);
  });
});

describe("proctoring in the call", () => {
  function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }
  afterEach(() => setHidden(false));

  it("asks for fullscreen from the Start click and starts a proctoring session", async () => {
    const server = fakeServer(ok);
    const request = vi.fn(async () => {});
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    document.documentElement.requestFullscreen = request;
    await joinCall();
    expect(request).toHaveBeenCalledOnce();
    expect(server.calls).toContain(`POST /api/interviews/${ID}/proctoring/session`);
  });

  it("pauses the answer timer while the microphone is disconnected and keeps the answer", async () => {
    const server = fakeServer(ok);
    await joinCall();
    await flush(20_000);
    rec().say("my partial answer", true);
    act(() => tracks.find((t) => t.kind === "audio")!.unplug());
    await flush();
    expect(answerClock()).toContain("00:40");
    await flush(90_000); // a technical interruption: no time-out, nothing discarded
    expect(server.turns).toHaveLength(0);
    expect(answerClock()).toContain("00:40");
    expect(screen.getByText("my partial answer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reconnect microphone" }));
    await flush();
    await flush(41_000);
    await flush(1_500);
    expect(server.turns).toEqual([expect.objectContaining({ action: "reply", text: "my partial answer", timedOut: true })]);
    await flush(3_000);
    expect(server.proctorEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: "mic_lost", resolved: true })]));
  });

  it("never ends the interview because of tab switches, and shows a calm reminder instead", async () => {
    const server = fakeServer(ok);
    await joinCall();
    for (let i = 0; i < 5; i += 1) {
      setHidden(true);
      await flush(8_000);
      setHidden(false);
      await flush(6_000);
    }
    expect(screen.queryByText("Your results")).toBeNull();
    expect(server.calls.filter((c) => c.endsWith("/finish"))).toHaveLength(0);
    expect(server.proctorEvents.filter((e) => e.type === "tab_hidden")).toHaveLength(5);
    setHidden(true);
    await flush(3_000);
    setHidden(false);
    expect(screen.getByText(/Please keep this tab open/)).toBeTruthy();
  });

  it("delivers pending proctoring events before finishing, and doesn't send browser-side counts", async () => {
    const server = fakeServer(() => ({ status: 200, body: { closing: true } }));
    let finishBody = "";
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/finish")) finishBody = String(init?.body);
      return (realFetch as typeof fetch)(url, init);
    }));
    await joinCall();
    act(() => rec().onerror?.({ error: "network" }));
    rec().say("final answer", true);
    await flush(1_800);
    act(() => synth.finish());
    await flush();
    await flush();
    const eventsAt = server.calls.findIndex((c) => c.endsWith("/proctoring/events"));
    const finishAt = server.calls.findIndex((c) => c.endsWith("/finish"));
    expect(eventsAt).toBeGreaterThan(-1);
    expect(eventsAt).toBeLessThan(finishAt);
    expect(server.proctorEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: "speech_recognition_error", meta: { error: "network" } })]));
    expect(JSON.parse(finishBody)).toEqual({ endedReason: "max_questions" });
  });
});
