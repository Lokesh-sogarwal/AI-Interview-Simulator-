"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Maximize,
  Mic,
  MicOff,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  Send,
  ShieldAlert,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";

import type { Difficulty, InterviewType } from "@/lib/prompts";
import type { FinalReport } from "@/app/api/ai/report/route";
import { Alert, Badge, Button, Card, CardBody, Checkbox, ConfirmDialog, Textarea, cn } from "@/app/components/ui";
import { canSubmit, initialLiveState, liveReducer, mergeRecognition, type PendingTurn } from "@/lib/conversationState";
import {
  DEFAULT_DETAILS,
  loadDetails,
  loadInterviewId,
  loadResumeId,
  loadResumeText,
  saveDetails,
  saveInterviewId,
} from "@/app/lib/interviewStorage";
import { createFaceDetector, type FaceDetectorApi } from "./faceDetector";
import { CompletionView, LiveTopBar, PreflightScreen, PreparingScreen, TimerPill, type DetectorState, type PermissionState } from "./components/LiveParts";

type Message = { id: string; role: "interviewer" | "candidate"; text: string; kind: string; questionId: string; at: string };
type ServerState = { status: string; questionNumber: number; maxMainQuestions: number; secondsLeft: number | null; sessionSeconds: number; paused?: boolean };
type ConversationPayload = { ok: boolean; error?: string; code?: string; retryable?: boolean; message?: Message | null; messages?: Message[]; state?: ServerState; fallback?: boolean; resumed?: boolean; duplicate?: boolean };

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
/** Silence after the last final speech result before the utterance is sent. */
const END_OF_UTTERANCE_MS = 1800;
const MAX_PROCTOR_WARNINGS = 2;

function newRequestId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
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
 * Conversational live interview. The candidate talks (or types) to an AI
 * interviewer that keeps the whole conversation in context; the server owns
 * the transcript, decides follow-ups and scores each question when it closes.
 */
export default function ConversationInterview() {
  // ---------- Configuration ----------
  const [config, setConfig] = useState(() => ({ ...DEFAULT_DETAILS }));
  const [resumeText, setResumeText] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [configLoaded, setConfigLoaded] = useState(false);
  const voiceMode = config.interactionMode === "video";

  // ---------- Devices ----------
  const [camera, setCamera] = useState<PermissionState>("unknown");
  const [mic, setMic] = useState<PermissionState>("unknown");
  const [detector, setDetector] = useState<DetectorState>("idle");
  const [speechSupported, setSpeechSupported] = useState(true);

  // ---------- Conversation ----------
  const [live, dispatch] = useReducer(liveReducer, initialLiveState);
  const [messages, setMessages] = useState<Message[]>([]);
  const [serverState, setServerState] = useState<ServerState | null>(null);
  const [interviewId, setInterviewId] = useState("");
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [autoSend, setAutoSend] = useState(true);
  const [ttsOn, setTtsOn] = useState(true);
  const [notice, setNotice] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** Voice mode is speech-only; typing is offered only as an accessibility/failure fallback. */
  const [typeInstead, setTypeInstead] = useState(false);

  // ---------- Completion ----------
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState<null | { averageScore: number | null; pending: number; report: FinalReport | null; reportError: string | null; endedReason: string; saved: boolean }>(null);
  const [retryingEval, setRetryingEval] = useState(false);

  // ---------- Video / proctoring ----------
  const [videoOn, setVideoOn] = useState(false);
  const [proctorOn, setProctorOn] = useState(false);
  const [violations, setViolations] = useState(0);
  const [lastViolation, setLastViolation] = useState("");
  const [detectorNote, setDetectorNote] = useState("");

  const liveRef = useRef(live);
  liveRef.current = live;
  const interviewIdRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  const finalRef = useRef("");
  const draftEditedRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speakTokenRef = useRef(0);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceRef = useRef<FaceDetectorApi | null>(null);
  const lastFocusViolationRef = useRef(0);
  const finishingRef = useRef(false);

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
    setSpeechSupported(Boolean(getRecognitionCtor()));
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
    transcriptEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, interim]);

  // ---------- Speech recognition (input only) ----------
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

  const submitRef = useRef<(action: "reply" | "skip", text?: string) => void>(() => {});

  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSpeechSupported(false);
      return;
    }
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
          if (!draftEditedRef.current) setDraft(finalRef.current);
        }
        setInterim(interimText);
        // End of utterance: a pause after final words. Interim words alone never submit.
        clearSilenceTimer();
        if (finalRef.current && !interimText) {
          silenceTimerRef.current = window.setTimeout(() => {
            if (autoSendRef.current && !draftEditedRef.current && finalRef.current.split(/\s+/).length >= 2) submitRef.current("reply", finalRef.current);
          }, END_OF_UTTERANCE_MS);
        }
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setMic("denied");
          wantListeningRef.current = false;
          setNotice("Microphone access was blocked, so voice input is off. You can keep typing your answers.");
        } else if (e.error !== "no-speech" && e.error !== "aborted") {
          setNotice("Voice input had a problem. You can keep typing, or press Speak to try again.");
        }
      };
      // Browsers end continuous recognition after silence; restart while we still want to listen.
      rec.onend = () => {
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

  const autoSendRef = useRef(autoSend);
  autoSendRef.current = autoSend;

  // ---------- Speech synthesis (output only) ----------
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
          if (e.error !== "interrupted" && e.error !== "canceled") setNotice("Audio playback failed; the interviewer's reply is shown as text.");
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

  // Status-driven side effects: mic only listens on the candidate's turn, never while the AI speaks.
  useEffect(() => {
    if (!started) return;
    if (live.status === "listening" && voiceMode && mic !== "denied") startListening();
    else stopListening();
  }, [live.status, started, voiceMode, mic, startListening, stopListening]);

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
        dispatch({ type: "REQUEST_FAILED", message: "Connection lost while waiting for the interviewer. Your answer is kept; retry when you're back online.", retryable: true });
        return;
      }
      const data = await readJson<ConversationPayload>(res);
      if (!res.ok || !data?.ok) {
        if (data?.code === "too_short") {
          dispatch({ type: "REQUEST_FAILED", message: data.error || "That reply was too short.", retryable: false });
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
      draftEditedRef.current = false;
      setDraft("");
      setInterim("");
      const completed = data.state?.status === "completed";
      const reply = data.message;
      const shouldSpeak = Boolean(reply && voiceMode && ttsOn);
      dispatch({ type: "AI_REPLIED", speak: shouldSpeak, completed: false, voice: voiceMode && mic !== "denied" });
      if (reply && shouldSpeak) {
        await speak(reply.text);
        dispatch({ type: "SPEECH_ENDED", voice: voiceMode && mic !== "denied" });
      }
      if (completed) void finishRef.current("conversation_closed");
    },
    [applyPayload, mic, speak, ttsOn, voiceMode],
  );

  const submit = useCallback(
    (action: "reply" | "skip", text?: string) => {
      const state = liveRef.current;
      if (!canSubmit(state)) return;
      const body = (text ?? "").trim();
      if (action === "reply" && body.length < 2) {
        setNotice("Say or type a little more before sending.");
        return;
      }
      clearSilenceTimer();
      stopListening();
      cancelSpeech();
      const turn: PendingTurn = { requestId: newRequestId(), action, text: action === "reply" ? body : "" };
      // Optimistic transcript entry so the candidate sees what was sent.
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

  // ---------- Finish ----------
  async function finish(endedReason: string) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    stopListening();
    cancelSpeech();
    const id = interviewIdRef.current;
    let averageScore: number | null = null;
    let pending = 0;
    let saved = false;
    try {
      const res = await fetch(`/api/interviews/${id}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endedReason: endedReason === "conversation_closed" ? "max_questions" : endedReason, proctoring: proctorOn ? { violations, lastViolation } : null }),
      });
      const data = await readJson<{ ok: boolean; averageScore?: number | null; pendingEvaluations?: number }>(res);
      saved = res.ok && Boolean(data?.ok);
      averageScore = data?.averageScore ?? null;
      pending = data?.pendingEvaluations ?? 0;
    } catch {
      saved = false;
    }
    let report: FinalReport | null = null;
    let reportError: string | null = null;
    if (saved) {
      const res = await fetch("/api/ai/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interviewId: id }) }).catch(() => null);
      const data = res ? await readJson<{ ok: boolean; report?: FinalReport; error?: string }>(res) : null;
      if (res?.ok && data?.ok && data.report) report = data.report;
      else reportError = data?.error || "The report service is unavailable.";
    } else {
      reportError = "The interview could not be finalised on the server.";
    }
    if (saved) saveInterviewId(null);
    try {
      window.localStorage.removeItem(PENDING_KEY);
    } catch {
      // ignore
    }
    setProctorOn(false);
    setVideoOn(false);
    dispatch({ type: "COMPLETE" });
    setDone({ averageScore, pending, report, reportError, endedReason, saved });
    setFinishing(false);
  }
  const finishRef = useRef(finish);
  finishRef.current = finish;

  async function retryEvaluation() {
    setRetryingEval(true);
    const id = done ? interviewIdRef.current : "";
    const res = await fetch(`/api/interviews/${id}/evaluate-pending`, { method: "POST" }).catch(() => null);
    const data = res ? await readJson<{ averageScore?: number | null; pendingEvaluations?: number; error?: string }>(res) : null;
    let report = done?.report ?? null;
    let reportError = done?.reportError ?? null;
    if (res?.ok) {
      const r = await fetch("/api/ai/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interviewId: id }) }).catch(() => null);
      const rd = r ? await readJson<{ ok: boolean; report?: FinalReport; error?: string }>(r) : null;
      if (r?.ok && rd?.report) {
        report = rd.report;
        reportError = null;
      }
    }
    setDone((d) => (d ? { ...d, averageScore: data?.averageScore ?? d.averageScore, pending: data?.pendingEvaluations ?? d.pending, report, reportError } : d));
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
          interactionMode: config.interactionMode,
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

      // Hydrate an existing conversation (refresh/resume) before starting a new one.
      const existing = await fetch(`/api/interviews/${data.interviewId}/conversation`).then((r) => readJson<ConversationPayload>(r)).catch(() => null);
      setStarted(true);
      setStarting(false);
      if (voiceMode) {
        setVideoOn(true);
        setProctorOn(true);
      }
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
        dispatch({ type: "AI_REPLIED", speak: false, completed: existing.state?.status === "completed", voice: voiceMode });
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
      dispatch({ type: "RESUME", voice: voiceMode && mic !== "denied" });
    }
    const res = await fetch(`/api/interviews/${interviewIdRef.current}/conversation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: newRequestId(), action: pausing ? "pause" : "resume" }),
    }).catch(() => null);
    const data = res ? await readJson<ConversationPayload>(res) : null;
    if (data?.state) setSecondsLeft(data.state.secondsLeft);
  }

  // Local countdown between server syncs; the server stays authoritative.
  useEffect(() => {
    if (!started || live.status === "paused" || live.status === "completed" || secondsLeft === null) return;
    const id = window.setInterval(() => setSecondsLeft((s) => (s === null ? s : Math.max(0, s - 1))), 1000);
    return () => window.clearInterval(id);
  }, [started, live.status, secondsLeft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (started && secondsLeft === 0 && !done && live.status !== "processing") void finishRef.current("time_limit");
  }, [secondsLeft, started, done, live.status]);

  // ---------- Devices & proctoring ----------
  const requestPermission = useCallback(async (kind: "camera" | "mic") => {
    try {
      const s = await navigator.mediaDevices.getUserMedia(kind === "camera" ? { video: true } : { audio: true });
      s.getTracks().forEach((t) => t.stop());
      (kind === "camera" ? setCamera : setMic)("granted");
    } catch {
      (kind === "camera" ? setCamera : setMic)("denied");
    }
  }, []);

  const loadDetector = useCallback(async () => {
    setDetector("loading");
    const d = await createFaceDetector().catch(() => null);
    faceRef.current = d;
    setDetector(d ? "ready" : "error");
  }, []);

  useEffect(() => {
    if (!videoOn) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => {
        setVideoOn(false);
        setNotice("Camera unavailable; the interview continues without video.");
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [videoOn]);

  const record = useCallback((reason: string) => {
    if (finishingRef.current) return;
    setLastViolation(reason);
    setViolations((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!proctorOn) return;
    const focusViolation = (reason: string) => {
      const now = Date.now();
      if (now - lastFocusViolationRef.current < 2000 || liveRef.current.status === "paused") return;
      lastFocusViolationRef.current = now;
      record(reason);
    };
    const onVis = () => document.hidden && focusViolation("Switched tab or window");
    const onBlur = () => focusViolation("Window lost focus");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    const faceTimer = window.setInterval(async () => {
      const v = videoRef.current;
      const d = faceRef.current;
      if (!v || !d || v.readyState < 2 || liveRef.current.status === "paused") return;
      const boxes = await d.detect(v).catch(() => null);
      if (boxes && boxes.length > 1) record("More than one face detected");
    }, 2000);
    setDetectorNote(faceRef.current ? "Face presence and tab switches are monitored." : "Face detection unavailable; only tab and focus changes are monitored.");
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.clearInterval(faceTimer);
    };
  }, [proctorOn, record]);

  useEffect(() => {
    if (proctorOn && violations >= MAX_PROCTOR_WARNINGS) void finishRef.current("proctor_violations");
  }, [proctorOn, violations]);

  useEffect(() => {
    if (!started || done) return;
    const onBefore = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [started, done]);

  // Release mic, camera, speech and detector on unmount.
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
      streamRef.current?.getTracks().forEach((t) => t.stop());
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
    const videoReady = !voiceMode || (camera === "granted" && mic === "granted" && detector === "ready");
    return (
      <>
        <LiveTopBar meta={meta} status={null} onExit={() => (window.location.href = "/")} exitLabel="Leave" />
        <PreflightScreen
          meta={[
            ["Type", config.type],
            ["Difficulty", config.difficulty],
            ["Role", config.role],
            ["Experience", config.experience],
            ["Mode", voiceMode ? "Voice conversation" : "Typed conversation"],
            ["Resume", config.useResume && (resumeText || resumeId) ? "Included" : "Not used"],
          ]}
          interactionMode={config.interactionMode}
          resume={{ needed: false, status: "ready" }}
          camera={camera}
          mic={mic}
          detector={detector}
          scheduleMessage={scheduleMessage ?? (voiceMode && !speechSupported ? "This browser doesn't support speech recognition. You can still speak with the interviewer's voice on, but you'll type your replies." : null)}
          canStart={videoReady && !scheduleMessage}
          starting={starting}
          message={startError}
          onRequestCamera={() => void requestPermission("camera")}
          onRequestMic={() => void requestPermission("mic")}
          onLoadDetector={() => void loadDetector()}
          onStart={() => void start()}
          onUseTyping={() => {
            const next = { ...config, interactionMode: "typing" as const };
            setConfig(next);
            saveDetails(next);
          }}
        />
      </>
    );
  }

  const status = live.status;
  const speechOnly = voiceMode && speechSupported && mic !== "denied" && !typeInstead;
  const busy = status === "processing" || finishing;
  const statusLabel: Record<string, string> = {
    initializing: "Connecting…",
    processing: "Interviewer is thinking…",
    ai_speaking: "Interviewer is speaking",
    listening: "Listening…",
    awaiting_candidate: "Your turn",
    paused: "Paused",
    error: "Needs attention",
    completed: "Finished",
  };

  return (
    <>
      <LiveTopBar
        meta={meta}
        onExit={() => setConfirmLeave(true)}
        status={
          <div className="hidden items-center gap-2 sm:flex">
            {serverState ? (
              <Badge>
                Question {Math.max(1, serverState.questionNumber)} of {serverState.maxMainQuestions}
              </Badge>
            ) : null}
            {proctorOn ? (
              <Badge tone={violations ? "warning" : "info"} icon={<ShieldAlert className="size-3" aria-hidden />}>
                {violations}/{MAX_PROCTOR_WARNINGS} warnings
              </Badge>
            ) : null}
          </div>
        }
      />

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-4">
          <Card className="flex max-h-[60dvh] min-h-80 flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-text" aria-live="polite">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    status === "listening" ? "bg-error ui-pulse" : status === "ai_speaking" ? "bg-success ui-pulse" : status === "processing" ? "bg-warning ui-pulse" : "bg-secondary",
                  )}
                  aria-hidden
                />
                {statusLabel[status]}
              </p>
              <div className="flex gap-1">
                {status === "ai_speaking" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Square className="size-3.5" aria-hidden />}
                    onClick={() => {
                      cancelSpeech();
                      dispatch({ type: "INTERRUPT", voice: voiceMode && mic !== "denied" });
                    }}
                  >
                    Interrupt
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Repeat the interviewer's last message"
                  icon={<Repeat className="size-3.5" aria-hidden />}
                  disabled={busy || status === "paused"}
                  onClick={() => {
                    const last = [...messages].reverse().find((m) => m.role === "interviewer");
                    if (last) void speak(last.text);
                  }}
                >
                  <span className="hidden sm:inline">Repeat</span>
                </Button>
              </div>
            </div>
            <ol className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-label="Conversation transcript">
              {messages.map((m) => (
                <li key={m.id} className={cn("flex", m.role === "candidate" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6",
                      m.role === "interviewer" ? "rounded-tl-sm bg-primary text-on-primary" : "rounded-tr-sm border border-border bg-surface-muted text-text",
                      m.kind === "skip" && "italic text-muted",
                    )}
                  >
                    <span className="sr-only">{m.role === "interviewer" ? "Interviewer: " : "You: "}</span>
                    {m.text}
                  </div>
                </li>
              ))}
              {interim ? (
                <li className="flex justify-end" aria-hidden>
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-dashed border-border-strong px-4 py-2.5 text-sm italic text-muted">{interim}…</div>
                </li>
              ) : null}
              {status === "processing" ? (
                <li className="flex justify-start" aria-hidden>
                  <div className="rounded-2xl rounded-tl-sm bg-primary/80 px-4 py-2.5 text-sm text-on-primary">
                    <span className="ui-pulse">…</span>
                  </div>
                </li>
              ) : null}
              <div ref={transcriptEndRef} />
            </ol>
          </Card>

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
                    {live.error.retryable ? "Edit answer" : "OK"}
                  </Button>
                </div>
              }
            >
              {live.error.message}
            </Alert>
          ) : null}
          {notice ? <Alert tone="info">{notice}</Alert> : null}

          <Card>
            <CardBody className="grid gap-3">
              {speechOnly ? (
                <>
                  <p className="text-sm font-semibold text-text">Your reply</p>
                  <div
                    className={cn(
                      "min-h-24 rounded-control border px-3.5 py-2.5 text-sm leading-6",
                      status === "listening" ? "border-error/40 bg-error-soft/40" : "border-border bg-surface-muted",
                    )}
                    aria-live="polite"
                    aria-label="Live transcript of your reply"
                  >
                    {draft || interim ? (
                      <>
                        <span className="text-text">{draft}</span> {interim ? <span className="italic text-muted">{interim}</span> : null}
                      </>
                    ) : (
                      <span className="text-muted">
                        {status === "listening" ? "Listening… start speaking." : status === "ai_speaking" ? "The interviewer is speaking. Tap Interrupt to answer now." : status === "processing" ? "Sent. The interviewer is thinking…" : "Tap Speak to answer."}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {autoSend ? "Your reply is sent automatically after a short pause." : "Tap Done speaking when you've finished."} Only final words are sent, never partial ones.
                  </p>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" size="sm" onClick={() => submit("skip")} disabled={!canSubmit(live) || busy} icon={<SkipForward className="size-4" aria-hidden />}>
                        Skip question
                      </Button>
                      <Button variant="ghost" size="sm" onClick={togglePause} disabled={busy} icon={status === "paused" ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}>
                        {status === "paused" ? "Resume" : "Pause"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || !draft}
                        icon={<Repeat className="size-4" aria-hidden />}
                        onClick={() => {
                          finalRef.current = "";
                          clearSilenceTimer();
                          setDraft("");
                          setInterim("");
                        }}
                      >
                        Redo
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        disabled={busy || status === "paused" || status === "ai_speaking" || status === "error"}
                        aria-pressed={status === "listening"}
                        onClick={() => dispatch({ type: status === "listening" ? "LISTEN_STOP" : "LISTEN_START" })}
                        icon={status === "listening" ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
                      >
                        {status === "listening" ? "Mute" : "Speak"}
                      </Button>
                      <Button onClick={() => submit("reply", draft)} disabled={!canSubmit(live) || busy || draft.trim().length < 2} loading={status === "processing"} icon={<Send className="size-4" aria-hidden />}>
                        Done speaking
                      </Button>
                    </div>
                  </div>
                  <button type="button" className="justify-self-start text-xs text-muted underline underline-offset-2 hover:text-text" onClick={() => setTypeInstead(true)}>
                    Can&rsquo;t speak right now? Type instead
                  </button>
                </>
              ) : (
                <>
              <label htmlFor="reply" className="text-sm font-semibold text-text">
                {voiceMode ? "Your reply (transcribed; you can edit before sending)" : "Your reply"}
              </label>
              <Textarea
                id="reply"
                rows={4}
                value={draft}
                disabled={busy || status === "paused" || status === "error"}
                onChange={(e) => {
                  draftEditedRef.current = true;
                  clearSilenceTimer();
                  setDraft(e.target.value);
                  // Typing while the interviewer talks is a barge-in.
                  if (status === "ai_speaking") {
                    cancelSpeech();
                    dispatch({ type: "INTERRUPT", voice: false });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit("reply", draft);
                  }
                }}
                placeholder={voiceMode && speechSupported && mic !== "denied" ? "Start speaking. Your words appear here…" : "Type your reply…"}
                aria-describedby="reply-help"
              />
              <p id="reply-help" className="text-xs text-muted">
                {voiceMode && speechSupported && mic !== "denied"
                  ? autoSend
                    ? "Your reply is sent after a short pause. Editing the text turns auto-send off for this reply."
                    : "Press Send when you're done speaking."
                  : "Send with the button or Ctrl/⌘ + Enter."}
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={() => submit("skip")} disabled={!canSubmit(live) || busy} icon={<SkipForward className="size-4" aria-hidden />}>
                    Skip question
                  </Button>
                  <Button variant="ghost" size="sm" onClick={togglePause} disabled={busy} icon={status === "paused" ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}>
                    {status === "paused" ? "Resume" : "Pause"}
                  </Button>
                </div>
                <div className="flex gap-2">
                  {voiceMode && speechSupported && mic !== "denied" ? (
                    <Button
                      variant="secondary"
                      disabled={busy || status === "paused" || status === "ai_speaking" || status === "error"}
                      aria-pressed={status === "listening"}
                      onClick={() => dispatch({ type: status === "listening" ? "LISTEN_STOP" : "LISTEN_START" })}
                      icon={status === "listening" ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
                    >
                      {status === "listening" ? "Stop" : "Speak"}
                    </Button>
                  ) : null}
                  <Button onClick={() => submit("reply", draft)} disabled={!canSubmit(live) || busy || draft.trim().length < 2} loading={status === "processing"} icon={<Send className="size-4" aria-hidden />}>
                    Send
                  </Button>
                </div>
              </div>
                  {voiceMode && typeInstead ? (
                    <button type="button" className="justify-self-start text-xs text-muted underline underline-offset-2 hover:text-text" onClick={() => setTypeInstead(false)}>
                      Switch back to speaking
                    </button>
                  ) : null}
                </>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="grid content-start gap-4">
          <TimerPill label={status === "paused" ? "Session time (paused)" : "Session time left"} seconds={secondsLeft ?? serverState?.sessionSeconds ?? 0} warnAt={90} />

          {voiceMode ? (
            <Card>
              <CardBody className="grid gap-3">
                <div className="relative overflow-hidden rounded-control bg-primary">
                  <video
                    ref={(el) => {
                      videoRef.current = el;
                      if (el && streamRef.current && el.srcObject !== streamRef.current) el.srcObject = streamRef.current;
                    }}
                    autoPlay
                    playsInline
                    muted
                    className={cn("aspect-video w-full -scale-x-100 object-cover", !videoOn && "invisible")}
                    aria-label="Your camera preview"
                  />
                  {!videoOn ? <div className="absolute inset-0 grid place-items-center text-sm text-on-primary/80">Camera off</div> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" aria-pressed={videoOn} onClick={() => setVideoOn((v) => !v)} icon={videoOn ? <Camera className="size-3.5" aria-hidden /> : <CameraOff className="size-3.5" aria-hidden />}>
                    {videoOn ? "Camera on" : "Camera off"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => setNotice("Fullscreen was blocked by the browser."))} icon={<Maximize className="size-3.5" aria-hidden />}>
                    Fullscreen
                  </Button>
                </div>
                {proctorOn ? (
                  <p className="text-xs text-muted">
                    {detectorNote}
                    {lastViolation ? <span className="block text-warning">Last warning: {lastViolation}</span> : null}
                  </p>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardBody className="grid gap-3 text-sm">
              <p className="font-semibold text-text">Audio</p>
              <Button
                size="sm"
                variant="secondary"
                aria-pressed={ttsOn}
                onClick={() => {
                  if (ttsOn) cancelSpeech();
                  setTtsOn((v) => !v);
                }}
                icon={ttsOn ? <Volume2 className="size-3.5" aria-hidden /> : <VolumeX className="size-3.5" aria-hidden />}
              >
                {ttsOn ? "Interviewer voice on" : "Interviewer voice off"}
              </Button>
              {voiceMode ? <Checkbox label="Send automatically after a pause" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} /> : null}
              <p className="text-xs text-muted">
                Speech is recognised by your browser and the interviewer&rsquo;s voice is your browser&rsquo;s text-to-speech. Only the final text of your replies is sent to the server.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="grid gap-2 text-sm">
              <Button variant="danger" onClick={() => setConfirmEnd(true)} disabled={finishing}>
                {finishing ? "Finishing…" : "End interview"}
              </Button>
              <p className="text-xs text-muted">Your answers are scored when you end the interview or move past a question.</p>
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
          cancelSpeech();
          window.location.href = "/";
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </>
  );
}

export type { InterviewType, Difficulty };
