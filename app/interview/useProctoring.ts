"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { PROCTORING_THRESHOLDS as T, type ProctoringEventType } from "@/lib/proctoring";
import type { FaceDetectorApi } from "./faceDetector";
import type { DeviceState } from "./useMediaDevices";

/** A candidate-facing notice with a recovery step; never an accusation. */
export type ProctorNotice = { id: string; tone: "warning" | "info"; message: string; action?: { label: string; kind: "fullscreen" | "reconnect_camera" | "reconnect_mic" } };

type QueuedEvent = { sessionId: string; id: string; seq: number; type: ProctoringEventType; at: string; durationMs?: number; resolved: boolean; warned: boolean; meta?: Record<string, string | number> };
type RecordOpts = { durationMs?: number; resolved?: boolean; warned?: boolean; meta?: Record<string, string | number>; at?: number; force?: boolean };

const storageKey = (interviewId: string) => `aisim_proctor_events_${interviewId}`;
const BATCH = 25;
const FLUSH_DELAY_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
const TAB_NOTICE_MS = 10_000;

function loadQueue(interviewId: string): QueuedEvent[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(storageKey(interviewId)) || "[]");
    return Array.isArray(v) ? v.slice(-500) : [];
  } catch {
    return [];
  }
}

function saveQueue(interviewId: string, q: QueuedEvent[]) {
  try {
    if (q.length) window.localStorage.setItem(storageKey(interviewId), JSON.stringify(q.slice(-500)));
    else window.localStorage.removeItem(storageKey(interviewId));
  } catch {
    // storage full or blocked: events stay in memory only
  }
}

type Params = {
  /** Proctoring runs only while the call is live (after start, before finish). */
  active: boolean;
  camera: DeviceState;
  mic: DeviceState;
  videoRef: RefObject<HTMLVideoElement | null>;
  faceDetector: RefObject<FaceDetectorApi | null>;
  detectorReady: boolean;
  /** The candidate's answer window with a live, unmuted microphone (for the silence check). */
  answering: boolean;
  /** The session's microphone track source, for on-device level analysis. */
  getStream: () => MediaStream | null;
  streamVersion: number;
};

/**
 * Browser-side proctoring. Observes only what a browser can reliably see:
 * tab visibility, window focus, fullscreen, camera/microphone health,
 * sustained face presence (on-device detector) and sustained silence. It
 * never records or uploads video or audio; events are small metadata records
 * sent in batches to the server, which validates them and decides severity.
 *
 * Delivery: events are queued in memory and localStorage, sent every few
 * seconds and retried with backoff; after a reload, events left in storage
 * are sent with their original session id (each has a stable id, so the
 * server never stores one twice).
 */
export function useProctoring(p: Params) {
  const [notices, setNotices] = useState<ProctorNotice[]>([]);
  const [fullscreen, setFullscreen] = useState({ supported: false, active: false });
  const interviewIdRef = useRef("");
  const sessionRef = useRef<{ id: string; seq: number } | null>(null);
  const queueRef = useRef<QueuedEvent[]>([]);
  const lastAtRef = useRef<Partial<Record<ProctoringEventType, number>>>({});
  const flushTimer = useRef<number | null>(null);
  const backoffRef = useRef(0);
  const sendingRef = useRef<Promise<void> | null>(null);
  const activeRef = useRef(p.active);
  activeRef.current = p.active;

  const show = useCallback((n: ProctorNotice) => setNotices((list) => [...list.filter((x) => x.id !== n.id), n]), []);
  const clear = useCallback((id: string) => setNotices((list) => list.filter((x) => x.id !== id)), []);

  // ---------- Delivery ----------
  const send = useCallback(async (keepalive = false): Promise<void> => {
    const interviewId = interviewIdRef.current;
    if (!interviewId || queueRef.current.length === 0) return;
    const pending = [...queueRef.current];
    const bySession = new Map<string, QueuedEvent[]>();
    for (const e of pending) bySession.set(e.sessionId, [...(bySession.get(e.sessionId) ?? []), e]);
    let failed = false;
    for (const [sessionId, list] of bySession) {
      for (let i = 0; i < list.length; i += BATCH) {
        const chunk = list.slice(i, i + BATCH);
        const res = await fetch(`/api/interviews/${encodeURIComponent(interviewId)}/proctoring/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive,
          body: JSON.stringify({ sessionId, events: chunk.map(({ sessionId: _s, ...e }) => e) }), // eslint-disable-line @typescript-eslint/no-unused-vars
        }).catch(() => null);
        // Network errors, 5xx and 429 are retried later; other 4xx (invalid, closed interview) can't succeed.
        if (!res || res.status >= 500 || res.status === 429) {
          failed = true;
          break;
        }
        const sent = new Set(chunk.map((e) => e.id));
        queueRef.current = queueRef.current.filter((e) => !sent.has(e.id));
        saveQueue(interviewId, queueRef.current);
      }
    }
    if (failed) {
      backoffRef.current = Math.min(MAX_BACKOFF_MS, backoffRef.current ? backoffRef.current * 2 : 5_000);
      if (flushTimer.current) window.clearTimeout(flushTimer.current);
      flushTimer.current = window.setTimeout(() => void flush(), backoffRef.current);
    } else {
      backoffRef.current = 0;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async () => {
    if (flushTimer.current) window.clearTimeout(flushTimer.current);
    flushTimer.current = null;
    // One delivery at a time, so a retry can't race a send in progress.
    while (sendingRef.current) await sendingRef.current;
    sendingRef.current = send().finally(() => (sendingRef.current = null));
    await sendingRef.current;
  }, [send]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current || backoffRef.current) return;
    flushTimer.current = window.setTimeout(() => void flush(), FLUSH_DELAY_MS);
  }, [flush]);

  /** Queues one observation (with a cooldown per type so one condition can't flood the log). */
  const record = useCallback(
    (type: ProctoringEventType, opts: RecordOpts = {}) => {
      const s = sessionRef.current;
      if (!s || !interviewIdRef.current) return;
      const now = opts.at ?? Date.now();
      const last = lastAtRef.current[type] ?? 0;
      if (!opts.force && now - last < T.cooldownMs) return;
      lastAtRef.current[type] = now;
      s.seq += 1;
      queueRef.current.push({
        sessionId: s.id,
        id: crypto.randomUUID().replace(/-/g, ""),
        seq: s.seq,
        type,
        at: new Date(now).toISOString(),
        ...(opts.durationMs !== undefined ? { durationMs: Math.round(opts.durationMs) } : {}),
        resolved: opts.resolved ?? true,
        warned: opts.warned ?? false,
        ...(opts.meta ? { meta: opts.meta } : {}),
      });
      saveQueue(interviewIdRef.current, queueRef.current);
      scheduleFlush();
    },
    [scheduleFlush],
  );

  /** Starts the server session for this interview and sends anything left over from a previous page load. */
  const begin = useCallback(
    async (interviewId: string) => {
      interviewIdRef.current = interviewId;
      queueRef.current = loadQueue(interviewId);
      const res = await fetch(`/api/interviews/${encodeURIComponent(interviewId)}/proctoring/session`, { method: "POST" }).catch(() => null);
      const data = res ? ((await res.json().catch(() => null)) as { ok?: boolean; sessionId?: string } | null) : null;
      if (res?.ok && data?.sessionId) sessionRef.current = { id: data.sessionId, seq: 0 };
      if (queueRef.current.length) await flush();
      return Boolean(sessionRef.current);
    },
    [flush],
  );

  // ---------- Open conditions (closed with a duration) ----------
  const open = useRef<{ hiddenAt?: number; blurAt?: number; cameraLostAt?: number; cameraReason?: string; micLostAt?: number; micReason?: string; noFaceSince?: number; noFaceOpen?: boolean; faceOk?: number; multiSince?: number; multiChecks?: number; multiOpen?: boolean; maxFaces?: number; multiOk?: number }>({});

  /** Closes open conditions (as unresolved) and sends everything; call before finishing the interview. */
  const end = useCallback(async () => {
    const o = open.current;
    const now = Date.now();
    if (o.cameraLostAt) record("camera_lost", { durationMs: now - o.cameraLostAt, resolved: false, warned: true, meta: { reason: o.cameraReason ?? "track_ended" }, force: true });
    if (o.micLostAt) record("mic_lost", { durationMs: now - o.micLostAt, resolved: false, warned: true, meta: { reason: o.micReason ?? "track_ended" }, force: true });
    if (o.noFaceOpen && o.noFaceSince) record("face_not_detected", { durationMs: now - o.noFaceSince, resolved: false, warned: true, force: true });
    if (o.multiOpen && o.multiSince) record("multiple_faces", { durationMs: now - o.multiSince, resolved: false, warned: true, meta: { faces: o.maxFaces ?? 2 }, force: true });
    open.current = {};
    await flush();
    sessionRef.current = null;
  }, [flush, record]);

  // ---------- Tab visibility and window focus ----------
  useEffect(() => {
    if (!p.active) return;
    const o = open.current;
    const onVisibility = () => {
      const now = Date.now();
      if (document.hidden) {
        o.hiddenAt = now;
        o.blurAt = undefined;
      } else if (o.hiddenAt) {
        const durationMs = now - o.hiddenAt;
        o.hiddenAt = undefined;
        record("tab_hidden", { durationMs, warned: true, force: true });
        show({ id: "tab", tone: "warning", message: `Your interview tab was not active for ${Math.max(1, Math.round(durationMs / 1000))} seconds. Please keep this tab open until the interview ends.` });
        window.setTimeout(() => clear("tab"), TAB_NOTICE_MS);
      }
    };
    // Blur is a weak signal (dialogs, notifications, other monitors); short blurs are ignored and none trigger a warning.
    const onBlur = () => {
      if (!document.hidden) o.blurAt = Date.now();
    };
    const onFocus = () => {
      if (o.blurAt && !document.hidden) {
        const durationMs = Date.now() - o.blurAt;
        if (durationMs >= T.blurMinMs) record("window_blur", { durationMs });
      }
      o.blurAt = undefined;
    };
    // Leaving or reloading the page: send what's queued (the server records the interruption).
    const onPageHide = () => void send(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [p.active, record, show, clear, send]);

  // ---------- Fullscreen (requested by the disclosed policy, not required) ----------
  const fsWanted = useRef(false);
  const enterFullscreen = useCallback(async () => {
    const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    if (!document.fullscreenEnabled || !el.requestFullscreen) return false;
    try {
      await el.requestFullscreen();
      fsWanted.current = true;
      clear("fullscreen");
      return true;
    } catch {
      return false;
    }
  }, [clear]);

  useEffect(() => {
    setFullscreen({ supported: Boolean(typeof document !== "undefined" && document.fullscreenEnabled), active: Boolean(typeof document !== "undefined" && document.fullscreenElement) });
    if (!p.active) return;
    const onChange = () => {
      const isFull = Boolean(document.fullscreenElement);
      setFullscreen((f) => ({ ...f, active: isFull }));
      if (isFull) {
        clear("fullscreen");
        return;
      }
      if (fsWanted.current && activeRef.current) {
        record("fullscreen_exit", { warned: true });
        show({ id: "fullscreen", tone: "warning", message: "Fullscreen was exited. This interview asks you to stay in fullscreen; please return to it.", action: { label: "Return to fullscreen", kind: "fullscreen" } });
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [p.active, record, show, clear]);

  // ---------- Camera and microphone health ----------
  const prev = useRef<{ camera: DeviceState; mic: DeviceState }>({ camera: p.camera, mic: p.mic });
  useEffect(() => {
    const before = prev.current;
    prev.current = { camera: p.camera, mic: p.mic };
    if (!p.active) return;
    const o = open.current;
    const now = Date.now();
    const lost = (s: DeviceState) => s === "unavailable" || s === "denied";
    const reasonFor = (s: DeviceState) => (s === "denied" ? "permission_revoked" : "track_ended");

    if (before.camera === "granted" && lost(p.camera)) {
      o.cameraLostAt = now;
      o.cameraReason = reasonFor(p.camera);
      show({ id: "camera", tone: "warning", message: "Your camera has disconnected. Please reconnect it to continue on video. You can keep answering meanwhile.", action: { label: "Reconnect camera", kind: "reconnect_camera" } });
    } else if (before.camera === "granted" && p.camera === "off") {
      // A deliberate choice by the candidate, not a fault.
      record("camera_turned_off", { meta: { reason: "user" } });
    } else if (o.cameraLostAt && p.camera === "granted") {
      record("camera_lost", { durationMs: now - o.cameraLostAt, resolved: true, warned: true, meta: { reason: o.cameraReason ?? "track_ended" }, force: true });
      o.cameraLostAt = undefined;
      clear("camera");
    }

    if ((before.mic === "granted" || before.mic === "off") && lost(p.mic)) {
      o.micLostAt = now;
      o.micReason = reasonFor(p.mic);
      show({ id: "mic", tone: "warning", message: "Your microphone has disconnected. Plug it back in or allow access, then reconnect. Your answer timer is paused meanwhile.", action: { label: "Reconnect microphone", kind: "reconnect_mic" } });
    } else if (o.micLostAt && p.mic === "granted") {
      record("mic_lost", { durationMs: now - o.micLostAt, resolved: true, warned: true, meta: { reason: o.micReason ?? "track_ended" }, force: true });
      o.micLostAt = undefined;
      clear("mic");
    }
  }, [p.active, p.camera, p.mic, record, show, clear]);

  // ---------- Face presence (on-device, sustained conditions only) ----------
  useEffect(() => {
    if (!p.active || p.camera !== "granted" || !p.detectorReady) return;
    const o = open.current;
    // Streaks restart whenever checking resumes (camera back on, tab visible again); an observation
    // already open keeps its start time so its duration stays correct.
    if (!o.noFaceOpen) o.noFaceSince = undefined;
    o.faceOk = 0;
    if (!o.multiOpen) {
      o.multiChecks = 0;
      o.multiSince = undefined;
    }
    let busy = false;
    const timer = window.setInterval(async () => {
      const v = p.videoRef.current;
      const d = p.faceDetector.current;
      if (busy || !v || !d || v.readyState < 2 || document.hidden) return;
      busy = true;
      const faces = await d.detect(v).then((b) => b.length).catch(() => null);
      busy = false;
      if (faces === null) return; // a detector error is not an observation
      const now = Date.now();
      // No face, sustained for faceAbsentMs.
      if (faces === 0) {
        o.faceOk = 0;
        o.noFaceSince ??= now;
        if (!o.noFaceOpen && now - o.noFaceSince >= T.faceAbsentMs) {
          o.noFaceOpen = true;
          show({ id: "face", tone: "info", message: "We could not detect a face consistently. Check your camera position and lighting." });
        }
      } else {
        o.faceOk = (o.faceOk ?? 0) + 1;
        if (o.faceOk >= T.faceRecoverChecks) {
          if (o.noFaceOpen && o.noFaceSince) {
            record("face_not_detected", { durationMs: now - o.noFaceSince, warned: true, force: true });
            clear("face");
          }
          o.noFaceOpen = false;
          o.noFaceSince = undefined;
        }
      }
      // More than one face, sustained over several consecutive checks.
      if (faces >= 2) {
        o.multiOk = 0;
        o.multiChecks = (o.multiChecks ?? 0) + 1;
        o.multiSince ??= now;
        o.maxFaces = Math.max(o.maxFaces ?? 0, faces);
        if (!o.multiOpen && o.multiChecks >= T.multipleFacesChecks) {
          o.multiOpen = true;
          show({ id: "faces", tone: "info", message: "More than one face appears on camera. If someone is with you, please ask them to step out of view." });
        }
      } else {
        o.multiOk = (o.multiOk ?? 0) + 1;
        if (o.multiOk >= T.faceRecoverChecks) {
          if (o.multiOpen && o.multiSince) {
            record("multiple_faces", { durationMs: now - o.multiSince, warned: true, meta: { faces: o.maxFaces ?? 2 }, force: true });
            clear("faces");
          }
          o.multiOpen = false;
          o.multiSince = undefined;
          o.multiChecks = 0;
          o.maxFaces = 0;
        }
      }
    }, T.faceCheckIntervalMs);
    return () => window.clearInterval(timer);
  }, [p.active, p.camera, p.detectorReady, p.videoRef, p.faceDetector, record, show, clear]);

  // ---------- Silence during an answer (on-device level only; no audio leaves the browser) ----------
  const getStream = p.getStream;
  useEffect(() => {
    if (!p.active || !p.answering) return;
    const track = getStream()?.getAudioTracks()[0];
    const Ctx = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!track || !Ctx) return; // can't measure: record nothing rather than guess
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let lastVoice = Date.now();
    let reported = false;
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      const now = Date.now();
      if (peak > 6) lastVoice = now;
      if (!reported && now - lastVoice >= T.silenceMs) {
        reported = true;
        record("silence_during_answer", { durationMs: now - lastVoice });
        show({ id: "silence", tone: "info", message: "We haven't heard anything for a while. Check that your microphone is working and not muted." });
      }
      if (reported && peak > 6) clear("silence");
    }, 500);
    return () => {
      window.clearInterval(timer);
      void ctx.close().catch(() => undefined);
    };
  }, [p.active, p.answering, getStream, p.streamVersion, record, show, clear]);

  useEffect(
    () => () => {
      if (flushTimer.current) window.clearTimeout(flushTimer.current);
    },
    [],
  );

  return { notices, dismiss: clear, record, begin, end, flush, fullscreen, enterFullscreen };
}
