"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";

import { Alert, ButtonLink, LoadingState } from "@/app/components/ui";

function VerifyEmailInner() {
  const token = useSearchParams().get("token") || "";
  const [state, setState] = useState<{ status: "loading" | "ok" | "error"; message?: string }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setState({ status: "error", message: "This verification link is missing its token." });
        return;
      }
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
        if (cancelled) return;
        setState(res.ok && data?.ok ? { status: "ok" } : { status: "error", message: data?.error || "This link could not be verified." });
      } catch {
        if (!cancelled) setState({ status: "error", message: "Could not reach the server. Please try again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.status === "loading") return <LoadingState label="Verifying your email…" rows={2} />;

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-semibold tracking-tight text-text">Email verification</h1>
      {state.status === "ok" ? (
        <Alert tone="success" title="Your email is verified">
          <span className="inline-flex items-center gap-1">
            <CircleCheck className="size-4" aria-hidden /> You can close this tab or continue to the app.
          </span>
        </Alert>
      ) : (
        <Alert tone="error" title="Verification failed">
          {state.message} You can request a new link from the verification page.
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/">Go to the app</ButtonLink>
        {state.status === "error" ? (
          <ButtonLink href="/auth/verify" variant="secondary">
            Request a new link
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" rows={2} />}>
      <VerifyEmailInner />
    </Suspense>
  );
}
