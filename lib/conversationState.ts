/**
 * Client-side conversation lifecycle. Pure reducer so the rules (one request
 * in flight, retries reuse the same request id, no submits while the
 * interviewer is responding) are unit-testable.
 */
export type ConversationStatus =
  | "initializing"
  | "ai_speaking"
  | "listening"
  | "awaiting_candidate"
  | "processing"
  | "paused"
  | "completed"
  | "error";

export type PendingTurn = { requestId: string; action: "start" | "reply" | "skip"; text: string };

export type LiveState = {
  status: ConversationStatus;
  pending: PendingTurn | null;
  error: { message: string; retryable: boolean } | null;
  /** Where to return after a pause. */
  resumeTo: ConversationStatus | null;
};

export type LiveEvent =
  | { type: "INIT" }
  | { type: "SUBMIT"; turn: PendingTurn }
  | { type: "AI_REPLIED"; speak: boolean; completed: boolean; voice: boolean }
  | { type: "REQUEST_FAILED"; message: string; retryable: boolean }
  | { type: "RETRY" }
  | { type: "DISCARD_PENDING" }
  | { type: "SPEECH_ENDED"; voice: boolean }
  | { type: "INTERRUPT"; voice: boolean }
  | { type: "LISTEN_START" }
  | { type: "LISTEN_STOP" }
  | { type: "PAUSE" }
  | { type: "RESUME"; voice: boolean }
  | { type: "COMPLETE" };

export const initialLiveState: LiveState = { status: "initializing", pending: null, error: null, resumeTo: null };

export function canSubmit(state: LiveState) {
  return state.status === "awaiting_candidate" || state.status === "listening" || state.status === "initializing";
}

export function liveReducer(state: LiveState, event: LiveEvent): LiveState {
  if (state.status === "completed") return state;
  switch (event.type) {
    case "INIT":
      return { ...initialLiveState };
    case "SUBMIT":
      // Ignore duplicates: only one turn may be in flight.
      if (!canSubmit(state)) return state;
      return { ...state, status: "processing", pending: event.turn, error: null };
    case "AI_REPLIED":
      if (state.status !== "processing") return state;
      return {
        status: event.completed ? "completed" : event.speak ? "ai_speaking" : event.voice ? "listening" : "awaiting_candidate",
        pending: null,
        error: null,
        resumeTo: null,
      };
    case "REQUEST_FAILED":
      if (state.status !== "processing") return state;
      return { ...state, status: "error", error: { message: event.message, retryable: event.retryable } };
    case "RETRY":
      // A retry re-sends the same pending turn (same request id), so the server can deduplicate it.
      if (state.status !== "error" || !state.pending || !state.error?.retryable) return state;
      return { ...state, status: "processing", error: null };
    case "DISCARD_PENDING":
      if (state.status !== "error") return state;
      return { ...state, status: "awaiting_candidate", pending: null, error: null };
    case "SPEECH_ENDED":
      if (state.status !== "ai_speaking") return state;
      return { ...state, status: event.voice ? "listening" : "awaiting_candidate" };
    case "INTERRUPT":
      if (state.status !== "ai_speaking") return state;
      return { ...state, status: event.voice ? "listening" : "awaiting_candidate" };
    case "LISTEN_START":
      return state.status === "awaiting_candidate" ? { ...state, status: "listening" } : state;
    case "LISTEN_STOP":
      return state.status === "listening" ? { ...state, status: "awaiting_candidate" } : state;
    case "PAUSE":
      if (state.status === "processing" || state.status === "paused") return state;
      return { ...state, status: "paused", resumeTo: state.status === "error" ? "error" : "awaiting_candidate" };
    case "RESUME":
      if (state.status !== "paused") return state;
      return { ...state, status: state.resumeTo === "error" ? "error" : event.voice ? "listening" : "awaiting_candidate", resumeTo: null };
    case "COMPLETE":
      return { ...state, status: "completed", pending: null };
    default:
      return state;
  }
}

/** Accumulates speech-recognition results. Interim text is display-only and never submitted. */
export function mergeRecognition(finalSoFar: string, results: ArrayLike<{ isFinal?: boolean; 0?: { transcript?: string } }>, fromIndex: number) {
  let finalText = finalSoFar;
  let interim = "";
  for (let i = fromIndex; i < results.length; i += 1) {
    const r = results[i];
    const t = r?.[0]?.transcript ?? "";
    if (r?.isFinal) finalText = `${finalText} ${t}`.replace(/\s+/g, " ").trim();
    else interim = `${interim} ${t}`.trim();
  }
  return { finalText, interim };
}
