"use client";

import { useState } from "react";

import { Alert, Button } from "@/app/components/ui";

/** Finalises an unfinished interview from its saved transcript, then generates the report. */
export default function FinishInterviewButton({ interviewId }: { interviewId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/interviews/${interviewId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endedReason: "manual_end" }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || "The interview could not be finalised.");
      // The report is optional: the page shows per-answer scores even if this fails.
      await fetch("/api/ai/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interviewId }) }).catch(() => null);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The interview could not be finalised.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button size="sm" onClick={run} loading={busy}>
        Finish and generate report
      </Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
