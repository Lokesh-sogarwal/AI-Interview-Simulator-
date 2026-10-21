import Link from "next/link";

import { cn } from "@/app/components/ui";

/** Product mark: a speech-bubble monogram plus the wordmark. */
export function BrandMark({ compact = false, href = "/", className }: { compact?: boolean; href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-md", className)} aria-label="AI Interview Simulator home">
      <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-on-primary" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 18.5V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9l-4 2.5Z" />
          <path d="M9.5 10h5M9.5 13h3" />
        </svg>
      </span>
      {compact ? (
        <span className="text-sm font-semibold tracking-tight text-text">Interview Simulator</span>
      ) : (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight text-text">Interview Simulator</span>
          <span className="block text-[11px] font-medium text-muted">AI practice studio</span>
        </span>
      )}
    </Link>
  );
}
