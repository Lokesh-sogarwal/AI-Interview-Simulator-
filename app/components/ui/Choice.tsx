"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";

import { cn } from "./cn";

type Option<T extends string> = { value: T; label: ReactNode; description?: ReactNode; icon?: ReactNode; disabled?: boolean };

type OptionCardsProps<T extends string> = {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  columns?: 2 | 3 | 4;
  className?: string;
};

/**
 * Card-style radio group (WAI-ARIA radiogroup): Arrow keys move the selection,
 * Tab enters/leaves the group, and the selected state is shown with a check
 * mark as well as colour.
 */
export function OptionCards<T extends string>({ label, value, options, onChange, columns = 3, className }: OptionCardsProps<T>) {
  const labelId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.filter((o) => !o.disabled);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const current = enabled.findIndex((o) => o.value === options[index].value);
    const next = enabled[(current + dir + enabled.length) % enabled.length];
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  }

  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];

  return (
    <div className={cn("grid gap-2", className)}>
      <p id={labelId} className="text-sm font-medium text-text">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className={cn("grid grid-cols-1 gap-2", cols)}>
        {options.map((opt, i) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={opt.disabled}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "relative flex min-h-16 items-start gap-3 rounded-control border bg-surface p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                selected ? "border-primary bg-accent/35 ring-1 ring-primary" : "border-border-strong hover:border-primary/50 hover:bg-surface-muted",
              )}
            >
              {opt.icon ? (
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", selected ? "bg-primary text-on-primary" : "bg-background text-primary")} aria-hidden>
                  {opt.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text">{opt.label}</span>
                {opt.description ? <span className="mt-0.5 block text-xs leading-5 text-muted">{opt.description}</span> : null}
              </span>
              <span
                className={cn("grid size-5 shrink-0 place-items-center rounded-full border", selected ? "border-primary bg-primary text-on-primary" : "border-border-strong")}
                aria-hidden
              >
                {selected ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type TabsProps<T extends string> = {
  label: string;
  value: T;
  tabs: Array<{ value: T; label: ReactNode; count?: number }>;
  onChange: (value: T) => void;
  className?: string;
};

/** Filter/tab control (WAI-ARIA tablist with arrow-key navigation). */
export function Tabs<T extends string>({ label, value, tabs, onChange, className }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-control border border-border bg-surface p-1", className)}>
      {tabs.map((tab, i) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
              selected ? "bg-primary text-on-primary" : "text-muted hover:bg-background hover:text-text",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", selected ? "bg-on-primary/20" : "bg-background")}>{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
