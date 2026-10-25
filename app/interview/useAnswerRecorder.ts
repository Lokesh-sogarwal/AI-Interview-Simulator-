"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function canRecordAudio() {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
}

function pickMimeType() {
  if (!canRecordAudio() || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/**
 * Records one spoken answer from the session's microphone track, for browsers
 * without speech recognition. The audio stays in memory until `stop()` hands
 * it to the caller for server-side transcription; nothing is stored.
 */
export function useAnswerRecorder(getStream: () => MediaStream | null) {
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  /** Starts a new recording, or resumes a paused one. */
  const start = useCallback(() => {
    const rec = recRef.current;
    if (rec) {
      if (rec.state === "paused") rec.resume();
      return;
    }
    const track = getStream()?.getAudioTracks()[0];
    if (!track || !canRecordAudio()) return;
    const mimeType = pickMimeType();
    const next = new MediaRecorder(new MediaStream([track]), mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    next.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    next.start(1000);
    recRef.current = next;
  }, [getStream]);

  /** Pauses without discarding (interviewer speaking, mic muted, interview paused). */
  const pause = useCallback(() => {
    if (recRef.current?.state === "recording") recRef.current.pause();
  }, []);

  /** Ends the recording and returns the answer audio (null if nothing was recorded). */
  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const rec = recRef.current;
        recRef.current = null;
        if (!rec || rec.state === "inactive") return resolve(null);
        const type = rec.mimeType || "audio/webm";
        rec.onstop = () => {
          const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type }) : null;
          chunksRef.current = [];
          resolve(blob && blob.size > 0 ? blob : null);
        };
        rec.stop();
      }),
    [],
  );

  const cancel = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    chunksRef.current = [];
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  return useMemo(() => ({ start, pause, stop, cancel }), [start, pause, stop, cancel]);
}
