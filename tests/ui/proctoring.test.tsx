// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useProctoring } from "@/app/interview/useProctoring";
import type { DeviceState } from "@/app/interview/useMediaDevices";
import type { FaceDetectorApi } from "@/app/interview/faceDetector";

const ID = "6adcf94ce47615dfd94083e8";
const SESSION = "00000000-0000-4000-8000-0000000000aa";
type Sent = { sessionId: string; events: Array<{ id: string; seq: number; type: string; durationMs?: number; resolved: boolean; meta?: Record<string, unknown> }> };

let sent: Sent[] = [];
let failNext = 0;
function stubServer() {
  sent = [];
  failNext = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/proctoring/session")) return Response.json({ ok: true, sessionId: SESSION });
      if (url.endsWith("/proctoring/events")) {
        if (failNext > 0) {
          failNext -= 1;
          throw new TypeError("network down");
        }
        sent.push(JSON.parse(String(init?.body)));
        return Response.json({ ok: true });
      }
      return Response.json({ ok: false }, { status: 404 });
    }),
  );
}
const allEvents = () => sent.flatMap((b) => b.events);
const types = () => allEvents().map((e) => e.type);

type Props = { active: boolean; camera: DeviceState; mic: DeviceState; detectorReady: boolean; answering: boolean };
const faces = { next: [] as number[], fallback: 1 };
const detector: FaceDetectorApi = { detect: vi.fn(async () => Array.from({ length: faces.next.length ? faces.next.shift()! : faces.fallback }, () => ({ x: 0, y: 0, width: 10, height: 10 }))) };
const video = { readyState: 4 } as unknown as HTMLVideoElement;
let micStream: { getAudioTracks: () => unknown[] } | null = null;
const videoRef = { current: video };
const faceRef = { current: detector };
const getStream = () => micStream as unknown as MediaStream;

function setup(initial: Partial<Props> = {}) {
  const base: Props = { active: true, camera: "granted", mic: "granted", detectorReady: false, answering: false, ...initial };
  return renderHook(
    (p: Props) =>
      useProctoring({ ...p, videoRef, faceDetector: faceRef, getStream, streamVersion: 0 }),
    { initialProps: base },
  );
}
const advance = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});
function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  stubServer();
  faces.next = [];
  faces.fallback = 1;
  micStream = null;
  setHidden(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function begin(r: ReturnType<typeof setup>) {
  await act(async () => {
    await r.result.current.begin(ID);
  });
}

describe("tab visibility and focus", () => {
  it("records how long the tab was hidden, warns on return and sends the event", async () => {
    const r = setup();
    await begin(r);
    setHidden(true);
    await advance(12_000);
    setHidden(false);
    expect(r.result.current.notices.find((n) => n.id === "tab")?.message).toMatch(/not active for 12 seconds/);
    await advance(2_500);
    expect(allEvents()).toEqual([expect.objectContaining({ type: "tab_hidden", durationMs: 12_000, seq: 1 })]);
    expect(sent[0].sessionId).toBe(SESSION);
    await advance(10_000);
    expect(r.result.current.notices).toHaveLength(0);
  });

  it("treats window blur as a weak signal: short blurs ignored, longer ones logged without a warning", async () => {
    const r = setup();
    await begin(r);
    act(() => void window.dispatchEvent(new Event("blur")));
    await advance(1_000);
    act(() => void window.dispatchEvent(new Event("focus")));
    act(() => void window.dispatchEvent(new Event("blur")));
    await advance(4_000);
    act(() => void window.dispatchEvent(new Event("focus")));
    await advance(2_500);
    expect(types()).toEqual(["window_blur"]);
    expect(r.result.current.notices).toHaveLength(0);
  });

  it("observes nothing while the call isn't active", async () => {
    const r = setup({ active: false });
    await begin(r);
    setHidden(true);
    await advance(30_000);
    setHidden(false);
    await advance(3_000);
    expect(sent).toHaveLength(0);
  });
});

describe("fullscreen", () => {
  let el: HTMLElement | null = null;
  beforeEach(() => {
    el = null;
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => el });
    document.documentElement.requestFullscreen = vi.fn(async () => {
      el = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
  });
  const exit = () =>
    act(() => {
      el = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });

  it("warns on exit with a way back, and clears the warning on return", async () => {
    const r = setup();
    await begin(r);
    await act(async () => void (await r.result.current.enterFullscreen()));
    exit();
    const notice = r.result.current.notices.find((n) => n.id === "fullscreen")!;
    expect(notice.action).toEqual({ label: "Return to fullscreen", kind: "fullscreen" });
    await act(async () => void (await r.result.current.enterFullscreen()));
    expect(r.result.current.notices).toHaveLength(0);
    await advance(2_500);
    expect(types()).toEqual(["fullscreen_exit"]);
  });

  it("applies a cooldown so rapid repeated exits are one event", async () => {
    const r = setup();
    await begin(r);
    await act(async () => void (await r.result.current.enterFullscreen()));
    exit();
    await act(async () => void (await r.result.current.enterFullscreen()));
    exit();
    await advance(6_000);
    await act(async () => void (await r.result.current.enterFullscreen()));
    exit();
    await advance(2_500);
    expect(types()).toEqual(["fullscreen_exit", "fullscreen_exit"]);
  });

  it("records nothing if fullscreen was never entered, or isn't supported", async () => {
    const r = setup();
    await begin(r);
    exit();
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: false });
    await act(async () => expect(await r.result.current.enterFullscreen()).toBe(false));
    await advance(3_000);
    expect(sent).toHaveLength(0);
  });
});

describe("camera and microphone health", () => {
  it("records an unexpected camera loss with its duration once it's back, and offers recovery", async () => {
    const r = setup();
    await begin(r);
    r.rerender({ active: true, camera: "unavailable", mic: "granted", detectorReady: false, answering: false });
    expect(r.result.current.notices.find((n) => n.id === "camera")?.action?.kind).toBe("reconnect_camera");
    await advance(7_000);
    r.rerender({ active: true, camera: "granted", mic: "granted", detectorReady: false, answering: false });
    expect(r.result.current.notices).toHaveLength(0);
    await advance(2_500);
    expect(allEvents()).toEqual([expect.objectContaining({ type: "camera_lost", durationMs: 7_000, resolved: true, meta: { reason: "track_ended" } })]);
  });

  it("distinguishes the candidate turning the camera off from a failure", async () => {
    const r = setup();
    await begin(r);
    r.rerender({ active: true, camera: "off", mic: "granted", detectorReady: false, answering: false });
    await advance(2_500);
    expect(allEvents()).toEqual([expect.objectContaining({ type: "camera_turned_off", meta: { reason: "user" } })]);
    expect(r.result.current.notices).toHaveLength(0);
  });

  it("records a revoked microphone as unresolved if the interview ends before it's fixed", async () => {
    const r = setup();
    await begin(r);
    r.rerender({ active: true, camera: "granted", mic: "denied", detectorReady: false, answering: false });
    expect(r.result.current.notices.find((n) => n.id === "mic")?.message).toMatch(/answer timer is paused/);
    await advance(3_000);
    await act(async () => r.result.current.end());
    expect(allEvents()).toEqual([expect.objectContaining({ type: "mic_lost", resolved: false, durationMs: 3_000, meta: { reason: "permission_revoked" } })]);
  });
});

describe("face presence", () => {
  it("ignores isolated misses and records only a sustained absence, with its duration", async () => {
    const r = setup({ detectorReady: true });
    await begin(r);
    faces.next = [0, 1, 0, 1]; // brief misses (movement, lighting)
    await advance(8_000);
    expect(r.result.current.notices).toHaveLength(0);
    faces.fallback = 0;
    await advance(12_000);
    expect(r.result.current.notices.find((n) => n.id === "face")?.message).toMatch(/could not detect a face consistently/);
    faces.fallback = 1;
    await advance(4_000);
    await advance(2_500);
    const ev = allEvents().find((e) => e.type === "face_not_detected")!;
    expect(ev.durationMs).toBeGreaterThanOrEqual(10_000);
    expect(r.result.current.notices).toHaveLength(0);
    expect(types().filter((t) => t === "face_not_detected")).toHaveLength(1);
  });

  it("records multiple faces only when sustained over several checks", async () => {
    const r = setup({ detectorReady: true });
    await begin(r);
    faces.next = [2, 1, 1]; // a single blip is ignored
    await advance(6_000);
    faces.next = [2, 3, 2];
    await advance(6_000);
    expect(r.result.current.notices.find((n) => n.id === "faces")).toBeTruthy();
    faces.next = [1, 1];
    await advance(4_000);
    await advance(2_500);
    expect(allEvents().filter((e) => e.type === "multiple_faces")).toEqual([expect.objectContaining({ meta: { faces: 3 } })]);
  });

  it("does not check faces with the camera off or the detector unavailable", async () => {
    vi.mocked(detector.detect).mockClear();
    const r = setup({ detectorReady: false });
    await begin(r);
    await advance(10_000);
    r.rerender({ active: true, camera: "off", mic: "granted", detectorReady: true, answering: false });
    await advance(10_000);
    expect(detector.detect).not.toHaveBeenCalled();
  });
});

describe("silence while answering", () => {
  function stubAudio(level: number) {
    class FakeCtx {
      createAnalyser() {
        return { fftSize: 0, getByteTimeDomainData: (d: Uint8Array) => d.fill(128 + level) };
      }
      createMediaStreamSource() {
        return { connect: () => {} };
      }
      close() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("AudioContext", FakeCtx);
    vi.stubGlobal("MediaStream", class {});
    micStream = { getAudioTracks: () => [{}] };
  }

  it("notes a long silence on a live microphone during an answer", async () => {
    stubAudio(0);
    const r = setup({ answering: true });
    await begin(r);
    await advance(21_000);
    expect(r.result.current.notices.find((n) => n.id === "silence")).toBeTruthy();
    await advance(2_500);
    expect(types()).toEqual(["silence_during_answer"]);
  });

  it("stays quiet while the candidate is speaking, and outside the answer window", async () => {
    stubAudio(40);
    const r = setup({ answering: true });
    await begin(r);
    await advance(30_000);
    stubAudio(0);
    r.rerender({ active: true, camera: "granted", mic: "granted", detectorReady: false, answering: false });
    await advance(30_000);
    expect(sent).toHaveLength(0);
  });
});

describe("delivery", () => {
  it("retries after a network failure with the same event ids, so nothing is lost or duplicated", async () => {
    const r = setup();
    await begin(r);
    failNext = 1;
    act(() => r.result.current.record("speech_recognition_error", { meta: { error: "network" } }));
    await advance(2_500);
    expect(sent).toHaveLength(0);
    expect(window.localStorage.getItem(`aisim_proctor_events_${ID}`)).toContain("speech_recognition_error");
    await advance(6_000);
    expect(allEvents()).toEqual([expect.objectContaining({ type: "speech_recognition_error" })]);
    expect(window.localStorage.getItem(`aisim_proctor_events_${ID}`)).toBeNull();
  });

  it("after a reload, sends events left over from the previous session under their original session id", async () => {
    window.localStorage.setItem(`aisim_proctor_events_${ID}`, JSON.stringify([{ sessionId: "old-session-0000-0000-0000-000000000000", id: "leftover00000001", seq: 4, type: "tab_hidden", at: new Date().toISOString(), durationMs: 3_000, resolved: true, warned: true }]));
    const r = setup();
    await begin(r);
    expect(sent[0]).toMatchObject({ sessionId: "old-session-0000-0000-0000-000000000000", events: [expect.objectContaining({ id: "leftover00000001", seq: 4 })] });
    act(() => r.result.current.record("transcription_failed"));
    await advance(2_500);
    expect(sent[1]).toMatchObject({ sessionId: SESSION, events: [expect.objectContaining({ seq: 1 })] });
  });

  it("numbers events in order and never sends raw media", async () => {
    const r = setup();
    await begin(r);
    act(() => {
      r.result.current.record("speech_recognition_error", { meta: { error: "network" } });
      r.result.current.record("transcription_failed");
    });
    await advance(2_500);
    expect(allEvents().map((e) => e.seq)).toEqual([1, 2]);
    const body = JSON.stringify(sent);
    expect(body).not.toMatch(/data:|base64|blob/i);
  });
});
