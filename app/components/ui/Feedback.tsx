import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

import { cn } from "./cn";

type Tone = "neutral" | "info" | "success" | "warning" | "error" | "accent";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-background text-text border-border",
  info: "bg-secondary/30 text-primary border-secondary",
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  error: "bg-error-soft text-error border-error/25",
  accent: "bg-accent text-primary border-accent",
};

export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", badgeTones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const alertIcons = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
} as const;

type AlertProps = {
  tone?: keyof typeof alertIcons;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** Inline notification. Errors are announced assertively, others politely. */
export function Alert({ tone = "info", title, children, action, className }: AlertProps) {
  const Icon = alertIcons[tone];
  const tones = {
    info: "border-secondary bg-secondary/20",
    success: "border-success/30 bg-success-soft",
    warning: "border-warning/30 bg-warning-soft",
    error: "border-error/30 bg-error-soft",
  };
  const iconTone = { info: "text-primary", success: "text-success", warning: "text-warning", error: "text-error" };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-control border px-4 py-3 text-sm text-text", tones[tone], className)}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconTone[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? "mt-0.5" : "", "text-text/90")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("ui-skeleton rounded-md", className)} aria-hidden />;
}

/** Accessible loading block: visual skeletons plus a screen-reader label. */
export function LoadingState({ label = "Loading…", rows = 3, className }: { label?: string; rows?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3", className)} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-16", i === 0 && "h-24")} />
      ))}
    </div>
  );
}

type EmptyStateProps = { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string };

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong bg-surface/60 px-6 py-10 text-center", className)}>
      {icon ? (
        <span className="grid size-11 place-items-center rounded-xl bg-accent/70 text-primary" aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="max-w-md">
        <p className="text-base font-semibold text-text">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, onRetry, className }: { title?: string; description?: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <Alert
      tone="error"
      title={title}
      className={className}
      action={
        onRetry ? (
          <button type="button" onClick={onRetry} className="rounded-md px-2 py-1 text-sm font-semibold text-error underline-offset-2 hover:underline">
            Retry
          </button>
        ) : undefined
      }
    >
      {description}
    </Alert>
  );
}
