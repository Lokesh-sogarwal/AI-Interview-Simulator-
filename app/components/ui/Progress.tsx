import { cn } from "./cn";

type ProgressProps = { value: number; max?: number; label: string; showValue?: boolean; tone?: "primary" | "success" | "warning" | "error"; className?: string };

export function Progress({ value, max = 100, label, showValue = false, tone = "primary", className }: ProgressProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", error: "bg-error" }[tone];
  return (
    <div className={cn("grid gap-1.5", className)}>
      {showValue ? (
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-text">{label}</span>
          <span className="tabular-nums text-muted">
            {Number.isInteger(value) ? value : value.toFixed(1)}/{max}
          </span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 10) / 10}
        className="h-2 overflow-hidden rounded-full bg-secondary/35"
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Tone for a 0-10 score; text labels are always shown alongside so colour is never the only signal. */
export function scoreTone(score: number) {
  if (score >= 7) return "success" as const;
  if (score >= 4.5) return "warning" as const;
  return "error" as const;
}

export function scoreLabel(score: number) {
  if (score >= 8.5) return "Excellent";
  if (score >= 7) return "Strong";
  if (score >= 5.5) return "Fair";
  if (score >= 4) return "Developing";
  return "Needs work";
}

type ScoreRingProps = { score: number | null; max?: number; size?: number; label?: string; className?: string };

/** Circular score display (0-10 by default). Shows an em dash when no score exists. */
export function ScoreRing({ score, max = 10, size = 112, label = "Overall score", className }: ScoreRingProps) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const pct = score === null ? 0 : Math.max(0, Math.min(1, score / max));
  const tone = score === null ? "text-secondary" : { success: "text-success", warning: "text-warning", error: "text-error" }[scoreTone((score / max) * 10)];
  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={score === null ? `${label}: not available` : `${label}: ${score} out of ${max}`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="8" className="stroke-secondary/35" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          stroke="currentColor"
          className={cn(tone, "transition-[stroke-dasharray] duration-700")}
          strokeDasharray={`${pct * circumference} ${circumference}`}
        />
      </svg>
      <div className="relative text-center" aria-hidden>
        <div className="text-2xl font-semibold tabular-nums text-text">{score === null ? "—" : Number.isInteger(score) ? score : score.toFixed(1)}</div>
        <div className="text-[11px] text-muted">of {max}</div>
      </div>
    </div>
  );
}
