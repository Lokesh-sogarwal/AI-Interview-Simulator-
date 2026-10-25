// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAnswerTimer } from "@/app/interview/useAnswerTimer";

type Props = { key: string; active: boolean; onExpire: (key: string) => void };

function setup(initial: Props, wrapper?: (p: { children: ReactNode }) => ReactNode) {
  return renderHook((p: Props) => useAnswerTimer(p), { initialProps: initial, wrapper });
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useAnswerTimer", () => {
  it("starts at 60 seconds and counts down every second", () => {
    const { result } = setup({ key: "q1", active: true, onExpire: vi.fn() });
    expect(result.current.secondsLeft).toBe(60);
    advance(1000);
    expect(result.current.secondsLeft).toBe(59);
    advance(14_000);
    expect(result.current.secondsLeft).toBe(45);
  });

  it("fires once at zero and never goes negative", () => {
    const onExpire = vi.fn();
    const { result } = setup({ key: "q1", active: true, onExpire });
    advance(59_000);
    expect(onExpire).not.toHaveBeenCalled();
    advance(1_000);
    expect(onExpire).toHaveBeenCalledExactlyOnceWith("q1");
    advance(30_000);
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.expired).toBe(true);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("calls the latest callback, so the newest answer text is used", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = setup({ key: "q1", active: true, onExpire: first });
    advance(30_000);
    rerender({ key: "q1", active: true, onExpire: latest });
    advance(30_000);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });

  it("does not restart when the component re-renders with the same question", () => {
    const { result, rerender } = setup({ key: "q1", active: true, onExpire: vi.fn() });
    advance(20_000);
    rerender({ key: "q1", active: true, onExpire: vi.fn() });
    rerender({ key: "q1", active: true, onExpire: vi.fn() });
    expect(result.current.secondsLeft).toBe(40);
  });

  it("pauses while inactive and resumes with the time that was left", () => {
    const onExpire = vi.fn();
    const { result, rerender } = setup({ key: "q1", active: true, onExpire });
    advance(10_000);
    rerender({ key: "q1", active: false, onExpire });
    advance(120_000);
    expect(result.current.secondsLeft).toBe(50);
    expect(onExpire).not.toHaveBeenCalled();
    rerender({ key: "q1", active: true, onExpire });
    advance(49_000);
    expect(onExpire).not.toHaveBeenCalled();
    advance(1_000);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("gives the next question a fresh 60 seconds", () => {
    const onExpire = vi.fn();
    const { result, rerender } = setup({ key: "q1", active: true, onExpire });
    advance(60_000);
    rerender({ key: "q2", active: true, onExpire });
    expect(result.current.secondsLeft).toBe(60);
    advance(60_000);
    expect(onExpire.mock.calls).toEqual([["q1"], ["q2"]]);
  });

  it("does not start for an inactive question until it becomes active", () => {
    const onExpire = vi.fn();
    const { result, rerender } = setup({ key: "q1", active: false, onExpire });
    advance(90_000);
    expect(result.current.secondsLeft).toBe(60);
    rerender({ key: "q1", active: true, onExpire });
    advance(1_000);
    expect(result.current.secondsLeft).toBe(59);
  });

  it("uses the deadline, so throttled callbacks cannot extend the time", () => {
    const onExpire = vi.fn();
    setup({ key: "q1", active: true, onExpire });
    // A background tab may not run intervals for a long stretch; the wall clock still moves.
    act(() => vi.setSystemTime(Date.now() + 75_000));
    advance(250);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("clears its interval on unmount", () => {
    const onExpire = vi.fn();
    const { unmount } = setup({ key: "q1", active: true, onExpire });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    advance(120_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("fires exactly once under React Strict Mode", () => {
    const onExpire = vi.fn();
    const { result } = setup({ key: "q1", active: true, onExpire }, ({ children }) => <StrictMode>{children}</StrictMode>);
    advance(30_000);
    expect(result.current.secondsLeft).toBe(30);
    advance(40_000);
    expect(onExpire).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
