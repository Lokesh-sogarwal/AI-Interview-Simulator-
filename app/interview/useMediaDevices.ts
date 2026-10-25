"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * - `granted`: the device is live and in use.
 * - `off`: the candidate switched it off (camera tracks are stopped, the mic track is muted).
 * - `denied`: the browser or the candidate refused permission.
 * - `unavailable`: no device, it's in use by another app, or it was unplugged.
 */
export type DeviceState = "unknown" | "requesting" | "granted" | "off" | "denied" | "unavailable";

const VIDEO: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" };
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

function classify(e: unknown): DeviceState {
  const name = e instanceof Error ? e.name : "";
  return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable";
}

/**
 * One camera + microphone stream for the whole session: the lobby preview, the
 * picture-in-picture self view and (when the browser has no speech
 * recognition) the answer recorder all share it. Nothing is recorded or
 * uploaded here. Every track is stopped on `stopAll()` and on unmount.
 */
export function useMediaDevices() {
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<DeviceState>("unknown");
  const [mic, setMic] = useState<DeviceState>("unknown");
  /** Bumped whenever tracks change, so video elements re-attach the stream. */
  const [version, setVersion] = useState(0);

  const watch = useCallback((track: MediaStreamTrack) => {
    // Unplugged or revoked mid-session.
    track.addEventListener("ended", () => {
      streamRef.current?.removeTrack(track);
      (track.kind === "video" ? setCamera : setMic)((s) => (s === "off" ? s : "unavailable"));
      setVersion((v) => v + 1);
    });
  }, []);

  const addTracks = useCallback(
    (s: MediaStream) => {
      if (!streamRef.current) streamRef.current = new MediaStream();
      for (const t of s.getTracks()) {
        streamRef.current.getTracks().filter((old) => old.kind === t.kind).forEach((old) => {
          old.stop();
          streamRef.current!.removeTrack(old);
        });
        streamRef.current.addTrack(t);
        watch(t);
      }
      setVersion((v) => v + 1);
    },
    [watch],
  );

  /** Asks for camera and microphone together, then separately so one missing device doesn't block the other. */
  const request = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      setMic("unavailable");
      return;
    }
    setCamera("requesting");
    setMic("requesting");
    try {
      addTracks(await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: VIDEO }));
      setCamera("granted");
      setMic("granted");
      return;
    } catch {
      // fall through to one device at a time
    }
    for (const kind of ["audio", "video"] as const) {
      try {
        addTracks(await navigator.mediaDevices.getUserMedia(kind === "audio" ? { audio: AUDIO } : { video: VIDEO }));
        (kind === "audio" ? setMic : setCamera)("granted");
      } catch (e) {
        (kind === "audio" ? setMic : setCamera)(classify(e));
      }
    }
  }, [addTracks]);

  const setCameraOn = useCallback(
    async (on: boolean) => {
      if (!on) {
        // Stop (not just disable) so the camera light really goes off.
        streamRef.current?.getVideoTracks().forEach((t) => {
          t.stop();
          streamRef.current!.removeTrack(t);
        });
        setCamera("off");
        setVersion((v) => v + 1);
        return;
      }
      try {
        addTracks(await navigator.mediaDevices.getUserMedia({ video: VIDEO }));
        setCamera("granted");
      } catch (e) {
        setCamera(classify(e));
      }
    },
    [addTracks],
  );

  const setMicOn = useCallback(
    async (on: boolean) => {
      const tracks = streamRef.current?.getAudioTracks() ?? [];
      if (on && tracks.length === 0) {
        // Reconnect after the mic was unplugged or blocked.
        try {
          addTracks(await navigator.mediaDevices.getUserMedia({ audio: AUDIO }));
          setMic("granted");
        } catch (e) {
          setMic(classify(e));
        }
        return;
      }
      tracks.forEach((t) => (t.enabled = on));
      setMic(on ? "granted" : "off");
    },
    [addTracks],
  );

  const stopAll = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera((s) => (s === "granted" ? "off" : s));
    setMic((s) => (s === "granted" ? "off" : s));
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return { streamRef, camera, mic, version, request, setCameraOn, setMicOn, stopAll };
}

/** 0-1 input level of the stream's microphone, for the lobby meter (on-device only). */
export function useMicLevel(stream: MediaStream | null, version: number, enabled: boolean) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    const Ctx = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!enabled || !track || !Ctx) return;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(Math.min(1, peak / 64));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close().catch(() => undefined);
    };
  }, [stream, version, enabled]);
  return enabled && stream?.getAudioTracks()[0] ? level : 0;
}
