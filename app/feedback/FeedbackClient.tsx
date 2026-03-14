"use client";

import { useEffect, useMemo, useState } from "react";

import type { Evaluation } from "@/app/api/ai/evaluate/route";

type Turn = {
  question: string;
  answer: string;
  evaluation: Evaluation;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  star?: any;
};

function avg(nums: number[]) {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export default function FeedbackClient() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const raw = window.localStorage.getItem("aisim_turns");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Turn[];
      setTurns(parsed);
    } catch {
      setTurns([]);
    }
  }, []);

  const summary = useMemo(() => {
    const technical = turns.map((t) => t.evaluation.technical_score);
    const clarity = turns.map((t) => t.evaluation.clarity_score);
    const confidence = turns.map((t) => t.evaluation.confidence_score);
    const depth = turns.map((t) => t.evaluation.depth_score);
    const overall = turns.map((t) => t.evaluation.overall_score);

    return {
      technical: avg(technical),
      clarity: avg(clarity),
      confidence: avg(confidence),
      depth: avg(depth),
      overall: avg(overall),
      totalScore: Math.round(avg(overall) * 10),
    };
  }, [turns]);

  const topImprovements = useMemo(() => {
    return turns
      .map((t) => t.evaluation.improvement)
      .filter(Boolean)
      .slice(-5);
  }, [turns]);

  async function saveToDashboard() {
    setStatus("saving");
    setMessage("Saving to dashboard…");

    try {
      const response = await fetch("/api/interviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "Software Engineer",
          type: "Mixed",
          difficulty: "Adaptive",
          totalScore: summary.totalScore,
          breakdown: {
            technical: summary.technical,
            clarity: summary.clarity,
            confidence: summary.confidence,
            depth: summary.depth,
          },
          transcript: turns.map((t) => ({
            question: t.question,
            answer: t.answer,
            evaluation: t.evaluation,
            star: t.star,
          })),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok: true; id: string }
        | { ok: false; error: string }
        | null;

      if (response.status === 401) {
        setStatus("error");
        setMessage("Your session expired. Redirecting to sign in…");
        window.location.href = "/auth/login";
        return;
      }

      if (!response.ok || !payload || payload.ok === false) {
        setStatus("error");
        setMessage(
          payload && "error" in payload && payload.error
            ? payload.error
            : `Could not save (HTTP ${response.status}).`,
        );
        return;
      }

      setStatus("saved");
      setMessage("Saved. Opening dashboard…");
      window.localStorage.removeItem("aisim_turns");
      window.location.href = "/dashboard";
    } catch {
      setStatus("error");
      setMessage("Could not save. Check your connection.");
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
            <div className="text-xs text-foreground/70">Feedback</div>
          </div>
        </a>

        <a
          href="/dashboard"
          className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
        >
          Dashboard
        </a>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-14">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Your feedback</h1>
          <p className="text-sm text-foreground/70">Summary scores and key improvements from this session.</p>
        </div>

        {turns.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-foreground/10 p-6 text-sm text-foreground/70">
            No interview data found. Start an interview first.
          </div>
        ) : (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-5">
              {(
                [
                  ["Overall", summary.overall],
                  ["Technical", summary.technical],
                  ["Clarity", summary.clarity],
                  ["Confidence", summary.confidence],
                  ["Depth", summary.depth],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-foreground/10 bg-background p-5">
                  <div className="text-xs font-medium text-foreground/60">{label}</div>
                  <div className="mt-2 text-2xl font-semibold">{value}/10</div>
                </div>
              ))}
            </section>

            <section className="mt-6 rounded-3xl border border-foreground/10 bg-background p-6">
              <h2 className="text-lg font-semibold tracking-tight">Key improvements</h2>
              <div className="mt-3 grid gap-3">
                {topImprovements.map((t, idx) => (
                  <div key={idx} className="rounded-2xl border border-foreground/10 p-4 text-sm text-foreground/80">
                    {t}
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={saveToDashboard}
                  disabled={status === "saving" || status === "saved"}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
                >
                  {status === "saved" ? "Saved" : status === "saving" ? "Saving…" : "Save to dashboard"}
                </button>
                <a
                  href="/interview/setup"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-foreground/15 px-5 text-sm font-medium transition-opacity hover:opacity-90"
                >
                  Start another interview
                </a>
              </div>

              <div className="mt-3 text-sm text-foreground/70" aria-live="polite">
                {message}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
