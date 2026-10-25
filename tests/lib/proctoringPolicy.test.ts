import { describe, expect, it } from "vitest";

import { EVENT_TYPES, isClientEventType, severityFor, summarizeProctoring, type ProctoringEventType, type StoredProctoringEvent } from "@/lib/proctoring";
import { sanitizeMeta } from "@/lib/proctoringStore";

function ev(type: ProctoringEventType, durationMs: number | null = null, resolved = true): StoredProctoringEvent {
  const d = EVENT_TYPES[type];
  return { type, durationMs, resolved, severity: severityFor(type, durationMs, resolved), kind: d.kind, category: d.category, source: d.source, receivedAt: new Date() };
}

describe("severity rules", () => {
  it.each([
    ["tab_hidden", 2_000, true, "info"],
    ["tab_hidden", 10_000, true, "warning"],
    ["tab_hidden", 45_000, true, "review"],
    ["window_blur", 60_000, true, "info"],
    ["fullscreen_exit", null, true, "warning"],
    ["camera_lost", 5_000, true, "info"],
    ["camera_lost", 40_000, true, "warning"],
    ["mic_lost", 5_000, false, "warning"],
    ["camera_turned_off", null, true, "info"],
    ["face_not_detected", 15_000, true, "warning"],
    ["face_not_detected", 90_000, true, "review"],
    ["multiple_faces", 6_000, true, "review"],
    ["silence_during_answer", 25_000, true, "info"],
    ["speech_recognition_error", null, true, "info"],
  ] as const)("%s (%s ms, resolved=%s) is %s", (type, d, resolved, expected) => {
    expect(severityFor(type, d, resolved)).toBe(expected);
  });

  it("accepts only client-observable types from the browser", () => {
    expect(isClientEventType("tab_hidden")).toBe(true);
    for (const serverOnly of ["session_started", "session_reconnected", "pause_used", "concurrent_request_rejected"]) expect(isClientEventType(serverOnly)).toBe(false);
    expect(isClientEventType("cheating_detected")).toBe(false);
  });
});

describe("integrity summary", () => {
  it("reports no concerns for only informational events", () => {
    const s = summarizeProctoring([ev("session_started"), ev("tab_hidden", 1_500), ev("window_blur", 3_000), ev("camera_turned_off"), ev("session_ended")]);
    expect(s).toMatchObject({ status: "no_concerns", reviewStatus: "not_required", reviewReasons: [] });
    expect(s.tabHidden).toEqual({ count: 1, totalMs: 1_500, longestMs: 1_500 });
  });

  it("treats a single technical problem as minor, not a review", () => {
    const s = summarizeProctoring([ev("mic_lost", 45_000), ev("fullscreen_exit")]);
    expect(s.status).toBe("minor");
    expect(s.devices).toMatchObject({ micInterruptions: 1, totalInterruptedMs: 45_000 });
    expect(s.totals.technical).toBe(1);
  });

  it("recommends a review for sustained multiple faces, long or repeated tab hiding, and repeated fullscreen exits", () => {
    const s = summarizeProctoring([ev("multiple_faces", 8_000), ev("tab_hidden", 6_000), ev("tab_hidden", 7_000), ev("tab_hidden", 9_000), ev("tab_hidden", 40_000), ev("fullscreen_exit"), ev("fullscreen_exit"), ev("fullscreen_exit")]);
    expect(s.status).toBe("review_recommended");
    expect(s.reviewStatus).toBe("pending");
    expect(s.reviewReasons).toEqual([
      "The interview tab was hidden for 40 s at once.",
      "The interview tab was hidden 4 times for 5 seconds or more.",
      "More than one face was detected on camera 1 time (sustained over several checks).",
      "Fullscreen was exited 3 times.",
    ]);
  });

  it("does not escalate repeated brief tab switches", () => {
    const s = summarizeProctoring([ev("tab_hidden", 1_000), ev("tab_hidden", 2_000), ev("tab_hidden", 3_000), ev("tab_hidden", 1_000)]);
    expect(s.status).toBe("no_concerns");
  });

  it("counts data-quality flags without escalating", () => {
    const flagged = { ...ev("tab_hidden", 1_000), flags: { outOfOrder: true, clockSkew: true } };
    const s = summarizeProctoring([flagged]);
    expect(s.dataQuality).toEqual({ outOfOrder: 1, clockSkew: 1, sequenceGaps: 0 });
    expect(s.status).toBe("no_concerns");
  });
});

describe("event metadata", () => {
  it("keeps only small technical codes and drops anything personal or large", () => {
    expect(sanitizeMeta({ reason: "track_ended", faces: 2, error: "network", frame: "data:image/png;base64,AAAA", transcript: "my answer", nested: { a: 1 }, reasonFree: "anything" })).toEqual({ reason: "track_ended", faces: 2, error: "network" });
    expect(sanitizeMeta({ reason: "Contains Spaces And Caps", faces: -1, checks: 1.5 })).toEqual({});
    expect(sanitizeMeta("nope")).toEqual({});
  });
});
