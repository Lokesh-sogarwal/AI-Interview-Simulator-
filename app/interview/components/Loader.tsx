import React from "react";

export default function Loader(props: {
  title: string;
  subtitle: string;
  phrase: string;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-foreground text-background">
          <span className="text-base font-semibold">AI</span>
        </div>
        <div className="text-xl font-semibold tracking-tight">{props.title}</div>
        <div className="text-sm text-foreground/70" aria-live="polite">
          {props.phrase}
        </div>
        <div className="mt-2 h-2 w-full max-w-sm overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-foreground/40" />
        </div>
        <div className="mt-2 text-xs text-foreground/60">{props.subtitle}</div>
      </div>
    </div>
  );
}
