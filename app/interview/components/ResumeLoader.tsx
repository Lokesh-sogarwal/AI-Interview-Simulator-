"use client";

import { useEffect, useState } from "react";

export default function ResumeLoader(props: { active: boolean }) {
  const phrases = [
    "Analyzing Resume…",
    "Extracting Skills…",
    "Reviewing Projects…",
    "Preparing Personalized Questions…",
  ];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!props.active) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % phrases.length), 1200);
    return () => window.clearInterval(id);
  }, [props.active, phrases.length]);

  if (!props.active) return null;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-foreground text-background">
          <span className="text-base font-semibold">AI</span>
        </div>
        <div className="text-xl font-semibold tracking-tight">Preparing your interview</div>
        <div className="text-sm text-foreground/70" aria-live="polite">
          {phrases[index]}
        </div>
        <div className="mt-2 h-2 w-full max-w-sm overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-foreground/40" />
        </div>
        <div className="mt-2 text-xs text-foreground/60">This usually takes a few seconds.</div>
      </div>
    </div>
  );
}
