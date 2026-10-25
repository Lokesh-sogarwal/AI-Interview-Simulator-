"use client";

import { useState } from "react";

import { Alert, Button } from "@/app/components/ui";

/** (Re)generates the AI report for a finished interview from its stored, evaluated answers. */
export default function GenerateReportButton({ interviewId }: { interviewId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/ai/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interviewId }) }).catch(() => null);
    const data = res ? ((await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null) : null;
    if (res?.ok && data?.ok) {
      window.location.reload();
      return;
    }
    setError(data?.error || "The report service is unavailable. Please try again.");
    setBusy(false);
  }

  return (
    <div className="grid gap-2">
      <Button size="sm" variant="secondary" onClick={run} loading={busy} className="w-fit">
        {error ? "Try again" : "Generate report"}
      </Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
