"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

import { Alert, Button, ConfirmDialog } from "@/app/components/ui";
import { REEVALUATION_LIMIT_MESSAGE } from "@/lib/reevaluation";

type Status = "idle" | "confirming" | "loading" | "success" | "error";

/**
 * Re-runs the AI evaluation of a finished interview's saved answers, once.
 * `remaining` comes from the server-side counter; the server enforces the
 * limit too, so this is only the display. The current report stays on screen
 * until the server has saved the new one.
 */
export default function ReevaluateButton({ interviewId, remaining }: { interviewId: string; remaining: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [limitReached, setLimitReached] = useState(remaining <= 0);
  // Guards against double submits before React re-renders the disabled button.
  const inFlight = useRef(false);

  async function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/reevaluate`, { method: "POST" }).catch(() => null);
      const data = res ? ((await res.json().catch(() => null)) as { ok?: boolean; error?: string; code?: string; retryable?: boolean } | null) : null;
      if (res?.ok && data?.ok) {
        setStatus("success");
        setLimitReached(true);
        router.refresh();
        return;
      }
      if (data?.code === "reevaluation_limit_reached") {
        setLimitReached(true);
        setStatus("idle");
        return;
      }
      setError({
        message: !res ? "Couldn't reach the server. Check your connection and try again." : data?.error || "The interview couldn't be re-evaluated. Please try again.",
        // Network failures, AI outages and server errors are transient; 4xx answers mostly are not.
        retryable: !res || Boolean(data?.retryable) || res.status >= 500 || res.status === 429,
      });
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }

  const loading = status === "loading";
  return (
    <div className="grid w-full gap-2">
      {status === "success" ? <Alert tone="success" className="text-left">Interview re-evaluated successfully.</Alert> : null}
      {limitReached ? (
        <p className="text-left text-xs text-muted" role="status">
          {REEVALUATION_LIMIT_MESSAGE}
        </p>
      ) : (
        <>
          <Button variant="secondary" size="sm" className="w-full" icon={<RotateCw className="size-4" aria-hidden />} loading={loading} onClick={() => setStatus("confirming")}>
            {loading ? "Re-evaluating…" : "Re-evaluate Interview"}
          </Button>
          <p className="text-left text-xs text-muted">
            {remaining} re-evaluation{remaining === 1 ? "" : "s"} available for this interview.
          </p>
        </>
      )}
      {status === "error" && error ? (
        <Alert
          tone="error"
          className="text-left"
          action={error.retryable ? <Button size="sm" variant="secondary" onClick={run}>Try again</Button> : undefined}
        >
          {error.message} Your previous report is unchanged{error.retryable ? " and your re-evaluation is still available" : ""}.
        </Alert>
      ) : null}
      <ConfirmDialog
        open={status === "confirming"}
        title="Re-evaluate this interview?"
        description="The AI will analyze your saved interview answers again and generate an updated evaluation report. You can do this only once per interview."
        confirmLabel="Re-evaluate"
        onCancel={() => setStatus(error ? "error" : "idle")}
        onConfirm={run}
      />
    </div>
  );
}
