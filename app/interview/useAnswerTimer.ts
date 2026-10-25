"use client";

import { useEffect, useRef, useState } from "react";

export const ANSWER_SECONDS = 60;

type TimerSlot = {
  key: string;
  /** Time left while not running. */
  remainingMs: number;
  /** Absolute end time while running (null when paused/inactive). */
  deadline: number | null;
  fired: boolean;
};

/**
 * Per-question answer countdown.
 *
 * - Deadline-based: remaining time is `deadline - now`, so throttled or late
 *   interval callbacks (background tabs, busy main thread) never add time.
 * - Keyed by question: a new `key` starts a fresh `seconds` countdown; the
 *   same key never restarts, whatever re-renders (or Strict Mode's double
 *   effects) happen.
 * - Pauses while `active` is false (interviewer speaking, request in flight,
 *   interview paused) and resumes with the time that was left.
 * - `onExpire` runs at most once per key, always with the latest callback.
 */
export function useAnswerTimer({ key, active, seconds = ANSWER_SECONDS, onExpire }: { key: string; active: boolean; seconds?: number; onExpire: (key: string) => void }) {
  const durationMs = seconds * 1000;
  const slot = useRef<TimerSlot>({ key: "", remainingMs: durationMs, deadline: null, fired: false });
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });
  const [secondsLeft, setSecondsLeft] = useState(seconds);

  useEffect(() => {
    let s = slot.current;
    if (s.key !== key) {
      s = slot.current = { key, remainingMs: durationMs, deadline: null, fired: false };
    }
    const show = (ms: number) => setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)));

    if (!key || !active || s.fired) {
      show(s.remainingMs);
      return;
    }
    if (s.deadline === null) s.deadline = Date.now() + s.remainingMs;

    const tick = () => {
      const left = Math.max(0, (s.deadline ?? Date.now()) - Date.now());
      show(left);
      if (left > 0 || s.fired) return;
      s.fired = true;
      s.remainingMs = 0;
      s.deadline = null;
      window.clearInterval(interval);
      onExpireRef.current(key);
    };
    // Ticking 4x a second keeps the display within a quarter second of the deadline.
    const interval = window.setInterval(tick, 250);
    tick();
    return () => {
      window.clearInterval(interval);
      if (s.deadline !== null) {
        s.remainingMs = Math.max(0, s.deadline - Date.now());
        s.deadline = null;
      }
    };
  }, [key, active, durationMs]);

  return { secondsLeft, expired: secondsLeft === 0 };
}
