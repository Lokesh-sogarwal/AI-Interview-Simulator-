"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InterviewCompletedPage() {
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => {
      router.push("/history");
    }, 5000);
    return () => window.clearTimeout(id);
  }, [router]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center px-6 py-16">
        <div className="relative w-full max-w-xl">
          <div className="pointer-events-none absolute inset-0 rounded-[2rem] aisim-hero-glow" />

          <div className="relative rounded-[2rem] border border-foreground/10 bg-background p-8 aisim-3d-card">
            <div className="flex flex-col items-center gap-5 text-center">
              <div className="relative grid place-items-center">
                <div className="size-20 rounded-full border border-foreground/15 bg-foreground/[0.03]" />
                <div className="absolute size-20 rounded-full border-2 border-foreground/20 border-t-foreground aisim-spin" />
                <div className="absolute grid size-10 place-items-center rounded-2xl bg-foreground text-background aisim-float">
                  <span className="text-base font-semibold">AI</span>
                </div>
              </div>

              <div>
                <h1 className="text-balance text-2xl font-semibold tracking-tight">Interview complete</h1>
                <p className="mt-2 text-pretty text-sm leading-6 text-foreground/70">
                  Your session has been saved. Redirecting to your history in 5 seconds.
                </p>
              </div>

              <div className="mt-2 w-full rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 text-sm text-foreground/80">
                Tip: You can review your full report from the dashboard.
              </div>

              <a
                href="/history"
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                Go to history now
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
