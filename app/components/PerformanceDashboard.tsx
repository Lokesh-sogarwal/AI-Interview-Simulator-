"use client";

import { ChartColumn } from "lucide-react";

import { Card, CardBody, CardHeader, ChartFrame, ErrorState, LoadingState, ScoreBars, StatCard, TrendChart } from "@/app/components/ui";
import { formatDate, formatScore } from "@/app/lib/format";
import { useApi } from "@/app/lib/useApi";

type Performance = {
  totalInterviews: number;
  averageScore: number | null;
  bestScore: number | null;
  worstScore: number | null;
  stats: Record<"technical" | "clarity" | "confidence" | "depth", number | null>;
  trend: Array<{ id: string; createdAt: string; score: number; role: string }>;
  insights: { bestMetric: string | null; worstMetric: string | null; change: number | null };
};

const LABEL: Record<string, string> = { technical: "Technical", clarity: "Clarity", confidence: "Confidence", depth: "Depth" };

/** Cross-session performance overview from /api/performance (0-10 scale). */
export default function PerformanceDashboard() {
  const { data, error, loading, reload } = useApi<Performance>("/api/performance");

  if (loading) return <LoadingState label="Loading performance…" rows={2} />;
  if (error) return <ErrorState description={error} onRetry={reload} />;
  if (!data || data.totalInterviews === 0) return null;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Scored sessions" value={data.totalInterviews} />
        <StatCard label="Average" value={data.averageScore != null ? `${formatScore(data.averageScore)}/10` : "—"} />
        <StatCard label="Best" value={data.bestScore != null ? `${formatScore(data.bestScore)}/10` : "—"} />
        <StatCard
          label="Change"
          value={data.insights.change != null ? `${data.insights.change >= 0 ? "+" : ""}${formatScore(data.insights.change)}` : "—"}
          hint={data.insights.change != null ? "First vs. latest session" : "Needs two sessions"}
        />
      </div>
      <Card>
        <CardHeader title="Across all sessions" icon={<ChartColumn className="size-4" />} />
        <CardBody className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <ChartFrame title="Score trend" description="Overall score per session, oldest first">
            <TrendChart title="Overall score by session" points={data.trend.map((t) => ({ label: `${formatDate(t.createdAt)}${t.role ? ` · ${t.role}` : ""}`, value: t.score }))} />
          </ChartFrame>
          <ChartFrame title="Average by dimension">
            <ScoreBars items={Object.entries(data.stats).map(([k, v]) => ({ label: LABEL[k], value: v }))} />
            {data.insights.bestMetric && data.insights.worstMetric ? (
              <p className="text-xs text-muted">
                Strongest: <span className="font-medium text-text">{LABEL[data.insights.bestMetric]}</span> · Weakest:{" "}
                <span className="font-medium text-text">{LABEL[data.insights.worstMetric]}</span>
              </p>
            ) : null}
          </ChartFrame>
        </CardBody>
      </Card>
    </div>
  );
}
