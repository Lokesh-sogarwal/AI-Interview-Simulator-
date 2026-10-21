import type { ReactNode } from "react";

import { cn } from "./cn";
import { scoreLabel } from "./Progress";

type ChartFrameProps = { title: string; description?: string; children: ReactNode; className?: string; summary?: ReactNode };

/**
 * Accessible chart wrapper: a <figure> with a visible title and a text
 * description so the information is available without seeing the graphic.
 */
export function ChartFrame({ title, description, children, className, summary }: ChartFrameProps) {
  return (
    <figure className={cn("grid gap-3", className)}>
      <figcaption>
        <p className="text-sm font-semibold text-text">{title}</p>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </figcaption>
      {children}
      {summary ? <div className="sr-only">{summary}</div> : null}
    </figure>
  );
}

type TrendPoint = { label: string; value: number };

/** Responsive line chart for 0-10 scores, with a data table fallback for screen readers. */
export function TrendChart({ points, max = 10, height = 160, title }: { points: TrendPoint[]; max?: number; height?: number; title: string }) {
  const width = 600;
  const pad = { top: 12, right: 12, bottom: 24, left: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (Math.max(0, Math.min(max, v)) / max) * innerH;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const ticks = [0, max / 2, max];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${title}. ${points.length} data points.`} preserveAspectRatio="none">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {t}
            </text>
          </g>
        ))}
        {points.length > 1 ? <path d={path} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className="stroke-primary" /> : null}
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={4} className="fill-surface stroke-primary" strokeWidth={2}>
            <title>{`${p.label}: ${p.value}/${max}`}</title>
          </circle>
        ))}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Session</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{p.label}</td>
              <td>{p.value}/{max}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Horizontal bars for score dimensions, labelled with value and qualitative text. */
export function ScoreBars({ items, max = 10 }: { items: Array<{ label: string; value: number | null }>; max?: number }) {
  return (
    <dl className="grid gap-3">
      {items.map((item) => {
        const pct = item.value === null ? 0 : Math.max(0, Math.min(100, (item.value / max) * 100));
        return (
          <div key={item.label} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="font-medium text-text">{item.label}</dt>
              <dd className="tabular-nums text-muted">
                {item.value === null ? (
                  "Not evaluated"
                ) : (
                  <>
                    <span className="font-semibold text-text">{Number.isInteger(item.value) ? item.value : item.value.toFixed(1)}</span>/{max}
                    <span className="ml-1.5 hidden text-xs sm:inline">· {scoreLabel((item.value / max) * 10)}</span>
                  </>
                )}
              </dd>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary/35" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </dl>
  );
}
