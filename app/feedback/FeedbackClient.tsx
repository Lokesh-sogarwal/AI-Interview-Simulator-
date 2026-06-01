"use client";

import { useEffect, useMemo, useState } from "react";

import PerformanceDashboard from "@/app/components/PerformanceDashboard";
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
  const [sessionTurns, setSessionTurns] = useState<Turn[]>([]);
  const [dataSource, setDataSource] = useState<"db" | "local" | "none">("none");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadFeedbackData = async (showLoading = true) => {
    if (showLoading) setLoading(true);

    const raw = window.localStorage.getItem("aisim_turns");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Turn[];
        setSessionTurns(parsed);
      } catch {
        setSessionTurns([]);
      }
    }

    try {
      const response = await fetch("/api/interviews", { credentials: "include" });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; interviews?: Array<{ transcript?: Turn[] }> }
        | { ok: false; error?: string }
        | null;

      if (response.ok && payload && payload.ok === true) {
        const latestInterview = payload.interviews?.[0];
        const savedTurns = Array.isArray(latestInterview?.transcript)
          ? latestInterview.transcript
          : [];

        if (savedTurns.length > 0) {
          setTurns(savedTurns);
          setDataSource("db");
          setLoading(false);
          return;
        }
      }
    } catch {
      // fall back below
    }

    if (sessionTurns.length > 0) {
      setTurns(sessionTurns);
      setDataSource("local");
    } else {
      setTurns([]);
      setDataSource("none");
    }

    setLoading(false);
  };

  // Initial load on mount and when refreshKey changes
  useEffect(() => {
    loadFeedbackData(true);
  }, [refreshKey]);

  // Re-fetch when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadFeedbackData(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
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
    if (sessionTurns.length === 0) {
      setStatus("error");
      setMessage("No current session data to save.");
      return;
    }

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
          transcript: sessionTurns.map((t) => ({
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
      setMessage("Saved. Refreshing data…");
      window.localStorage.removeItem("aisim_turns");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setRefreshKey((prev) => prev + 1);
    } catch {
      setStatus("error");
      setMessage("Could not save. Check your connection.");
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto w-full max-w-6xl px-6 pb-14">
        <div className="flex flex-col gap-2 justify-between sm:flex-row sm:items-start">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Your feedback</h1>
            <p className="text-sm text-foreground/70">Summary scores and key improvements from this session.</p>
          </div>
          <button
            onClick={() => setRefreshKey((prev) => prev + 1)}
            disabled={loading}
            className="mt-2 sm:mt-0 inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {/* Performance Dashboard - Historical Performance */}
        <section className="mt-8 rounded-3xl border border-foreground/10 bg-background p-6">
          <h2 className="text-lg font-semibold tracking-tight mb-4">Overall Performance</h2>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-foreground/70">Loading performance data...</div>
            </div>
          ) : (
            <PerformanceDashboard key={refreshKey} />
          )}
        </section>
       </main>
    </div>
  );
}
