import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <a href="/" className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
            <span className="text-sm font-semibold">AI</span>
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">
              Interview Simulator
            </div>
            <div className="text-xs text-foreground/70">HR-style mock interviews</div>
          </div>
        </a>

        <a
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
        >
          Back to home
        </a>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-14">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-foreground/10 bg-background p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
