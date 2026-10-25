"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Maximize, Pause, Play, RefreshCw, Repeat, Send, ShieldCheck, SkipForward, Square, Volume2, VolumeX } from "lucide-react";

import type { Difficulty, InterviewType } from "@/lib/prompts";
import type { FinalReport } from "@/app/api/ai/report/route";
import { Alert, Badge, Button, Card, CardBody, Checkbox, ConfirmDialog, cn } from "@/app/components/ui";
import { canSubmit, initialLiveState, liveReducer, mergeRecognition, type PendingTurn } from "@/lib/conversationState";
import { DEFAULT_DETAILS, loadDetails, loadInterviewId, loadResumeId, loadResumeText, saveDetails, saveInterviewId } from "@/app/lib/interviewStorage";
import { createFaceDetector, type FaceDetectorApi } from "./faceDetector";
import { ANSWER_SECONDS, useAnswerTimer } from "./useAnswerTimer";
import { canRecordAudio, useAnswerRecorder } from "./useAnswerRecorder";
import { useMediaDevices, useMicLevel } from "./useMediaDevices";
import { useProctoring } from "./useProctoring";
import { CompletionView, LiveTopBar, PreparingScreen, TimerPill, type DetectorState } from "./components/LiveParts";
import { CallControls, InterviewerStage, SelfView, VideoLobby, type CallPhase, type SpeechEngine } from "./components/VideoCall";

type Message = { id: string; role: "interviewer" | "candidate"; text: string; kind: string; questionId: string; at: string };
type ServerState = { status: string; questionNumber: number; maxMainQuestions: number; secondsLeft: number | null; sessionSeconds: number; paused?: boolean };
type ConversationPayload = { ok: boolean; error?: string; code?: string; retryable?: boolean; message?: Message | null; messages?: Message[]; state?: ServerState; fallback?: boolean; resumed?: boolean; duplicate?: boolean };
type SttFailure = { blob: Blob; timedOut: boolean; message: string; retryable: boolean };

type SpeechRecognitionLike = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal?: boolean; 0?: { transcript?: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

const PENDING_KEY = "aisim_pending_turn";
/** Silence after the last final speech result before the answer is sent automatically. */
const END_OF_UTTERANCE_MS = 1800;
/** How long to wait for the recogniser to deliver its last words after stop(). */
const FLUSH_TIMEOUT_MS = 1500;
const HAS_WORDS = /[\p{L}\p{N}]/u;

function newRequestId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function pickVoice(voices: SpeechSynthesisVoice[]) {
  const score = (n: string) => (/google|samantha|alex/i.test(n) ? 3 : /microsoft|enhanced|premium|natural/i.test(n) ? 2 : 1);
  return voices.filter((v) => v.lang?.toLowerCase().startsWith("en")).sort((a, b) => score(b.name) - score(a.name))[0] ?? null;
}

async function readJson<T>(res: Response) {
  return (await res.json().catch(() => null)) as T | null;
}

/**
 * Live video interview. The AI interviewer speaks each question (browser
 * speech synthesis); the candidate answers by voice. Speech becomes text in
 * the browser (Web Speech API, live captions) or, where that isn't available,
 * on the server (one Groq Whisper call per answer). The server owns the
 * transcript, decides follow-ups and scores each question when it closes.
 */
export default function ConversationInterview() {
  // ---------- Configuration ----------
  const [config, setConfig] = useState(() => ({ ...DEFAULT_DETAILS }));
  const [resumeText, setResumeText] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [configLoaded, setConfigLoaded] = useState(false);
  const [engine, setEngine] = useState<SpeechEngine>("browser");
  const [canSpeak, setCanSpeak] = useState(true);

  // ---------- Devices ----------
  const media = useMediaDevices();
  const micOn = media.mic === "granted";
  const [detector, setDetector] = useState<DetectorState>("idle");

  // ---------- Conversation ----------
  const [live, dispatch] = useReducer(liveReducer, initialLiveState);
  const [messages, setMessages] = useState<Message[]>([]);
  const [serverState, setServerState] = useState<ServerState | null>(null);
  const [interviewId, setInterviewId] = useState("");
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  /** Final (confirmed) speech of the current answer. */
  const [draft, setDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [autoSend, setAutoSend] = useState(true);
  const [ttsOn, setTtsOn] = useState(true);
  const [notice, setNotice] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  /** The answer is being finalised (timer ran out or "Done"): no more input for this question. */
  const [captureLocked, setCaptureLocked] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [sttFailure, setSttFailure] = useState<SttFailure | null>(null);
  const [recognitionError, setRecognitionError] = useState("");

  // ---------- Completion ----------
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState<null | { averageScore: number | null; pending: number; report: FinalReport | null; reportError: string | null; reportRetryable: boolean; endedReason: string; saved: boolean }>(null);
  const [retryingEval, setRetryingEval] = useState(false);

  const [consent, setConsent] = useState(false);

  const liveRef = useRef(live);
  liveRef.current = live;
  const interviewIdRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  const finalRef = useRef("");
  const interimRef = useRef("");
  interimRef.current = interim;
  const silenceTimerRef = useRef<number | null>(null);
  const flushRef = useRef<(() => void) | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speakTokenRef = useRef(0);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceRef = useRef<FaceDetectorApi | null>(null);
  const finishingRef = useRef(false);
  const autoSendRef = useRef(autoSend);
  autoSendRef.current = autoSend;
  const micOnRef = useRef(micOn);
  micOnRef.current = micOn;

  const getStream = useCallback(() => media.streamRef.current, [media.streamRef]);
  const recorder = useAnswerRecorder(getStream);
  const micLevel = useMicLevel(media.streamRef.current, media.version, !started && micOn);

  // ---------- Proctoring (disclosed in the lobby; observations only, never ends the interview) ----------
  const proctor = useProctoring({
    active: started && !done && !finishing,
    camera: media.camera,
    mic: media.mic,
    videoRef,
    faceDetector: faceRef,
    detectorReady: detector === "ready",
    answering: started && live.status === "listening" && micOn && !captureLocked,
    getStream,
    streamVersion: media.version,
  });
  const proctorRecordRef = useRef(proctor.record);
  proctorRecordRef.current = proctor.record;

  // ---------- Load configuration ----------
  useEffect(() => {
    const d = loadDetails() ?? DEFAULT_DETAILS;
    setConfig(d);
    if (d.useResume) {
      setResumeText(loadResumeText());
      setResumeId(loadResumeId());
    }
    const id = loadInterviewId();
    if (id) {
      interviewIdRef.current = id;
      setInterviewId(id);
    }
    setEngine(getRecognitionCtor() ? "browser" : canRecordAudio() ? "server" : "none");
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
    setConfigLoaded(true);
  }, []);

  // A stored id may be a scheduled or in-progress interview: check before resuming.
  useEffect(() => {
    if (!interviewId || started) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/interviews/${encodeURIComponent(interviewId)}`).catch(() => null);
      const data = res ? await readJson<{ ok: boolean; interview?: { status: string; scheduledFor: string | null } }>(res) : null;
      if (cancelled) return;
      if (!res?.ok || !data?.ok || !data.interview || data.interview.status === "completed" || data.interview.status === "terminated") {
        saveInterviewId(null);
        interviewIdRef.current = "";
        setInterviewId("");
        return;
      }
      const ts = data.interview.status === "scheduled" && data.interview.scheduledFor ? Date.parse(data.interview.scheduledFor) : NaN;
      setScheduleMessage(Number.isFinite(ts) && ts > Date.now() ? `This is a scheduled interview. It opens at ${new Date(ts).toLocaleTimeString()}.` : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [interviewId, started]);

  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return;
    const load = () => (voiceRef.current = pickVoice(synth.getVoices()));
    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => synth.removeEventListener?.("voiceschanged", load);
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [messages, interim, showTranscript]);

  // ---------- Speech recognition (browser engine) ----------
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  };

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    clearSilenceTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
    setInterim("");
  }, []);

  const submitRef = useRef<(action: "reply" | "skip", text?: string, opts?: { timedOut?: boolean }) => void>(() => {});

  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    wantListeningRef.current = true;
    if (!recognitionRef.current) {
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (event) => {
        const { finalText, interim: interimText } = mergeRecognition("", event.results, event.resultIndex);
        if (finalText) {
          finalRef.current = `${finalRef.current} ${finalText}`.trim();
          setDraft(finalRef.current);
        }
        setInterim(interimText);
        setRecognitionError("");
        // End of utterance: a pause after final words. Interim words alone never submit.
        clearSilenceTimer();
        if (wantListeningRef.current && finalRef.current && !interimText) {
          silenceTimerRef.current = window.setTimeout(() => {
            if (autoSendRef.current && finalRef.current.split(/\s+/).length >= 2) submitRef.current("reply", finalRef.current);
          }, END_OF_UTTERANCE_MS);
        }
      };
      rec.onerror = (e) => {
        if (e.error && e.error !== "no-speech" && e.error !== "aborted") proctorRecordRef.current("speech_recognition_error", { meta: { error: e.error.replace(/[^a-z-]/g, "").slice(0, 40) } });
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          wantListeningRef.current = false;
          setRecognitionError("Speech recognition was blocked. Allow microphone access for this site, then tap Retry listening.");
        } else if (e.error === "network") {
          setRecognitionError("Speech recognition lost its connection. Check your network, then tap Retry listening. What you said so far is kept.");
        } else if (e.error === "audio-capture") {
          setRecognitionError("No audio is reaching speech recognition. Check your microphone, then tap Retry listening.");
        }
      };
      rec.onend = () => {
        // A pending flush (time-out or Done) is complete once the recogniser has stopped.
        if (flushRef.current) {
          flushRef.current();
          flushRef.current = null;
          return;
        }
        // Browsers end continuous recognition after silence; restart while we still want to listen.
        if (wantListeningRef.current && liveRef.current.status === "listening") {
          try {
            rec.start();
          } catch {
            // ignore double start
          }
        }
      };
      recognitionRef.current = rec;
    }
    try {
      recognitionRef.current.start();
    } catch {
      // already running
    }
  }, []);

  /** Stops recognition and waits (briefly) for its last final words to arrive. */
  const flushRecognition = useCallback(
    () =>
      new Promise<void>((resolve) => {
        clearSilenceTimer();
        wantListeningRef.current = false;
        const rec = recognitionRef.current;
        if (!rec) return resolve();
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        flushRef.current = finish;
        window.setTimeout(finish, FLUSH_TIMEOUT_MS);
        try {
          rec.stop();
        } catch {
          finish();
        }
      }),
    [],
  );

  // ---------- Speech synthesis (interviewer voice) ----------
  const cancelSpeech = useCallback(() => {
    speakTokenRef.current += 1;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
  }, []);

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!ttsOn || !("speechSynthesis" in window)) return resolve();
        const token = ++speakTokenRef.current;
        const synth = window.speechSynthesis;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        u.voice = voiceRef.current;
        u.rate = 1;
        u.onend = () => resolve();
        u.onerror = (e) => {
          if (e.error !== "interrupted" && e.error !== "canceled") setNotice("Audio playback failed; the interviewer's question is shown as a caption.");
          resolve();
        };
        synth.speak(u);
        // Some browsers never fire onend for blocked/autoplay-restricted audio.
        window.setTimeout(() => {
          if (speakTokenRef.current === token && !synth.speaking) resolve();
        }, 1500 + text.length * 90);
      }),
    [ttsOn],
  );

  // The mic only captures on the candidate's turn, never while the interviewer speaks.
  useEffect(() => {
    if (!started || done) return;
    const capture = live.status === "listening" && micOn && !captureLocked && !sttFailure;
    if (engine === "browser") {
      if (capture) startListening();
      else if (!captureLocked) stopListening();
    } else if (engine === "server") {
      if (capture) recorder.start();
      else if (!captureLocked) recorder.pause();
    }
  }, [live.status, started, done, micOn, captureLocked, sttFailure, engine, startListening, stopListening, recorder]);

  // ---------- Server calls ----------
  const applyPayload = useCallback((data: ConversationPayload) => {
    if (Array.isArray(data.messages)) setMessages(data.messages);
    if (data.state) {
      setServerState(data.state);
      setSecondsLeft(data.state.secondsLeft);
    }
  }, []);

  const send = useCallback(
    async (turn: PendingTurn) => {
      const id = interviewIdRef.current;
      try {
        window.localStorage.setItem(PENDING_KEY, JSON.stringify({ interviewId: id, ...turn }));
      } catch {
        // ignore
      }
      let res: Response | null = null;
      try {
        res = await fetch(`/api/interviews/${encodeURIComponent(id)}/conversation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(turn),
          signal: AbortSignal.timeout(90_000),
        });
      } catch {
        dispatch({ type: "REQUEST_FAILED", message: "Connection lost while saving your answer. Your answer is kept; retry when you're back online.", retryable: true });
        return;
      }
      const data = await readJson<ConversationPayload>(res);
      if (!res.ok || !data?.ok) {
        if (data?.code === "too_short") {
          dispatch({ type: "REQUEST_FAILED", message: data.error || "That answer was too short.", retryable: false });
          return;
        }
        if (data && Array.isArray(data.messages)) applyPayload(data);
        // A server-saved candidate message still shows up after hydration; keep the retry option.
        dispatch({ type: "REQUEST_FAILED", message: data?.error || "The interviewer couldn't respond. Please retry.", retryable: data?.retryable !== false });
        return;
      }
      try {
        window.localStorage.removeItem(PENDING_KEY);
      } catch {
        // ignore
      }
      applyPayload(data);
      if (data.fallback) setNotice("The AI interviewer is unavailable right now, so a standard opening was used. Replies need the AI service.");
      finalRef.current = "";
      setDraft("");
      setInterim("");
      const completed = data.state?.status === "completed";
      const reply = data.message;
      const shouldSpeak = Boolean(reply && ttsOn && canSpeak);
      dispatch({ type: "AI_REPLIED", speak: shouldSpeak, completed: false, voice: micOnRef.current });
      if (reply && shouldSpeak) {
        await speak(reply.text);
        dispatch({ type: "SPEECH_ENDED", voice: micOnRef.current });
      }
      if (completed) void finishRef.current("conversation_closed");
    },
    [applyPayload, speak, ttsOn, canSpeak],
  );

  const submit = useCallback(
    (action: "reply" | "skip", text?: string, opts: { timedOut?: boolean } = {}) => {
      const state = liveRef.current;
      if (!canSubmit(state)) return;
      const body = (text ?? "").trim();
      // A timed-out answer is sent as heard, however short; a manual one needs a little substance.
      if (action === "reply" && (opts.timedOut ? !body : body.length < 2)) {
        setNotice("Say a little more before sending your answer.");
        return;
      }
      clearSilenceTimer();
      stopListening();
      cancelSpeech();
      setNotice("");
      const turn: PendingTurn = { requestId: newRequestId(), action, text: action === "reply" ? body : "", ...(opts.timedOut ? { timedOut: true } : {}) };
      // Move liveRef forward now, not on the next render: a manual click and the timer
      // firing in the same tick must not both get through.
      liveRef.current = liveReducer(state, { type: "SUBMIT", turn });
      if (action === "reply") setMessages((m) => [...m, { id: `local-${turn.requestId}`, role: "candidate", text: body, kind: "answer", questionId: "", at: new Date().toISOString() }]);
      dispatch({ type: "SUBMIT", turn });
      void send(turn);
    },
    [cancelSpeech, send, stopListening],
  );
  submitRef.current = submit;

  function retry() {
    if (!live.pending) return;
    dispatch({ type: "RETRY" });
    void send(live.pending);
  }

  // ---------- Finalising an answer ----------
  /** Browser engine: stop listening, collect the last words, then send (or record no answer). */
  const finishBrowserAnswer = useCallback(
    async (timedOut: boolean) => {
      setCaptureLocked(true);
      const before = finalRef.current;
      const pendingInterim = interimRef.current.trim();
      await flushRecognition();
      // If stopping turned the in-progress words into final ones, they're already in finalRef.
      const text = (finalRef.current !== before ? finalRef.current : [finalRef.current, pendingInterim].filter(Boolean).join(" ")).trim();
      setCaptureLocked(false);
      if (HAS_WORDS.test(text)) submitRef.current("reply", text, timedOut ? { timedOut: true } : {});
      else if (timedOut) submitRef.current("skip", "", { timedOut: true });
      else setNotice("We didn't catch an answer yet. Speak, then tap Done answering.");
    },
    [flushRecognition],
  );

  /** Server engine: transcribe one recorded answer, then send it. Failures keep the audio for a retry. */
  const transcribeAndSubmit = useCallback(async (blob: Blob, timedOut: boolean) => {
    setTranscribing(true);
    setSttFailure(null);
    const form = new FormData();
    form.append("audio", blob, "answer");
    const res = await fetch(`/api/interviews/${encodeURIComponent(interviewIdRef.current)}/transcribe`, { method: "POST", body: form }).catch(() => null);
    const data = res ? await readJson<{ ok: boolean; text?: string; error?: string; retryable?: boolean }>(res) : null;
    setTranscribing(false);
    if (!res?.ok || !data?.ok || typeof data.text !== "string") {
      proctorRecordRef.current("transcription_failed", { force: true });
      setSttFailure({ blob, timedOut, message: data?.error || "Couldn't reach the server to transcribe your answer. Your recording is kept.", retryable: !res || data?.retryable !== false });
      return;
    }
    setCaptureLocked(false);
    const text = data.text.trim();
    setDraft(text);
    if (HAS_WORDS.test(text)) submitRef.current("reply", text, timedOut ? { timedOut: true } : {});
    else if (timedOut) submitRef.current("skip", "", { timedOut: true });
    else setNotice("We couldn't make out any words. Please answer again.");
  }, []);

  const finishServerAnswer = useCallback(
    async (timedOut: boolean) => {
      setCaptureLocked(true);
      const blob = await recorder.stop();
      if (blob) return transcribeAndSubmit(blob, timedOut);
      setCaptureLocked(false);
      if (timedOut) submitRef.current("skip", "", { timedOut: true });
      else setNotice("We didn't hear an answer yet. Speak, then tap Done answering.");
    },
    [recorder, transcribeAndSubmit],
  );

  const finishAnswer = useCallback((timedOut: boolean) => (engine === "server" ? finishServerAnswer(timedOut) : finishBrowserAnswer(timedOut)), [engine, finishBrowserAnswer, finishServerAnswer]);

  // ---------- Answer timer ----------
  // Every interviewer turn the candidate has to answer gets its own countdown. It starts once the
  // interviewer has finished speaking and pauses while an answer is being finalised or saved, or
  // the interview is paused. It's purely client-side: no AI call per tick.
  const activeQuestionKey = [...messages].reverse().find((m) => m.role === "interviewer")?.id ?? "";
  const micLost = media.mic === "unavailable" || media.mic === "denied";
  const answerTimer = useAnswerTimer({
    key: activeQuestionKey,
    // Policy: a disconnected microphone is a technical interruption, so the answer timer pauses until
    // it is reconnected. Leaving the tab or muting yourself does not pause it.
    active: started && !done && !finishing && !captureLocked && !sttFailure && !micLost && (live.status === "awaiting_candidate" || live.status === "listening"),
    onExpire: () => void finishAnswer(true),
  });

  // ---------- Finish ----------
  async function requestReport(id: string) {
    const res = await fetch("/api/ai/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interviewId: id }) }).catch(() => null);
    const data = res ? await readJson<{ ok: boolean; report?: FinalReport; error?: string; retryable?: boolean }>(res) : null;
    if (res?.ok && data?.ok && data.report) return { report: data.report, reportError: null, reportRetryable: false };
    // A network failure (no response) is always worth retrying.
    return { report: null, reportError: data?.error || "The report service is unavailable.", reportRetryable: !res || Boolean(data?.retryable) };
  }

  async function finish(endedReason: string) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    stopListening();
    recorder.cancel();
    cancelSpeech();
    const id = interviewIdRef.current;
    let averageScore: number | null = null;
    let pending = 0;
    let saved = false;
    // Deliver every proctoring event first, so the server's summary includes them.
    await proctor.end().catch(() => undefined);
    try {
      const res = await fetch(`/api/interviews/${id}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endedReason: endedReason === "conversation_closed" ? "max_questions" : endedReason }),
      });
      const data = await readJson<{ ok: boolean; averageScore?: number | null; pendingEvaluations?: number }>(res);
      saved = res.ok && Boolean(data?.ok);
      averageScore = data?.averageScore ?? null;
      pending = data?.pendingEvaluations ?? 0;
    } catch {
      saved = false;
    }
    const { report, reportError, reportRetryable } = saved
      ? await requestReport(id)
      : { report: null, reportError: "The interview could not be finalised on the server.", reportRetryable: false };
    if (saved) saveInterviewId(null);
    try {
      window.localStorage.removeItem(PENDING_KEY);
    } catch {
      // ignore
    }
    // The call is over: release the camera and microphone.
    media.stopAll();
    dispatch({ type: "COMPLETE" });
    setDone({ averageScore, pending, report, reportError, reportRetryable, endedReason, saved });
    setFinishing(false);
  }
  const finishRef = useRef(finish);
  finishRef.current = finish;

  async function retryEvaluation() {
    setRetryingEval(true);
    const id = done ? interviewIdRef.current : "";
    const res = await fetch(`/api/interviews/${id}/evaluate-pending`, { method: "POST" }).catch(() => null);
    const data = res ? await readJson<{ averageScore?: number | null; pendingEvaluations?: number; error?: string }>(res) : null;
    const next = res?.ok && !done?.report ? await requestReport(id) : null;
    setDone((d) => (d ? { ...d, averageScore: data?.averageScore ?? d.averageScore, pending: data?.pendingEvaluations ?? d.pending, ...(next ?? {}) } : d));
    setRetryingEval(false);
  }

  // ---------- Start / resume ----------
  async function start() {
    setStarting(true);
    setStartError("");
    try {
      const res = await fetch("/api/start-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId: interviewIdRef.current || undefined,
          type: config.type,
          difficulty: config.difficulty,
          role: config.role,
          experience: config.experience,
          company: config.company,
          focusAreas: config.focusAreas,
          interactionMode: "video",
          useResume: Boolean(config.useResume && (resumeText || resumeId)),
          resumeText: config.useResume ? resumeText : "",
          resumeId: config.useResume ? resumeId || undefined : undefined,
        }),
      });
      const data = await readJson<{ ok: boolean; interviewId?: string; error?: string; code?: string }>(res);
      if (!res.ok || !data?.ok || !data.interviewId) {
        if (data?.code === "interview_closed") {
          saveInterviewId(null);
          interviewIdRef.current = "";
          setInterviewId("");
        }
        throw new Error(data?.error || "Could not start the interview.");
      }
      interviewIdRef.current = data.interviewId;
      setInterviewId(data.interviewId);
      saveInterviewId(data.interviewId);
      saveDetails(config);

      // Hydrate an existing conversation (refresh/resume) before starting a new one; no AI call.
      const existing = await fetch(`/api/interviews/${data.interviewId}/conversation`).then((r) => readJson<ConversationPayload>(r)).catch(() => null);
      await proctor.begin(data.interviewId);
      setStarted(true);
      setStarting(false);
      if (!canSpeak) setNotice("This browser can't play speech, so the interviewer's questions are shown as captions.");
      if (existing?.ok && existing.messages && existing.messages.length > 0) {
        applyPayload(existing);
        setNotice("Welcome back. Your conversation so far has been restored.");
        if (existing.state?.paused) await fetch(`/api/interviews/${data.interviewId}/conversation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: newRequestId(), action: "resume" }) });
        let pending: (PendingTurn & { interviewId?: string }) | null = null;
        try {
          pending = JSON.parse(window.localStorage.getItem(PENDING_KEY) || "null");
        } catch {
          pending = null;
        }
        if (pending && pending.interviewId === data.interviewId) {
          dispatch({ type: "SUBMIT", turn: pending });
          dispatch({ type: "REQUEST_FAILED", message: "Your last answer was sent but the interviewer hadn't replied when the page closed.", retryable: true });
          return;
        }
        dispatch({ type: "SUBMIT", turn: { requestId: newRequestId(), action: "start", text: "" } });
        dispatch({ type: "AI_REPLIED", speak: false, completed: existing.state?.status === "completed", voice: micOnRef.current });
        if (existing.state?.status === "completed") void finishRef.current("conversation_closed");
        return;
      }
      const turn: PendingTurn = { requestId: newRequestId(), action: "start", text: "" };
      dispatch({ type: "SUBMIT", turn });
      await send(turn);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Could not start the interview.");
      setStarting(false);
    }
  }

  async function togglePause() {
    const pausing = live.status !== "paused";
    if (pausing) {
      stopListening();
      cancelSpeech();
      dispatch({ type: "PAUSE" });
    } else {
      dispatch({ type: "RESUME", voice: micOn });
    }
    const res = await fetch(`/api/interviews/${interviewIdRef.current}/conversation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: newRequestId(), action: pausing ? "pause" : "resume" }),
    }).catch(() => null);
    const data = res ? await readJson<ConversationPayload>(res) : null;
    if (data?.state) setSecondsLeft(data.state.secondsLeft);
  }

  async function toggleMic() {
    if (micOn) {
      await media.setMicOn(false);
      dispatch({ type: "LISTEN_STOP" });
    } else {
      await media.setMicOn(true);
      dispatch({ type: "LISTEN_START" });
    }
  }

  // Local session countdown between server syncs; the server stays authoritative.
  useEffect(() => {
    if (!started || live.status === "paused" || live.status === "completed" || secondsLeft === null) return;
    const id = window.setInterval(() => setSecondsLeft((s) => (s === null ? s : Math.max(0, s - 1))), 1000);
    return () => window.clearInterval(id);
  }, [started, live.status, secondsLeft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (started && secondsLeft === 0 && !done && live.status !== "processing") void finishRef.current("time_limit");
  }, [secondsLeft, started, done, live.status]);

  // A device unplugged mid-call: stop capturing (the proctoring notice explains how to reconnect).
  useEffect(() => {
    if (started && !done && micLost) dispatch({ type: "LISTEN_STOP" });
  }, [micLost, started, done]);

  // ---------- Devices & proctoring ----------
  const loadDetector = useCallback(async () => {
    setDetector("loading");
    const d = await createFaceDetector().catch(() => null);
    faceRef.current = d;
    setDetector(d ? "ready" : "error");
  }, []);

  useEffect(() => {
    if (media.camera === "granted" && detector === "idle") void loadDetector();
  }, [media.camera, detector, loadDetector]);

  useEffect(() => {
    if (!started || done) return;
    const onBefore = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [started, done]);

  // Release speech recognition, speech output and the detector on unmount (media tracks are released by useMediaDevices).
  useEffect(
    () => () => {
      wantListeningRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
      faceRef.current?.dispose?.();
    },
    [],
  );

  // ---------- Render ----------
  const meta = [config.type, config.difficulty, config.role].join(" · ");
  if (!configLoaded) return <PreparingScreen title="Loading your interview…" />;

  if (done) {
    return (
      <>
        <LiveTopBar meta={meta} status={null} onExit={() => (window.location.href = "/")} exitLabel="Close" />
        <CompletionView
          averageScore={done.averageScore}
          report={done.report}
          reportError={done.reportError}
          reportRetryable={done.reportRetryable}
          onRetryReport={retryEvaluation}
          endedReason={done.endedReason}
          answered={messages.filter((m) => m.role === "candidate" && m.kind === "answer").length}
          saved={done.saved}
          interviewId={interviewId}
          pendingEvaluations={done.pending}
          onRetryEvaluation={retryEvaluation}
          onRetryFinish={() => {
            finishingRef.current = false;
            setRetryingEval(true);
            void finish(done.endedReason).finally(() => setRetryingEval(false));
          }}
          retrying={retryingEval || finishing}
        />
      </>
    );
  }

  if (!started) {
    return (
      <>
        <LiveTopBar meta={meta} status={null} onExit={() => (window.location.href = "/")} exitLabel="Leave" />
        <VideoLobby
          meta={[
            ["Type", config.type],
            ["Difficulty", config.difficulty],
            ["Role", config.role],
            ["Experience", config.experience],
            ["Resume", config.useResume && (resumeText || resumeId) ? "Included" : "Not used"],
          ]}
          stream={media.streamRef.current}
          version={media.version}
          camera={media.camera}
          mic={media.mic}
          micLevel={micLevel}
          engine={engine}
          detector={detector}
          canStart={micOn && engine !== "none" && !scheduleMessage && consent}
          consent={consent}
          onConsentChange={setConsent}
          fullscreenSupported={proctor.fullscreen.supported}
          starting={starting}
          message={startError}
          scheduleMessage={scheduleMessage}
          onRequestDevices={() => void media.request()}
          onLoadDetector={() => void loadDetector()}
          onStart={() => {
            // Fullscreen must be requested inside the click; the interview starts either way.
            void proctor.enterFullscreen();
            void start();
          }}
        />
      </>
    );
  }

  const status = live.status;
  const busy = status === "processing" || finishing;
  const candidateTurn = (status === "listening" || status === "awaiting_candidate") && !captureLocked && !sttFailure;
  const heard = `${draft} ${interim}`.trim();
  const phase: CallPhase =
    status === "initializing"
      ? "connecting"
      : status === "ai_speaking"
        ? "ai_speaking"
        : transcribing || (captureLocked && engine === "server")
          ? "transcribing"
          : captureLocked || status === "processing"
            ? "thinking"
            : status === "paused"
              ? "paused"
              : status === "error" || sttFailure
                ? "error"
                : !micOn
                  ? "muted"
                  : heard
                    ? "candidate_speaking"
                    : "listening";
  const lastInterviewer = [...messages].reverse().find((m) => m.role === "interviewer");

  return (
    <>
      <LiveTopBar
        meta={meta}
        onExit={() => setConfirmLeave(true)}
        status={
          <div className="hidden items-center gap-2 sm:flex">
            {serverState ? <Badge>Question {Math.max(1, serverState.questionNumber)} of {serverState.maxMainQuestions}</Badge> : null}
            <Badge tone="info" icon={<ShieldCheck className="size-3" aria-hidden />}>
              Proctoring on
            </Badge>
            <Badge tone={media.camera === "granted" ? "success" : "neutral"}>{media.camera === "granted" ? "● Camera on" : "Camera off"}</Badge>
            <Badge tone={micOn ? "success" : "warning"}>{micOn ? "● Mic on" : "Mic off"}</Badge>
          </div>
        }
      />

      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="grid min-w-0 content-start gap-3">
          <div className="relative flex">
            <InterviewerStage phase={phase} caption={lastInterviewer?.text ?? ""}>
              <div className="absolute right-4 top-4 flex items-center gap-2">
                <TimerPill label={answerTimer.expired ? "Time's up" : `Answer time (${ANSWER_SECONDS}s)`} seconds={answerTimer.secondsLeft} warnAt={10} />
              </div>
            </InterviewerStage>
            <SelfView stream={media.streamRef.current} version={media.version} camera={media.camera} mic={media.mic} videoRef={videoRef} />
          </div>

          <div className="grid gap-1 rounded-card border border-border bg-surface px-4 py-3" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {serverState ? `Question ${Math.max(1, serverState.questionNumber)} of ${serverState.maxMainQuestions} · ` : ""}Your answer
            </p>
            <p className="min-h-12 text-sm leading-6 text-text">
              {engine === "server" ? (
                transcribing ? (
                  <span className="text-muted">Transcribing your answer…</span>
                ) : draft ? (
                  draft
                ) : status === "listening" && micOn ? (
                  <span className="text-muted">Recording… your words appear after you finish answering.</span>
                ) : (
                  <span className="text-muted">{status === "ai_speaking" ? "Your timer starts when the interviewer finishes speaking." : "Waiting for your turn."}</span>
                )
              ) : heard ? (
                <>
                  <span>{draft}</span> {interim ? <span className="italic text-muted">{interim}</span> : null}
                </>
              ) : (
                <span className="text-muted">
                  {status === "ai_speaking" ? "Your timer starts when the interviewer finishes speaking." : status === "listening" && micOn ? "Listening… start speaking." : !micOn ? "Unmute your microphone to answer." : "Waiting for your turn."}
                </span>
              )}
            </p>
            {answerTimer.expired && (status === "processing" || captureLocked) ? <p className="text-xs text-muted">Time&rsquo;s up, so your answer was sent automatically.</p> : null}
          </div>

          {live.error ? (
            <Alert
              tone="error"
              action={
                <div className="flex gap-2">
                  {live.error.retryable && live.pending ? (
                    <Button size="sm" variant="secondary" onClick={retry} icon={<RefreshCw className="size-3.5" aria-hidden />}>
                      Retry
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "DISCARD_PENDING" })}>
                    {live.error.retryable ? "Answer again" : "OK"}
                  </Button>
                </div>
              }
            >
              {live.error.message}
            </Alert>
          ) : null}
          {sttFailure ? (
            <Alert
              tone="error"
              title="Transcription failed"
              action={
                <div className="flex flex-wrap gap-2">
                  {sttFailure.retryable ? (
                    <Button size="sm" variant="secondary" loading={transcribing} onClick={() => void transcribeAndSubmit(sttFailure.blob, sttFailure.timedOut)} icon={<RefreshCw className="size-3.5" aria-hidden />}>
                      Retry transcription
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSttFailure(null);
                      setCaptureLocked(false);
                      if (sttFailure.timedOut) submit("skip", "", { timedOut: true });
                    }}
                  >
                    {sttFailure.timedOut ? "Skip this question" : "Answer again"}
                  </Button>
                </div>
              }
            >
              {sttFailure.message}
            </Alert>
          ) : null}
          {recognitionError ? (
            <Alert
              tone="warning"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setRecognitionError("");
                    if (liveRef.current.status === "listening") startListening();
                    else dispatch({ type: "LISTEN_START" });
                  }}
                >
                  Retry listening
                </Button>
              }
            >
              {recognitionError}
            </Alert>
          ) : null}
          {notice ? <Alert tone="info">{notice}</Alert> : null}
          {proctor.notices.map((n) => (
            <Alert
              key={n.id}
              tone={n.tone}
              action={
                n.action ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (n.action!.kind === "fullscreen") void proctor.enterFullscreen();
                      else if (n.action!.kind === "reconnect_camera") void media.setCameraOn(true);
                      else void media.setMicOn(true).then(() => dispatch({ type: "LISTEN_START" }));
                    }}
                  >
                    {n.action.label}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => proctor.dismiss(n.id)}>
                    Dismiss
                  </Button>
                )
              }
            >
              {n.message}
            </Alert>
          ))}

          <CallControls
            micOn={micOn}
            cameraOn={media.camera === "granted"}
            ending={finishing}
            onToggleMic={() => void toggleMic()}
            onToggleCamera={() => void media.setCameraOn(media.camera !== "granted")}
            onEnd={() => setConfirmEnd(true)}
          >
            {status === "ai_speaking" ? (
              <Button
                variant="secondary"
                icon={<Square className="size-4" aria-hidden />}
                onClick={() => {
                  cancelSpeech();
                  dispatch({ type: "INTERRUPT", voice: micOn });
                }}
              >
                Answer now
              </Button>
            ) : (
              <Button onClick={() => void finishAnswer(false)} disabled={!candidateTurn || busy || !micOn} loading={status === "processing" || transcribing} icon={<Send className="size-4" aria-hidden />}>
                Done answering
              </Button>
            )}
            <Button variant="ghost" onClick={() => submit("skip")} disabled={!canSubmit(live) || busy || captureLocked} icon={<SkipForward className="size-4" aria-hidden />}>
              <span className="hidden sm:inline">Skip</span>
            </Button>
            <Button variant="ghost" onClick={togglePause} disabled={busy || captureLocked} icon={status === "paused" ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}>
              <span className="hidden sm:inline">{status === "paused" ? "Resume" : "Pause"}</span>
            </Button>
            <Button
              variant="ghost"
              aria-label="Repeat the question"
              disabled={busy || status === "paused" || !lastInterviewer || !canSpeak}
              onClick={() => {
                if (lastInterviewer) void speak(lastInterviewer.text);
              }}
              icon={<Repeat className="size-4" aria-hidden />}
            >
              <span className="hidden sm:inline">Repeat</span>
            </Button>
          </CallControls>
        </div>

        <aside className="grid content-start gap-3">
          <TimerPill label={status === "paused" ? "Session time (paused)" : "Session time left"} seconds={secondsLeft ?? serverState?.sessionSeconds ?? 0} warnAt={90} />

          <Card>
            <CardBody className="grid gap-2">
              <button type="button" className="flex items-center justify-between text-left text-sm font-semibold text-text" aria-expanded={showTranscript} onClick={() => setShowTranscript((v) => !v)}>
                Transcript
                <span className="text-xs font-normal text-muted">{showTranscript ? "Hide" : "Show"}</span>
              </button>
              {showTranscript ? (
                <ol className="grid max-h-80 gap-2 overflow-y-auto text-sm" aria-label="Conversation transcript">
                  {messages.map((m) => (
                    <li key={m.id} className={cn("rounded-control px-3 py-2", m.role === "interviewer" ? "bg-surface-muted text-text" : "border border-border text-text", m.kind === "skip" && "italic text-muted")}>
                      <span className="block text-[11px] font-semibold text-muted">{m.role === "interviewer" ? "Interviewer" : "You"}</span>
                      {m.text}
                    </li>
                  ))}
                  <div ref={transcriptEndRef} />
                </ol>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="grid gap-3 text-sm">
              <p className="font-semibold text-text">Audio</p>
              <Button
                size="sm"
                variant="secondary"
                aria-pressed={ttsOn}
                disabled={!canSpeak}
                onClick={() => {
                  if (ttsOn) cancelSpeech();
                  setTtsOn((v) => !v);
                }}
                icon={ttsOn ? <Volume2 className="size-3.5" aria-hidden /> : <VolumeX className="size-3.5" aria-hidden />}
              >
                {ttsOn ? "Interviewer voice on" : "Interviewer voice off"}
              </Button>
              {engine === "browser" ? <Checkbox label="Send my answer when I pause" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} /> : null}
              {proctor.fullscreen.supported && !proctor.fullscreen.active ? (
                <Button size="sm" variant="ghost" onClick={() => void proctor.enterFullscreen().then((ok) => !ok && setNotice("Fullscreen was blocked by the browser."))} icon={<Maximize className="size-3.5" aria-hidden />}>
                  Enter fullscreen
                </Button>
              ) : null}
              <p className="text-xs text-muted">
                {engine === "server" ? "Each answer is transcribed on our server and the audio discarded." : "Your browser turns speech into text; only the text is saved."} Video is never recorded.
              </p>
              <p className="text-xs text-muted">
                Proctoring checks tab visibility, fullscreen, device connections{detector === "ready" ? ", face presence (on this device)" : ""} and long silences. Events are noted for your report; they never end the interview or change your score.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>

      {finishing ? <p className="sr-only" role="status">Finishing the interview and preparing your report.</p> : null}

      <ConfirmDialog
        open={confirmEnd}
        title="End the interview now?"
        description="Your conversation so far will be evaluated and a report generated."
        confirmLabel="End and see report"
        cancelLabel="Keep going"
        onConfirm={() => {
          setConfirmEnd(false);
          void finish("manual_end");
        }}
        onCancel={() => setConfirmEnd(false)}
      />
      <ConfirmDialog
        open={confirmLeave}
        title="Leave this interview?"
        description="The conversation is saved. Start the interview again from this device to continue where you left off."
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={() => {
          stopListening();
          recorder.cancel();
          cancelSpeech();
          media.stopAll();
          window.location.href = "/";
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </>
  );
}

export type { InterviewType, Difficulty };
