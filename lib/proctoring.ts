/**
 * Proctoring policy: event taxonomy, deterministic severity rules and the
 * integrity summary. Pure and client-safe (the browser uses the thresholds;
 * the server uses everything). Severity is always computed here from the
 * event type and its measured duration; values sent by a browser are ignored.
 *
 * These are technical observations, not findings of misconduct. Nothing here
 * changes interview scores or ends an interview.
 */

export const PROCTORING_POLICY_VERSION = 1;
/** Proctoring events and sessions are deleted automatically after this many days (MongoDB TTL). */
export const PROCTORING_RETENTION_DAYS = 180;

export const PROCTORING_THRESHOLDS = {
  /** How often the camera frame is checked for faces (on the device). */
  faceCheckIntervalMs: 2_000,
  /** No face for this long (consecutive checks) opens a "face not detected" observation. */
  faceAbsentMs: 10_000,
  /** Consecutive checks seeing 2+ faces before "multiple faces" is recorded (~6 s). */
  multipleFacesChecks: 3,
  /** Consecutive normal checks that close a face observation. */
  faceRecoverChecks: 2,
  /** Continuous silence on a live, unmuted microphone during an answer. */
  silenceMs: 20_000,
  /** Window blur shorter than this is ignored (menus, notifications, dialogs). */
  blurMinMs: 2_000,
  /** Same event type is not recorded again within this window. */
  cooldownMs: 5_000,
  tabHiddenWarningMs: 5_000,
  tabHiddenReviewMs: 30_000,
  deviceLostWarningMs: 30_000,
  faceAbsentReviewMs: 60_000,
  /** Repetition that makes a pattern worth a human look. */
  repeatedTabHidden: 3,
  repeatedFullscreenExits: 3,
  repeatedPauses: 4,
} as const;

export type Severity = "info" | "warning" | "review";
export type EventCategory = "focus" | "fullscreen" | "device" | "face" | "audio" | "session" | "workflow";
/** Technical issues (devices, connection) are kept apart from integrity-relevant observations. */
export type EventKind = "technical" | "integrity";

type TypeDef = { category: EventCategory; kind: EventKind; source: "client" | "server"; label: string };

export const EVENT_TYPES = {
  tab_hidden: { category: "focus", kind: "integrity", source: "client", label: "Interview tab hidden" },
  window_blur: { category: "focus", kind: "integrity", source: "client", label: "Window lost focus" },
  fullscreen_exit: { category: "fullscreen", kind: "integrity", source: "client", label: "Fullscreen exited" },
  camera_lost: { category: "device", kind: "technical", source: "client", label: "Camera disconnected or blocked" },
  camera_turned_off: { category: "device", kind: "technical", source: "client", label: "Camera turned off by the candidate" },
  mic_lost: { category: "device", kind: "technical", source: "client", label: "Microphone disconnected or blocked" },
  face_not_detected: { category: "face", kind: "integrity", source: "client", label: "No face detected (sustained)" },
  multiple_faces: { category: "face", kind: "integrity", source: "client", label: "More than one face detected (sustained)" },
  silence_during_answer: { category: "audio", kind: "technical", source: "client", label: "Long silence while answering" },
  speech_recognition_error: { category: "audio", kind: "technical", source: "client", label: "Speech recognition interrupted" },
  transcription_failed: { category: "audio", kind: "technical", source: "client", label: "Answer transcription failed" },
  session_started: { category: "session", kind: "technical", source: "server", label: "Session started" },
  session_reconnected: { category: "session", kind: "technical", source: "server", label: "Session reconnected (reload or new tab)" },
  session_interrupted: { category: "session", kind: "technical", source: "server", label: "Session ended unexpectedly" },
  session_ended: { category: "session", kind: "technical", source: "server", label: "Session ended" },
  pause_used: { category: "workflow", kind: "integrity", source: "server", label: "Interview paused" },
  concurrent_request_rejected: { category: "workflow", kind: "technical", source: "server", label: "Overlapping answer request rejected" },
} as const satisfies Record<string, TypeDef>;

export type ProctoringEventType = keyof typeof EVENT_TYPES;
export const CLIENT_EVENT_TYPES = (Object.keys(EVENT_TYPES) as ProctoringEventType[]).filter((t) => EVENT_TYPES[t].source === "client");

export function isClientEventType(value: unknown): value is ProctoringEventType {
  return typeof value === "string" && (CLIENT_EVENT_TYPES as string[]).includes(value);
}

/** Deterministic severity from the event type and its measured duration. */
export function severityFor(type: ProctoringEventType, durationMs: number | null, resolved: boolean): Severity {
  const T = PROCTORING_THRESHOLDS;
  const d = durationMs ?? 0;
  switch (type) {
    case "tab_hidden":
      return d >= T.tabHiddenReviewMs ? "review" : d >= T.tabHiddenWarningMs ? "warning" : "info";
    case "fullscreen_exit":
      return "warning";
    case "camera_lost":
    case "mic_lost":
      // Device problems are technical; only a long or unrecovered loss deserves attention.
      return !resolved || d >= T.deviceLostWarningMs ? "warning" : "info";
    case "face_not_detected":
      return d >= T.faceAbsentReviewMs ? "review" : "warning";
    case "multiple_faces":
      return "review";
    case "session_interrupted":
      return "warning";
    default:
      return "info";
  }
}

export type StoredProctoringEvent = {
  type: ProctoringEventType;
  severity: Severity;
  kind: EventKind;
  category: EventCategory;
  source: "client" | "server";
  durationMs: number | null;
  resolved: boolean;
  receivedAt: Date | string;
  flags?: { outOfOrder?: boolean; clockSkew?: boolean; sequenceGap?: boolean };
};

export type ProctoringSummary = {
  policyVersion: number;
  generatedAt: Date;
  /** Observations only; this is never a misconduct verdict. */
  status: "no_concerns" | "minor" | "review_recommended";
  reviewStatus: "not_required" | "pending";
  reviewReasons: string[];
  totals: { events: number; info: number; warning: number; review: number; technical: number; integrity: number };
  byType: Partial<Record<ProctoringEventType, number>>;
  tabHidden: { count: number; totalMs: number; longestMs: number };
  windowBlurs: number;
  fullscreenExits: number;
  devices: { cameraInterruptions: number; micInterruptions: number; cameraTurnedOff: number; totalInterruptedMs: number; unrecovered: number };
  face: { notDetected: number; notDetectedMs: number; multipleFaces: number };
  audio: { silences: number; recognitionErrors: number; transcriptionFailures: number };
  sessions: { started: number; reconnects: number; interruptions: number };
  pauses: number;
  dataQuality: { outOfOrder: number; clockSkew: number; sequenceGaps: number };
  candidateNote?: string;
};

const fmtSeconds = (ms: number) => `${Math.round(ms / 1000)} s`;

/**
 * Builds the integrity summary from stored (server-validated) events with
 * fixed rules. A "review_recommended" status means a person should look at the
 * events, with the candidate's own explanation, before drawing any conclusion.
 */
export function summarizeProctoring(events: StoredProctoringEvent[], now = new Date()): ProctoringSummary {
  const T = PROCTORING_THRESHOLDS;
  const count = (t: ProctoringEventType) => events.filter((e) => e.type === t);
  const ms = (list: StoredProctoringEvent[]) => list.reduce((a, e) => a + (e.durationMs ?? 0), 0);
  const byType: ProctoringSummary["byType"] = {};
  for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1;

  const tab = count("tab_hidden");
  const camera = count("camera_lost");
  const mic = count("mic_lost");
  const absent = count("face_not_detected");
  const multi = count("multiple_faces");
  const fullscreen = count("fullscreen_exit");
  const pauses = count("pause_used").length;

  const reasons: string[] = [];
  const tabCounted = tab.filter((e) => e.severity !== "info");
  if (tab.some((e) => e.severity === "review")) reasons.push(`The interview tab was hidden for ${fmtSeconds(Math.max(...tab.map((e) => e.durationMs ?? 0)))} at once.`);
  if (tabCounted.length >= T.repeatedTabHidden) reasons.push(`The interview tab was hidden ${tabCounted.length} times for 5 seconds or more.`);
  if (multi.length) reasons.push(`More than one face was detected on camera ${multi.length} time${multi.length === 1 ? "" : "s"} (sustained over several checks).`);
  if (absent.some((e) => e.severity === "review")) reasons.push(`No face was detected for ${fmtSeconds(Math.max(...absent.map((e) => e.durationMs ?? 0)))} at once.`);
  if (fullscreen.length >= T.repeatedFullscreenExits) reasons.push(`Fullscreen was exited ${fullscreen.length} times.`);

  const warnings = events.filter((e) => e.severity === "warning").length;
  const status: ProctoringSummary["status"] = reasons.length ? "review_recommended" : warnings || pauses >= T.repeatedPauses ? "minor" : "no_concerns";

  return {
    policyVersion: PROCTORING_POLICY_VERSION,
    generatedAt: now,
    status,
    reviewStatus: status === "review_recommended" ? "pending" : "not_required",
    reviewReasons: reasons,
    totals: {
      events: events.length,
      info: events.filter((e) => e.severity === "info").length,
      warning: warnings,
      review: events.filter((e) => e.severity === "review").length,
      technical: events.filter((e) => e.kind === "technical").length,
      integrity: events.filter((e) => e.kind === "integrity").length,
    },
    byType,
    tabHidden: { count: tab.length, totalMs: ms(tab), longestMs: Math.max(0, ...tab.map((e) => e.durationMs ?? 0)) },
    windowBlurs: count("window_blur").length,
    fullscreenExits: fullscreen.length,
    devices: {
      cameraInterruptions: camera.length,
      micInterruptions: mic.length,
      cameraTurnedOff: count("camera_turned_off").length,
      totalInterruptedMs: ms([...camera, ...mic]),
      unrecovered: [...camera, ...mic].filter((e) => !e.resolved).length,
    },
    face: { notDetected: absent.length, notDetectedMs: ms(absent), multipleFaces: multi.length },
    audio: { silences: count("silence_during_answer").length, recognitionErrors: count("speech_recognition_error").length, transcriptionFailures: count("transcription_failed").length },
    sessions: { started: count("session_started").length, reconnects: count("session_reconnected").length, interruptions: count("session_interrupted").length },
    pauses,
    dataQuality: {
      outOfOrder: events.filter((e) => e.flags?.outOfOrder).length,
      clockSkew: events.filter((e) => e.flags?.clockSkew).length,
      sequenceGaps: events.filter((e) => e.flags?.sequenceGap).length,
    },
  };
}
