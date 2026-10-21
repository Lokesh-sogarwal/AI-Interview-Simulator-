import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  ChartColumn,
  CodeXml,
  FileSearch,
  Keyboard,
  Languages,
  ListChecks,
  MessageSquareText,
  Mic,
  SlidersHorizontal,
  Video,
} from "lucide-react";

import { BrandMark } from "@/app/components/shell/BrandMark";
import { ButtonLink } from "@/app/components/ui";

const features = [
  {
    icon: Mic,
    title: "AI mock interviews",
    body: "HR, technical or mixed sessions. The interviewer asks one question at a time, follows up on weak answers and avoids repeating itself.",
  },
  {
    icon: FileSearch,
    title: "Resume-aware questions",
    body: "Upload a PDF or text resume. Skills, projects and experience are extracted and used to ground questions in your own work.",
  },
  {
    icon: MessageSquareText,
    title: "Structured feedback",
    body: "Each answer is scored on technical accuracy, clarity, confidence and depth, with strengths, gaps and a suggested better answer.",
  },
  {
    icon: CodeXml,
    title: "Coding contests",
    body: "Solve problems in Python, JavaScript, C++ or Java, run them against examples and compete on a contest leaderboard.",
  },
];

const capabilities = [
  { icon: SlidersHorizontal, label: "Easy, Medium, Hard or Adaptive difficulty that adjusts to your answers" },
  { icon: Keyboard, label: "Typing mode for focused practice" },
  { icon: Video, label: "Video mode with spoken questions, dictation and optional proctoring" },
  { icon: Languages, label: "Responds in English, Hindi or Hinglish based on how you answer" },
  { icon: ListChecks, label: "STAR-method analysis for behavioural answers" },
  { icon: ChartColumn, label: "History, progress trends and a final report for every session" },
];

const steps = [
  { title: "Configure", body: "Pick the interview type, difficulty, target role and experience level. Add a company, focus areas or your resume if you like." },
  { title: "Interview", body: "Answer by typing or speaking. Every answer is saved as you go, so a refresh does not lose your progress." },
  { title: "Review", body: "Read per-question feedback and the final report, then track how your scores change across sessions." },
];

function ProductPreview() {
  return (
    <figure className="relative" aria-label="Illustration of the live interview workspace">
      <div className="rounded-[1.25rem] border border-border bg-surface p-3 shadow-overlay sm:p-4">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-success ui-pulse" aria-hidden />
            <span className="text-xs font-semibold text-text">Live session</span>
            <span className="hidden text-xs text-muted sm:inline">· Mixed · Adaptive</span>
          </div>
          <span className="rounded-full bg-background px-2.5 py-0.5 text-xs font-medium text-muted">Question 4 of 10</span>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <div className="grid gap-3 sm:col-span-3">
            <div className="rounded-xl bg-primary p-4 text-on-primary">
              <p className="text-[11px] font-medium uppercase tracking-wider text-on-primary/70">Interviewer</p>
              <p className="mt-1.5 text-sm leading-6">You mentioned a caching layer in your last project. How did you decide what to cache and for how long?</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-muted p-3">
              <p className="text-[11px] font-medium text-muted">Your answer</p>
              <div className="mt-2 grid gap-1.5" aria-hidden>
                <div className="h-2 w-11/12 rounded-full bg-secondary/50" />
                <div className="h-2 w-10/12 rounded-full bg-secondary/50" />
                <div className="h-2 w-7/12 rounded-full bg-secondary/50" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border p-3 sm:col-span-2">
            <p className="text-[11px] font-medium text-muted">Example feedback</p>
            <dl className="mt-2 grid gap-2.5">
              {[
                ["Technical", 78],
                ["Clarity", 64],
                ["Confidence", 70],
                ["Depth", 52],
              ].map(([label, pct]) => (
                <div key={label as string}>
                  <dt className="text-xs text-text">{label}</dt>
                  <dd className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary/35">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">An example of the interview screen: the current question, your answer and score bars for each feedback dimension.</figcaption>
    </figure>
  );
}

export default function PublicLanding() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <BrandMark />
          <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
            <Link href="#features" className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted hover:text-text md:inline-flex">
              Features
            </Link>
            <Link href="#how-it-works" className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted hover:text-text md:inline-flex">
              How it works
            </Link>
            <ButtonLink href="/auth/login" variant="ghost" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/auth/signup" size="sm">
              Get started
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-12 sm:px-6 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pb-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-medium text-text">
              <BrainCircuit className="size-3.5 text-primary" aria-hidden />
              Interview preparation with an AI interviewer
            </p>
            <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-text sm:text-5xl">
              Practise the interview before the interview.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-7 text-muted sm:text-lg">
              Run realistic HR, technical or mixed mock interviews, get honest feedback on every answer, tailor questions to your resume and
              sharpen your coding in timed contests.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/auth/signup" size="lg" icon={<ArrowRight className="size-4" aria-hidden />} className="flex-row-reverse">
                Start practising
              </ButtonLink>
              <ButtonLink href="#features" size="lg" variant="secondary">
                Explore features
              </ButtonLink>
            </div>
          </div>
          <ProductPreview />
        </section>

        <section id="features" aria-labelledby="features-title" className="scroll-mt-20 border-y border-border bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-muted">Features</p>
              <h2 id="features-title" className="mt-2 text-3xl font-semibold tracking-tight text-text">
                Everything you need to prepare in one place
              </h2>
            </div>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {features.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-card border border-border bg-background/60 p-6">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary text-on-primary" aria-hidden>
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-text">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
                </li>
              ))}
            </ul>
            <ul className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-start gap-3 text-sm text-text">
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <p className="text-sm font-semibold text-muted">How it works</p>
            <h2 id="how-title" className="mt-2 text-3xl font-semibold tracking-tight text-text">
              From setup to feedback in three steps
            </h2>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="rounded-card border border-border bg-surface p-6">
                  <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-primary" aria-hidden>
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-text">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-12 flex flex-col items-start justify-between gap-6 rounded-card bg-primary px-6 py-8 text-on-primary sm:flex-row sm:items-center sm:px-8">
              <div>
                <h2 className="text-xl font-semibold">Ready for your first session?</h2>
                <p className="mt-1 text-sm text-on-primary/75">Create an account and start a mock interview in a couple of minutes.</p>
              </div>
              <ButtonLink href="/auth/signup" variant="accent" size="lg">
                Create free account
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <BrandMark compact />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="#features" className="hover:text-text">
              Features
            </Link>
            <Link href="#how-it-works" className="hover:text-text">
              How it works
            </Link>
            <Link href="/auth/login" className="hover:text-text">
              Sign in
            </Link>
            <Link href="/auth/signup" className="hover:text-text">
              Create account
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
