import type { Document } from "mongodb";

export type Dimension = "technical" | "clarity" | "confidence" | "depth";
export const DIMENSIONS: Dimension[] = ["technical", "clarity", "confidence", "depth"];

const EVAL_FIELD: Record<Dimension, string> = {
  technical: "technical_score",
  clarity: "clarity_score",
  confidence: "confidence_score",
  depth: "depth_score",
};

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function turnsOf(doc: Document): Array<{ evaluation?: Record<string, unknown> | null }> {
  if (Array.isArray(doc.turns)) return doc.turns;
  if (Array.isArray(doc.transcript)) return doc.transcript;
  return [];
}

/**
 * Scores (0-10) for one interview document, from whichever shape it has:
 * live sessions (`averageScore` + `turns`) or legacy saves (`totalScore` 0-100,
 * `breakdown`, `transcript`). Returns null when the interview has no scores.
 */
export function interviewScores(doc: Document): { overall: number; dims: Partial<Record<Dimension, number>> } | null {
  const evals = turnsOf(doc)
    .map((t) => t?.evaluation)
    .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === "object"));

  const dims: Partial<Record<Dimension, number>> = {};
  for (const d of DIMENSIONS) {
    const fromTurns = mean(evals.map((e) => Number(e[EVAL_FIELD[d]])).filter(Number.isFinite));
    const legacy = Number(doc.breakdown?.[d]);
    const value = fromTurns ?? (Number.isFinite(legacy) ? legacy : null);
    if (value !== null) dims[d] = round1(value);
  }

  let overall: number | null = null;
  if (typeof doc.averageScore === "number" && Number.isFinite(doc.averageScore)) overall = doc.averageScore;
  else if (typeof doc.totalScore === "number" && doc.totalScore > 0) overall = doc.totalScore / 10;
  else overall = mean(evals.map((e) => Number(e.overall_score)).filter(Number.isFinite));

  return overall === null ? null : { overall: round1(overall), dims };
}

export function summarizePerformance(docs: Document[]) {
  const scored = docs
    .map((doc) => ({ doc, scores: interviewScores(doc) }))
    .filter((x): x is { doc: Document; scores: NonNullable<ReturnType<typeof interviewScores>> } => x.scores !== null);

  const overall = scored.map((s) => s.scores.overall);
  const stats = Object.fromEntries(
    DIMENSIONS.map((d) => {
      const m = mean(scored.map((s) => s.scores.dims[d]).filter((n): n is number => typeof n === "number"));
      return [d, m === null ? null : round1(m)];
    }),
  ) as Record<Dimension, number | null>;

  const ranked = DIMENSIONS.filter((d) => stats[d] !== null).sort((a, b) => (stats[b] ?? 0) - (stats[a] ?? 0));

  // Oldest → newest, last 12 scored sessions.
  const chronological = [...scored].sort(
    (a, b) => new Date(a.doc.completedAt ?? a.doc.createdAt ?? 0).getTime() - new Date(b.doc.completedAt ?? b.doc.createdAt ?? 0).getTime(),
  );
  const trend = chronological.slice(-12).map((s) => ({
    id: String(s.doc._id),
    createdAt: new Date(s.doc.completedAt ?? s.doc.createdAt ?? 0).toISOString(),
    score: s.scores.overall,
    role: String(s.doc.role ?? ""),
    type: String(s.doc.type ?? ""),
  }));

  const first = chronological[0]?.scores.overall;
  const last = chronological[chronological.length - 1]?.scores.overall;

  return {
    scoredInterviews: scored.length,
    averageScore: overall.length ? round1(mean(overall) ?? 0) : null,
    bestScore: overall.length ? Math.max(...overall) : null,
    worstScore: overall.length ? Math.min(...overall) : null,
    stats,
    trend,
    insights: {
      bestMetric: ranked[0] ?? null,
      worstMetric: ranked.length > 1 ? ranked[ranked.length - 1] : null,
      // Change in points (0-10) between the first and the latest scored session.
      change: chronological.length > 1 && first !== undefined && last !== undefined ? round1(last - first) : null,
    },
  };
}
