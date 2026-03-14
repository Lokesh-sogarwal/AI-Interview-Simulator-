"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Difficulty, InterviewType } from "@/lib/prompts";
import { adjustDifficulty } from "@/lib/prompts";
import type { Evaluation } from "@/app/api/ai/evaluate/route";
import type { FinalReport } from "@/app/api/ai/report/route";
import type { ResumeProfile } from "@/app/api/resume/profile/route";
import { createFaceDetector, type FaceDetectorApi } from "./faceDetector";

type Turn = {
  question: string;
  answer: string;
  evaluation: Evaluation;
  star?: {
    star_used: boolean;
    emotional_intelligence_score: number;
    structure_score: number;
    improvement_feedback: string;
  };
};

type SpeechRecognitionType = {
  start: () => void;
  stop: () => void;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

type InterviewDetails = {
  type?: InterviewType;
  role?: string;
  experience?: string;
  difficulty?: Difficulty;
  company?: string;
  focusAreas?: string;
  useResume?: boolean;
  interactionMode?: "typing" | "video";
};

const DETAILS_KEY = "aisim_interview_details";
const RESUME_KEY = "aisim_resume_text";
const INTERVIEW_ID_KEY = "aisim_interview_id";
const ANON_ID_KEY = "aisim_anon_id";

function getOrCreateAnonId() {
  try {
    const existing = window.localStorage.getItem(ANON_ID_KEY);
    if (existing && existing.trim()) return existing.trim();

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `anon_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(ANON_ID_KEY, id);
    return id;
  } catch {
    return `anon_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function safeParseInterviewDetails(value: string | null): InterviewDetails | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as InterviewDetails;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function getRecognition(): SpeechRecognitionType | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor() as SpeechRecognitionType;
}

function countFillers(text: string) {
  const lower = text.toLowerCase();
  const fillers = ["um", "uh", "like", "you know", "actually"];
  let count = 0;
  for (const f of fillers) {
    const matches = lower.match(
      new RegExp(`\\b${f.replace(/\s+/g, "\\s+")}\\b`, "g"),
    );
    count += matches?.length ?? 0;
  }
  return count;
}

export default function InterviewClient() {
  const [type, setType] = useState<InterviewType>("HR");
  const [role, setRole] = useState("Software Engineer");
  const [experience, setExperience] = useState("0-2 years");
  const [difficultySetting, setDifficultySetting] = useState<Difficulty>("Medium");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [company, setCompany] = useState<string>("");
  const [focusAreas, setFocusAreas] = useState<string>("");
  const [interactionMode, setInteractionMode] = useState<"typing" | "video">("typing");
  const [resumeText, setResumeText] = useState<string>("");
  const [useResume, setUseResume] = useState<boolean>(true);
  const [resumeProfile, setResumeProfile] = useState<ResumeProfile | null>(null);

  const [question, setQuestion] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const turnsRef = useRef<Turn[]>([]);
  const [interviewId, setInterviewId] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "evaluating" | "done">(
    "idle",
  );
  const [message, setMessage] = useState<string>("");
  const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
  const [averageOverall, setAverageOverall] = useState<number | null>(null);

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speakingRef = useRef(false);
  const speakTokenRef = useRef(0);

  const [videoEnabled, setVideoEnabled] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [proctorEnabled, setProctorEnabled] = useState(false);
  const [violations, setViolations] = useState(0);
  const [lastViolation, setLastViolation] = useState<string>("");
  const lastFaceViolationAtRef = useRef<number>(0);
  const faceDetectorRef = useRef<FaceDetectorApi | null>(null);
  const noFaceSinceRef = useRef<number | null>(null);
  const noFaceIssuedRef = useRef(false);
  const autoSubmitTriggeredRef = useRef(false);
  const lastSpokenQuestionRef = useRef<string>("");
  const warnedNoFullscreenRef = useRef(false);
  const pauseWarnedQuestionRef = useRef<string>("");

  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const speakingSinceRef = useRef<number | null>(null);
  const lastConversationViolationAtRef = useRef<number>(0);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const recordViolation = useCallback((reason: string, opts?: { count?: boolean }) => {
    // Once the interview is complete/terminated, don't keep adding warnings.
    if (status === "done") return;
    const count = opts?.count !== false;
    setLastViolation(reason);
    setMessage(`Proctor warning: ${reason}`);
    if (count) setViolations((v) => v + 1);
  }, [status]);

  useEffect(() => {
    if (!proctorEnabled) return;
    if (violations < 2) return;
    if (autoSubmitTriggeredRef.current) return;
    autoSubmitTriggeredRef.current = true;
    void (async () => {
      const snapshot = turnsRef.current;
      if (snapshot.length > 0) {
        await finishInterview(snapshot, {
          endedReason: "proctor_violations",
          proctoring: { violations, lastViolation },
        });
        return;
      }

      // No answers yet; still terminate the session (best-effort DB update).
      setStatus("done");
      setQuestion("");
      setAnswer("");
      setFinalReport(null);
      setAverageOverall(0);
      setMessage("Interview ended due to repeated proctoring violations.");

      try {
        const id = await ensureInterviewSession();
        if (id) {
          const anonId = getOrCreateAnonId();
          await fetch(`/api/interviews/${id}/finish`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(anonId ? { "x-aisim-anon-id": anonId } : {}),
            },
            body: JSON.stringify({
              averageScore: 0,
              finalReport: null,
              endedReason: "proctor_violations",
              proctoring: { violations, lastViolation },
            }),
          });
        }
      } catch {
        // ignore
      } finally {
        try {
          window.localStorage.removeItem(INTERVIEW_ID_KEY);
        } catch {
          // ignore
        }
      }
    })();
    // finishInterview is intentionally not in deps; it is stable enough for this one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proctorEnabled, violations, lastViolation]);

  function pickPreferredVoice(voices: SpeechSynthesisVoice[]) {
    const candidates = voices
      .filter((v) => (v.lang || "").toLowerCase().startsWith("en"))
      .sort((a, b) => {
        const aLocal = a.localService ? 1 : 0;
        const bLocal = b.localService ? 1 : 0;
        if (aLocal !== bLocal) return bLocal - aLocal;

        const aName = (a.name || "").toLowerCase();
        const bName = (b.name || "").toLowerCase();
        const score = (name: string) => {
          // Prefer higher-quality voices when present.
          if (name.includes("google")) return 5;
          if (name.includes("samantha")) return 4;
          if (name.includes("alex")) return 4;
          if (name.includes("microsoft")) return 3;
          if (name.includes("enhanced")) return 3;
          if (name.includes("premium")) return 3;
          return 1;
        };
        return score(bName) - score(aName);
      });

    return candidates[0] ?? voices[0] ?? null;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;
    const load = () => {
      try {
        const voices = synth.getVoices();
        if (voices && voices.length) {
          preferredVoiceRef.current = pickPreferredVoice(voices);
        }
      } catch {
        // ignore
      }
    };

    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => {
      synth.removeEventListener?.("voiceschanged", load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speak = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) {
      setMessage("Text-to-speech not supported in this browser.");
      return;
    }

    const token = ++speakTokenRef.current;
    const synth = window.speechSynthesis;

    try {
      // Avoid capturing the AI voice into dictation.
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setListening(false);

      synth.cancel();
      const utter = new SpeechSynthesisUtterance(trimmed);
      utter.lang = "en-US";
      utter.voice = preferredVoiceRef.current ?? null;

      // Slightly slower, more human cadence.
      utter.rate = 0.98;
      utter.pitch = 1.0;
      utter.volume = 1.0;

      speakingRef.current = true;

      await new Promise<void>((resolve) => {
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        synth.speak(utter);
      });
    } catch {
      setMessage("Could not play audio. You can continue without voice.");
    } finally {
      if (speakTokenRef.current === token) {
        speakingRef.current = false;
      }
    }
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (listening) return;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      setMessage("Could not start voice input.");
    }
  }, [listening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (!listening) return;
    recognitionRef.current.stop();
    setListening(false);
  }, [listening]);

  const fillerCount = useMemo(() => countFillers(answer), [answer]);

  useEffect(() => {
    const details = safeParseInterviewDetails(window.localStorage.getItem(DETAILS_KEY));

    if (details?.type === "HR" || details?.type === "Technical") {
      setType(details.type);
    }

    if (typeof details?.role === "string" && details.role.trim()) {
      setRole(details.role);
    }

    if (typeof details?.experience === "string" && details.experience.trim()) {
      setExperience(details.experience);
    }

    if (details?.difficulty === "Adaptive") {
      setDifficultySetting("Adaptive");
      setDifficulty("Medium");
    } else if (details?.difficulty === "Easy" || details?.difficulty === "Medium" || details?.difficulty === "Hard") {
      setDifficultySetting(details.difficulty);
      setDifficulty(details.difficulty);
    }

    if (typeof details?.company === "string") setCompany(details.company);
    if (typeof details?.focusAreas === "string") setFocusAreas(details.focusAreas);

    setInteractionMode(details?.interactionMode === "video" ? "video" : "typing");

    if (details?.useResume === false) {
      setUseResume(false);
      setResumeText("");
      window.localStorage.removeItem(RESUME_KEY);
      return;
    }

    const stored = window.localStorage.getItem(RESUME_KEY);
    if (stored && stored.trim()) {
      setResumeText(stored);
      setUseResume(true);
    } else {
      setUseResume(false);
    }
  }, []);

  useEffect(() => {
    const existing = window.localStorage.getItem(INTERVIEW_ID_KEY);
    if (existing && existing.trim()) setInterviewId(existing.trim());
  }, []);

  async function ensureInterviewSession(): Promise<string | null> {
    if (interviewId) return interviewId;

    try {
      const anonId = getOrCreateAnonId();
      const res = await fetch("/api/interviews/session", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(anonId ? { "x-aisim-anon-id": anonId } : {}),
        },
        body: JSON.stringify({
          role,
          experience,
          type,
          difficulty: difficultySetting,
          company,
          focusAreas,
          interactionMode,
          useResume,
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { ok: true; id: string }
        | { ok: false; error: string }
        | null;

      if (res.status === 401) {
        // Not signed in; keep local storage only.
        return null;
      }

      if (!res.ok || !payload || payload.ok === false || !("id" in payload)) {
        return null;
      }

      setInterviewId(payload.id);
      window.localStorage.setItem(INTERVIEW_ID_KEY, payload.id);
      return payload.id;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (interactionMode !== "video") return;
    setVoiceEnabled(true);
    setVideoEnabled(true);
    setProctorEnabled(true);
  }, [interactionMode]);

  useEffect(() => {
    if (interactionMode !== "typing") return;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    stopListening();
  }, [interactionMode, stopListening]);

  useEffect(() => {
    if (!proctorEnabled) return;
    if (!videoEnabled) setVideoEnabled(true);
  }, [proctorEnabled, videoEnabled]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!useResume) {
        setResumeProfile(null);
        return;
      }
      const text = resumeText.trim();
      if (!text) {
        setResumeProfile(null);
        return;
      }

      try {
        const res = await fetch("/api/resume/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText: text, role, experience }),
        });

        const payload = (await res.json().catch(() => null)) as
          | { ok: true; profile: ResumeProfile }
          | { ok: false; error: string }
          | null;

        if (cancelled) return;

        if (!res.ok || !payload || payload.ok === false) {
          setResumeProfile(null);
          return;
        }

        setResumeProfile(payload.profile);
      } catch {
        if (!cancelled) setResumeProfile(null);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [useResume, resumeText, role, experience]);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!videoEnabled) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setMessage("Camera permission denied or unavailable.");
        setVideoEnabled(false);
      }
    }

    async function stopCamera() {
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    if (videoEnabled) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [videoEnabled]);

  useEffect(() => {
    if (!proctorEnabled) return;

    function onVisibility() {
      if (document.hidden) recordViolation("Tab/window changed");
    }

    function onBlur() {
      recordViolation("Window lost focus");
    }

    function onCopy() {
      recordViolation("Copy detected");
    }

    function onPaste() {
      recordViolation("Paste detected");
    }

    function onCut() {
      recordViolation("Cut detected");
    }

    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
      recordViolation("Right click blocked");
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("copy", onCopy);
    window.addEventListener("paste", onPaste);
    window.addEventListener("cut", onCut);
    window.addEventListener("contextmenu", onContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("cut", onCut);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [proctorEnabled, recordViolation]);

  useEffect(() => {
    if (!proctorEnabled || !videoEnabled) return;
    if (!videoRef.current) return;

    let cancelled = false;

    async function init() {
      setLastViolation("Loading face detection…");
      const detector = await createFaceDetector();
      if (cancelled) {
        detector?.dispose?.();
        return;
      }
      faceDetectorRef.current = detector;
      if (!detector) {
        setLastViolation("Face detection unavailable; proctoring limited");
      } else {
        setLastViolation("");
      }
    }

    void init();

    async function tick() {
      if (cancelled) return;
      const v = videoRef.current;
      if (!v) return;
      if (v.readyState < 2) return;

      const detector = faceDetectorRef.current;
      if (!detector) return;

      try {
        const boxes = await detector.detect(v);
        if (cancelled) return;

        const now = Date.now();
        const last = lastFaceViolationAtRef.current;
        const canRecord = now - last > 4000;

        if (boxes.length === 0) {
          if (noFaceSinceRef.current === null) noFaceSinceRef.current = now;
          if (!noFaceIssuedRef.current && now - noFaceSinceRef.current > 5000 && canRecord) {
            noFaceIssuedRef.current = true;
            lastFaceViolationAtRef.current = now;
            recordViolation("No face detected (5s+)");
          }
          return;
        }

        noFaceSinceRef.current = null;
        noFaceIssuedRef.current = false;

        if (boxes.length > 1) {
          if (canRecord) {
            lastFaceViolationAtRef.current = now;
            recordViolation("Multiple faces detected");
          }
          return;
        }

        const bb = boxes[0];
        const vw = v.videoWidth || 0;
        const vh = v.videoHeight || 0;
        if (!bb || vw === 0 || vh === 0) return;

        const cx = (bb.x + bb.width / 2) / vw;
        const cy = (bb.y + bb.height / 2) / vh;
        const offCenter = Math.abs(cx - 0.5) > 0.28 || Math.abs(cy - 0.5) > 0.28;
        if (offCenter && canRecord) {
          lastFaceViolationAtRef.current = now;
          recordViolation("Face off-center (possible looking away)");
        }
      } catch {
        // Ignore detector errors; do not crash the interview UI.
      }
    }

    const id = window.setInterval(() => {
      void tick();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      faceDetectorRef.current?.dispose?.();
      faceDetectorRef.current = null;
    };
  }, [proctorEnabled, videoEnabled, recordViolation]);

  useEffect(() => {
    if (!proctorEnabled) return;
    if (interactionMode !== "video") return;

    let cancelled = false;
    let intervalId: number | null = null;

    async function stopAudio() {
      if (intervalId) window.clearInterval(intervalId);
      intervalId = null;

      const stream = audioStreamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;

      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      audioAnalyserRef.current = null;
      speakingSinceRef.current = null;

      try {
        await ctx?.close();
      } catch {
        // ignore
      }
    }

    async function startAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        audioStreamRef.current = stream;
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        audioAnalyserRef.current = analyser;

        const data = new Uint8Array(analyser.fftSize);

        intervalId = window.setInterval(() => {
          if (cancelled) return;
          const a = audioAnalyserRef.current;
          if (!a) return;

          // If the user is actively dictating, don't flag conversation.
          if (listening) {
            speakingSinceRef.current = null;
            return;
          }

          a.getByteTimeDomainData(data);
          let sumSquares = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sumSquares += v * v;
          }
          const rms = Math.sqrt(sumSquares / data.length);

          const now = Date.now();
          const threshold = 0.04; // conservative; avoids most background noise
          if (rms > threshold) {
            if (speakingSinceRef.current === null) speakingSinceRef.current = now;
            const spokenFor = now - (speakingSinceRef.current ?? now);
            const canRecord = now - lastConversationViolationAtRef.current > 8000;

            if (spokenFor > 2500 && canRecord) {
              lastConversationViolationAtRef.current = now;
              speakingSinceRef.current = null;
              recordViolation("Conversation detected", { count: true });
            }
          } else {
            speakingSinceRef.current = null;
          }
        }, 500);
      } catch {
        setLastViolation("Microphone permission denied; conversation detection disabled");
      }
    }

    void startAudio();
    return () => {
      cancelled = true;
      void stopAudio();
    };
  }, [proctorEnabled, interactionMode, listening, recordViolation]);

  async function ensureFullscreen() {
    if (document.fullscreenElement) return true;
    try {
      await document.documentElement.requestFullscreen();
      return true;
    } catch {
      setMessage("Proctor mode requires fullscreen permission.");
      return false;
    }
  }

  function proctorGateOk() {
    if (!proctorEnabled) return true;
    if (document.fullscreenElement) return true;
    if (!warnedNoFullscreenRef.current) {
      warnedNoFullscreenRef.current = true;
      setMessage("Proctor mode is ON. For best results, consider fullscreen.");
    }
    return true;
  }

  useEffect(() => {
    if (interactionMode !== "video") return;
    if (!proctorEnabled) return;
    if (!question.trim()) return;
    if (status !== "idle") return;
    if (answer.trim()) return;
    if (pauseWarnedQuestionRef.current === question) return;

    const id = window.setTimeout(() => {
      if (pauseWarnedQuestionRef.current === question) return;
      pauseWarnedQuestionRef.current = question;
      recordViolation("Long pause detected. Please continue when ready.", { count: false });
    }, 75000);

    return () => window.clearTimeout(id);
  }, [interactionMode, proctorEnabled, question, status, answer, recordViolation]);

  useEffect(() => {
    if (!voiceEnabled) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListening(false);
      return;
    }

    const recognition = getRecognition();
    recognitionRef.current = recognition;

    if (!recognition) {
      setMessage("Voice input not supported in this browser.");
      setVoiceEnabled(false);
      return;
    }

    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = event as any;
      const last = e.results?.[e.results.length - 1];
      const text = last?.[0]?.transcript;
      if (typeof text === "string") {
        setAnswer((prev) => (prev ? `${prev} ${text}` : text).trim());
      }
    };

    recognition.onerror = () => {
      setMessage("Voice input error. You can continue typing.");
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };
  }, [voiceEnabled]);

  useEffect(() => {
    if (interactionMode !== "video") return;
    if (!question.trim()) return;

    if (lastSpokenQuestionRef.current === question) return;
    lastSpokenQuestionRef.current = question;

    let cancelled = false;

    void (async () => {
      await speak(question);
      if (cancelled) return;

      // Best-effort: start listening after the interviewer finishes speaking.
      // (Browser may require user gesture; user can always press Start listening.)
      startListening();
    })();

    return () => {
      cancelled = true;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
    };
  }, [interactionMode, question, speak, startListening]);

  async function getNextQuestion() {
    if (!proctorGateOk()) return;

    setStatus("loading");
    setMessage(interactionMode === "video" ? "Interviewer is preparing the next question…" : "Generating a question…");

    // Create DB session as early as possible (non-blocking).
    void ensureInterviewSession();

    const response = await fetch("/api/ai/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        difficulty,
        role,
        experience,
        company,
        focusAreas,
        resumeText: useResume ? resumeText : "",
        resumeProfile: useResume ? resumeProfile : null,
      }),
    });

    const payload = (await response.json()) as
      | { ok: true; question: string }
      | { ok: false; error: string };

    if (!response.ok || payload.ok === false) {
      setStatus("idle");
      setMessage("Could not generate question. Please try again.");
      return;
    }

    setQuestion(payload.question);
    setAnswer("");
    setStatus("idle");
    setMessage("");
  }

  async function submitAnswer() {
    if (!proctorGateOk()) return;

    const trimmed = answer.trim();
    if (!question || !trimmed) {
      setMessage("Please answer the question first.");
      return;
    }

    setStatus("evaluating");
    setMessage("Evaluating your answer…");

    const evalRes = await fetch("/api/ai/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        answer: trimmed,
        type,
        role,
        experience,
        company,
        focusAreas,
        resumeText: useResume ? resumeText : "",
        resumeProfile: useResume ? resumeProfile : null,
      }),
    });

    const evalPayload = (await evalRes.json()) as
      | { ok: true; evaluation: Evaluation }
      | { ok: false; error: string };

    if (!evalRes.ok || evalPayload.ok === false) {
      setStatus("idle");
      setMessage("Could not evaluate answer. Please try again.");
      return;
    }

    let star:
      | {
          star_used: boolean;
          emotional_intelligence_score: number;
          structure_score: number;
          improvement_feedback: string;
        }
      | undefined;

    if (type === "HR") {
      const starRes = await fetch("/api/ai/star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer: trimmed }),
      });

      const starPayload = (await starRes.json()) as
        | { ok: true; star: Turn["star"] }
        | { ok: false; error: string };

      if (starRes.ok && starPayload.ok !== false) {
        star = starPayload.star;
      }
    }

    const evaluation = evalPayload.evaluation;
    const newTurn = { question, answer: trimmed, evaluation, star };

    // Store to DB immediately after the user submits the answer.
    try {
      const id = await ensureInterviewSession();
      if (id) {
        const anonId = getOrCreateAnonId();
        await fetch(`/api/interviews/${id}/turn`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(anonId ? { "x-aisim-anon-id": anonId } : {}),
          },
          body: JSON.stringify({
            question,
            answer: trimmed,
            evaluation,
            star: star ?? null,
          }),
        });
      }
    } catch {
      // ignore DB errors; local storage still keeps the transcript
    }

    setTurns((prev) => [...prev, newTurn]);
    if (difficultySetting === "Adaptive") {
      setDifficulty((prev) => adjustDifficulty(prev, evaluation.overall_score));
    }

    const nextCount = turns.length + 1;
    if (nextCount >= 5) {
      const allTurns = [...turns, newTurn];
      void finishInterview(allTurns);
      return;
    }

    setQuestion("");
    setAnswer("");
    setStatus("idle");

    if (interactionMode === "typing") {
      setMessage("Answer evaluated. Generating the next question…");
      await getNextQuestion();
      return;
    }

    setMessage("Thanks. Next question…");
    await getNextQuestion();
  }

  async function finishInterview(
    forceTurns?: Turn[],
    opts?: { endedReason?: string; proctoring?: { violations: number; lastViolation: string } },
  ) {
    const snapshot = forceTurns ?? turns;
    if (snapshot.length === 0) {
      if (opts?.endedReason === "proctor_violations") {
        setStatus("done");
        setQuestion("");
        setAnswer("");
        setFinalReport(null);
        setAverageOverall(0);
        setMessage("Interview ended due to repeated proctoring violations.");
      } else {
        setMessage("Answer at least one question before finishing.");
      }
      return;
    }

    setStatus("evaluating");
    setMessage("Finishing interview and generating your report card…");

    const overallAvg = round1(mean(snapshot.map((t) => t.evaluation.overall_score)));
    setAverageOverall(overallAvg);

    // Persist transcript for the feedback page.
    window.localStorage.setItem("aisim_turns", JSON.stringify(snapshot));

    let report: FinalReport | null = null;
    try {
      const reportRes = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turns: snapshot.map((t) => ({
            question: t.question,
            answer: t.answer,
            evaluation: t.evaluation,
          })),
          type,
          role,
          experience,
          company,
          focusAreas,
        }),
      });

      const reportPayload = (await reportRes.json().catch(() => null)) as
        | { ok: true; report: FinalReport }
        | { ok: false; error: string }
        | null;

      if (reportRes.ok && reportPayload && reportPayload.ok !== false) {
        report = reportPayload.report;
      }
    } catch {
      report = null;
    }

    setFinalReport(report);

    // Mark the interview completed in MongoDB (best-effort).
    try {
      const id = await ensureInterviewSession();
      if (id) {
        const anonId = getOrCreateAnonId();
        await fetch(`/api/interviews/${id}/finish`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(anonId ? { "x-aisim-anon-id": anonId } : {}),
          },
          body: JSON.stringify({
            averageScore: overallAvg,
            finalReport: report ?? null,
            endedReason: opts?.endedReason ?? null,
            proctoring: opts?.proctoring ?? null,
          }),
        });
      }
    } catch {
      // ignore
    }

    setQuestion("");
    setAnswer("");
    setStatus("done");
    setMessage(
      opts?.endedReason === "proctor_violations"
        ? "Interview ended due to repeated proctoring violations. See your report card below."
        : "Interview complete. See your report card below.",
    );

    try {
      window.localStorage.removeItem(INTERVIEW_ID_KEY);
    } catch {
      // ignore
    }
  }

  async function toggleListening() {
    if (!recognitionRef.current) return;

    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch {
        setMessage("Could not start voice input.");
      }
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <a href="/" className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
            <span className="text-sm font-semibold">AI</span>
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">Interview Simulator</div>
            <div className="text-xs text-foreground/70">Interview session</div>
          </div>
        </a>

        {interactionMode === "typing" || status === "done" ? (
          <a
            href="/feedback"
            className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
          >
            View feedback
          </a>
        ) : (
          <a
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
          >
            Dashboard
          </a>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-14">
        {interactionMode === "video" ? (
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-foreground/10 bg-background p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Candidate</h1>
                  <div className="mt-1 text-sm text-foreground/70">Your camera and response</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setVideoEnabled((v) => !v)}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
                  >
                    {videoEnabled ? "Camera: On" : "Camera: Off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoiceEnabled((v) => !v)}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
                  >
                    {voiceEnabled ? "Voice: On" : "Voice: Off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !proctorEnabled;
                      setProctorEnabled(next);
                      if (next) {
                        setViolations(0);
                        setLastViolation("");
                        warnedNoFullscreenRef.current = false;
                        autoSubmitTriggeredRef.current = false;
                        noFaceSinceRef.current = null;
                        noFaceIssuedRef.current = false;
                        speakingSinceRef.current = null;
                        lastConversationViolationAtRef.current = 0;
                      }
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
                  >
                    {proctorEnabled ? "Proctor: On" : "Proctor: Off"}
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-foreground/10 bg-background">
                <div className="flex items-center justify-between gap-3 border-b border-foreground/10 px-4 py-2 text-xs text-foreground/70">
                  <div>Your camera</div>
                  {proctorEnabled ? (
                    <button
                      type="button"
                      onClick={ensureFullscreen}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-foreground/15 px-3 text-xs font-medium transition-opacity hover:opacity-90"
                    >
                      Fullscreen
                    </button>
                  ) : null}
                </div>
                <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full bg-black" />
              </div>

              <div className="mt-5 grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-medium">Your response</div>
                  {voiceEnabled ? (
                    <button
                      type="button"
                      onClick={toggleListening}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
                    >
                      {listening ? "Stop listening" : "Start listening"}
                    </button>
                  ) : null}
                </div>

                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={7}
                  disabled={status === "loading" || status === "evaluating" || status === "done"}
                  className="w-full resize-none rounded-2xl border border-foreground/15 bg-background px-4 py-3 text-sm outline-none focus:border-foreground/30 disabled:opacity-60"
                  placeholder="Respond naturally as you would in a live interview…"
                />

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={submitAnswer}
                    disabled={status === "loading" || status === "evaluating" || status === "done"}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
                  >
                    {status === "evaluating" ? "Submitting…" : status === "done" ? "Interview complete" : "Submit response"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void finishInterview()}
                    disabled={status === "loading" || status === "evaluating" || status === "done" || turns.length === 0}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-foreground/15 px-5 text-sm font-medium transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
                  >
                    End interview
                  </button>
                </div>

                {proctorEnabled ? (
                  <div className="text-sm text-foreground/70">
                    Proctoring: {violations} warning(s){lastViolation ? ` (last: ${lastViolation})` : ""}
                  </div>
                ) : null}

                <div className="text-sm text-foreground/70" aria-live="polite">
                  {message || "Answer when ready. One question at a time."}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-foreground/10 bg-background p-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold tracking-tight">AI interviewer</h2>
                <div className="text-sm text-foreground/70">
                  {role} · {type} · {difficultySetting === "Adaptive" ? `Adaptive (${difficulty})` : difficulty}
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-foreground/10 bg-background">
                <div className="border-b border-foreground/10 px-4 py-2 text-xs text-foreground/70">Interviewer</div>
                <div className="flex aspect-video items-center justify-center gap-3 bg-foreground/[0.03] p-6">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-foreground text-background">
                    <span className="text-sm font-semibold">AI</span>
                  </div>
                  <div className="text-sm text-foreground/80">
                    {status === "loading"
                      ? "Preparing the next question…"
                      : status === "evaluating"
                        ? "Listening and taking notes…"
                        : question
                          ? "Please answer when you’re ready."
                          : "Click Start to begin."}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 text-sm text-foreground/80">
                {question || "This interview will run one question at a time."}
              </div>

              {!question && status !== "done" ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={getNextQuestion}
                    disabled={status === "loading" || status === "evaluating"}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
                  >
                    Start interview
                  </button>
                </div>
              ) : null}

              {status === "done" ? (
                <>
                  <div className="mt-4 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 text-sm text-foreground/80">
                    <div className="text-sm font-medium">Final evaluation</div>
                    <div className="mt-2">
                      <span className="font-medium">Average overall:</span> {averageOverall ?? "—"}/10
                    </div>

                    {finalReport ? (
                      <div className="mt-3 grid gap-3">
                        <div>
                          <span className="font-medium">Overall:</span> {finalReport.overall_score}/10
                          {" · "}
                          <span className="font-medium">Technical:</span> {finalReport.technical_score}/10
                          {" · "}
                          <span className="font-medium">Communication:</span> {finalReport.communication_score}/10
                          {" · "}
                          <span className="font-medium">Problem-solving:</span> {finalReport.problem_solving_score}/10
                        </div>
                        <div>
                          <span className="font-medium">Strengths:</span> {finalReport.strengths.join(" ")}
                        </div>
                        <div>
                          <span className="font-medium">Weaknesses:</span> {finalReport.weaknesses.join(" ")}
                        </div>
                        <div>
                          <span className="font-medium">Improvements:</span> {finalReport.improvement_suggestions.join(" ")}
                        </div>
                        {finalReport.recommended_focus_areas.length > 0 ? (
                          <div>
                            <span className="font-medium">Recommended focus areas:</span> {finalReport.recommended_focus_areas.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-foreground/70">Could not generate an AI report. Average score is still shown.</div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <a
                      href="/feedback"
                      className="inline-flex h-11 items-center justify-center rounded-full border border-foreground/15 px-5 text-sm font-medium transition-opacity hover:opacity-90"
                    >
                      View feedback
                    </a>
                    {interviewId ? (
                      <a
                        href={`/dashboard/interviews/${interviewId}`}
                        className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90"
                      >
                        View full report
                      </a>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-foreground/10 bg-background p-6">
              <h1 className="text-xl font-semibold tracking-tight">Setup</h1>

              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Practice mode</div>
                      <div className="text-sm text-foreground/70">Typing practice</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInteractionMode("video")}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
                    >
                      Switch to video
                    </button>
                  </div>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Interview type</span>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as InterviewType)}
                    className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm outline-none focus:border-foreground/30"
                  >
                    <option value="HR">HR</option>
                    <option value="Technical">Technical</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Role</span>
                  <input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm outline-none focus:border-foreground/30"
                    placeholder="Software Engineer"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Experience</span>
                  <input
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm outline-none focus:border-foreground/30"
                    placeholder="0-2 years"
                  />
                </label>

                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Resume-based questions</div>
                      <div className="text-sm text-foreground/70">
                        {resumeText ? "Resume loaded" : "No resume found (upload on home page)"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUseResume((v) => !v)}
                      disabled={!resumeText}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
                    >
                      {useResume ? "On" : "Off"}
                    </button>
                  </div>
                  {useResume && resumeText ? (
                    <div className="mt-3 text-sm text-foreground/70">
                      {resumeProfile
                        ? `Using skills: ${(resumeProfile.hard_skills || []).slice(0, 6).join(", ") || "(none detected)"}`
                        : "Reading your resume to extract skills…"}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Difficulty</span>
                    <span className="text-sm text-foreground/70">
                      {difficultySetting === "Adaptive" ? `Adaptive (${difficulty})` : difficulty}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-sm text-foreground/70">
                    {difficultySetting === "Adaptive" ? "Adaptive based on your answers." : "Fixed difficulty."}
                  </div>
                </div>

                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Voice input</div>
                      <div className="text-sm text-foreground/70">Optional dictation (browser support required)</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVoiceEnabled((v) => !v)}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
                    >
                      {voiceEnabled ? "Disable" : "Enable"}
                    </button>
                  </div>

                  {voiceEnabled ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={toggleListening}
                        className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
                      >
                        {listening ? "Stop listening" : "Start listening"}
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={getNextQuestion}
                    disabled={status === "loading" || status === "evaluating" || status === "done"}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
                  >
                    {question ? "New question" : "Generate question"}
                  </button>
                  <a
                    href="/dashboard"
                    className="inline-flex h-11 items-center justify-center rounded-full border border-foreground/15 px-5 text-sm font-medium transition-opacity hover:opacity-90"
                  >
                    Dashboard
                  </a>
                </div>

                <div className="text-sm text-foreground/70" aria-live="polite">
                  {message}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-foreground/10 bg-background p-6">
              <h2 className="text-xl font-semibold tracking-tight">Question</h2>
              <div className="mt-4">
                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 text-sm text-foreground/80">
                  {question || "Generate a question to begin."}
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Your answer</div>
                  <div className="text-xs text-foreground/60">Fillers: {fillerCount}</div>
                </div>

                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={7}
                  className="w-full resize-none rounded-2xl border border-foreground/15 bg-background px-4 py-3 text-sm outline-none focus:border-foreground/30"
                  placeholder="Type your answer here…"
                />

                <button
                  type="button"
                  onClick={submitAnswer}
                  disabled={status === "loading" || status === "evaluating" || status === "done"}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
                >
                  {status === "evaluating" ? "Evaluating…" : status === "done" ? "Interview complete" : "Submit answer"}
                </button>

                <button
                  type="button"
                  onClick={() => void finishInterview()}
                  disabled={status === "loading" || status === "evaluating" || status === "done" || turns.length === 0}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-foreground/15 px-5 text-sm font-medium transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
                >
                  Finish interview
                </button>

                {interactionMode === "typing" && turns.length > 0 ? (
                  <div className="mt-2 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 text-sm text-foreground/80">
                    <div className="text-sm font-medium">Feedback (last answer)</div>
                    <div className="mt-2 grid gap-2">
                      <div>
                        <span className="font-medium">Overall:</span> {turns[turns.length - 1].evaluation.overall_score}/10
                        {" · "}
                        <span className="font-medium">Technical:</span> {turns[turns.length - 1].evaluation.technical_score}/10
                        {" · "}
                        <span className="font-medium">Clarity:</span> {turns[turns.length - 1].evaluation.clarity_score}/10
                        {" · "}
                        <span className="font-medium">Confidence:</span> {turns[turns.length - 1].evaluation.confidence_score}/10
                        {" · "}
                        <span className="font-medium">Depth:</span> {turns[turns.length - 1].evaluation.depth_score}/10
                      </div>

                      <div>
                        <span className="font-medium">Strengths:</span> {turns[turns.length - 1].evaluation.strengths}
                      </div>
                      <div>
                        <span className="font-medium">Weaknesses:</span> {turns[turns.length - 1].evaluation.weaknesses}
                      </div>
                      <div>
                        <span className="font-medium">Improve:</span> {turns[turns.length - 1].evaluation.improvement}
                      </div>
                      <div>
                        <span className="font-medium">Follow-up:</span> {turns[turns.length - 1].evaluation.follow_up_question}
                      </div>
                    </div>
                  </div>
                ) : null}

                {status === "done" ? (
                  <>
                    <div className="mt-2 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 text-sm text-foreground/80">
                      <div className="text-sm font-medium">Report card</div>
                      <div className="mt-2">
                        <span className="font-medium">Average overall:</span>{" "}
                        {averageOverall ?? "—"}/10
                      </div>

                      {finalReport ? (
                        <div className="mt-3 grid gap-3">
                          <div>
                            <span className="font-medium">Overall:</span> {finalReport.overall_score}/10
                            {" · "}
                            <span className="font-medium">Technical:</span> {finalReport.technical_score}/10
                            {" · "}
                            <span className="font-medium">Communication:</span> {finalReport.communication_score}/10
                            {" · "}
                            <span className="font-medium">Problem-solving:</span> {finalReport.problem_solving_score}/10
                          </div>
                          <div>
                            <span className="font-medium">Strengths:</span> {finalReport.strengths.join(" ")}
                          </div>
                          <div>
                            <span className="font-medium">Weaknesses:</span> {finalReport.weaknesses.join(" ")}
                          </div>
                          <div>
                            <span className="font-medium">Improvements:</span> {finalReport.improvement_suggestions.join(" ")}
                          </div>
                          {finalReport.recommended_focus_areas.length > 0 ? (
                            <div>
                              <span className="font-medium">Focus areas:</span> {finalReport.recommended_focus_areas.join(", ")}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-foreground/70">Could not generate an AI report. Average score is still shown.</div>
                      )}
                    </div>

                    <a
                      href="/feedback"
                      className="inline-flex h-11 items-center justify-center rounded-full border border-foreground/15 px-5 text-sm font-medium transition-opacity hover:opacity-90"
                    >
                      Go to feedback
                    </a>

                    {interviewId ? (
                      <a
                        href={`/dashboard/interviews/${interviewId}`}
                        className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90"
                      >
                        View full report
                      </a>
                    ) : null}
                  </>
                ) : null}

                <div className="text-sm text-foreground/70">
                  Resume detected: {resumeText ? "Yes" : "No"}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
