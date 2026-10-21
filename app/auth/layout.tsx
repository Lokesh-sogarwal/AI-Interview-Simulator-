import type { ReactNode } from "react";
import { CircleCheck } from "lucide-react";

import { BrandMark } from "@/app/components/shell/BrandMark";
import { ButtonLink } from "@/app/components/ui";

const points = [
  "HR, technical and mixed interviews with adaptive difficulty",
  "Feedback on every answer plus a final report",
  "Resume-aware questions and coding contests",
];

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden flex-col justify-between bg-primary p-10 text-on-primary lg:flex">
        <div className="[&_span]:text-on-primary [&_a>span:first-child]:bg-accent [&_a>span:first-child]:text-primary">
          <BrandMark />
        </div>
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">Walk into your next interview having already practised it.</h2>
          <ul className="mt-8 grid gap-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm text-on-primary/85">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-on-primary/60">Your interviews and feedback are private to your account.</p>
      </aside>

      <div className="flex flex-col">
        <header className="flex items-center justify-between px-4 py-4 sm:px-8">
          <div className="lg:invisible">
            <BrandMark />
          </div>
          <ButtonLink href="/" variant="ghost" size="sm">
            Back to home
          </ButtonLink>
        </header>
        <main id="main" className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center sm:px-8">
          <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
