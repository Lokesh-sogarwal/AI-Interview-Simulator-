import Image from "next/image";

export default function PublicLanding() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
            <span className="text-sm font-semibold">AI</span>
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">Interview Simulator</div>
            <div className="text-xs text-foreground/70">HR-style mock interviews</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/auth/login"
            className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
          >
            Sign in
          </a>
          <a
            href="/auth/signup"
            className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Create account
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-14">
        <section className="grid gap-10 py-10 md:grid-cols-2 md:items-center">
          <div className="flex flex-col gap-5">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-foreground/15 px-3 py-1 text-xs text-foreground/80">
              <span className="font-medium text-foreground">AI Interview Practice</span>
              <span className="text-foreground/50">·</span>
              <span>Instant feedback</span>
            </div>

            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              Practice interviews with an AI HR — and get actionable feedback.
            </h1>
            <p className="text-pretty text-base leading-7 text-foreground/75">
              This website helps you prepare for real screenings using HR-style questions and structured feedback. Sign in to
              start an interview and track your progress.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="/auth/login"
                className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                Sign in to start
              </a>
              <div className="text-sm text-foreground/60">Create an account to save history</div>
            </div>
          </div>

          <div className="rounded-3xl border border-foreground/10 bg-background p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">What you get</div>
                <div className="text-sm text-foreground/70">A simple practice loop</div>
              </div>
              <Image src="/window.svg" alt="" width={28} height={28} className="opacity-80" />
            </div>

            <div className="mt-6 grid gap-4">
              <div className="flex gap-4 rounded-2xl border border-foreground/10 p-4">
                <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-sm font-semibold text-background">
                  1
                </div>
                <div>
                  <div className="text-sm font-medium">AI interview questions</div>
                  <div className="text-sm text-foreground/70">HR-style prompts tailored to your role.</div>
                </div>
              </div>
              <div className="flex gap-4 rounded-2xl border border-foreground/10 p-4">
                <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-sm font-semibold text-background">
                  2
                </div>
                <div>
                  <div className="text-sm font-medium">Instant evaluation</div>
                  <div className="text-sm text-foreground/70">Clarity, confidence, depth, and overall score.</div>
                </div>
              </div>
              <div className="flex gap-4 rounded-2xl border border-foreground/10 p-4">
                <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-sm font-semibold text-background">
                  3
                </div>
                <div>
                  <div className="text-sm font-medium">Progress dashboard</div>
                  <div className="text-sm text-foreground/70">Save sessions and review improvements.</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="mx-auto mt-10 flex max-w-6xl flex-col gap-2 px-1 text-xs text-foreground/60">
          <div>Sign in to start using the simulator.</div>
        </footer>
      </main>
    </div>
  );
}
