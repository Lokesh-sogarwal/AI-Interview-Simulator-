"use client";

import { ChartColumn, Medal } from "lucide-react";

import { ButtonLink, Card, CardBody, CardHeader, ErrorState, LoadingState, PageContainer, PageHeader, Progress, StatCard } from "@/app/components/ui";
import { useApi } from "@/app/lib/useApi";

type Stats = {
  stats: { rating: number; contestsEntered: number; contestsCompleted: number; totalScore: number; averageContestScore: number; contestWins: number; rank: number; totalRanked: number };
};

const TIERS = [
  { min: 1500, label: "Master" },
  { min: 1400, label: "Expert" },
  { min: 1300, label: "Advanced" },
  { min: 1200, label: "Intermediate" },
];

export default function RatingsPage() {
  const { data, error, loading, reload } = useApi<Stats>("/api/users/stats");
  const s = data?.stats;
  const tier = s ? TIERS.find((t) => s.rating >= t.min)?.label ?? "Beginner" : null;
  const next = s ? [...TIERS].reverse().find((t) => t.min > s.rating) : null;

  return (
    <PageContainer>
      <PageHeader
        title="Contest rating"
        description="Your rating grows with every contest problem you solve."
        actions={<ButtonLink href="/contests" icon={<Medal className="size-4" aria-hidden />}>Browse contests</ButtonLink>}
      />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState description={error} onRetry={reload} /> : null}
      {s ? (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Rating" value={s.rating} hint={tier ?? undefined} icon={<ChartColumn className="size-4" />} />
            <StatCard label="Rank by rating" value={s.rank ? `#${s.rank}` : "—"} hint={s.totalRanked ? `of ${s.totalRanked} users` : undefined} />
            <StatCard label="Contests entered" value={s.contestsEntered} hint={`${s.contestsCompleted} fully solved`} />
            <StatCard label="Top-10% finishes" value={s.contestWins} />
          </div>
          <Card>
            <CardHeader title="Progress to the next tier" />
            <CardBody className="grid gap-4">
              {next ? (
                <Progress label={`${next.min - s.rating} points to ${next.label}`} value={s.rating - 1200} max={next.min - 1200} showValue={false} />
              ) : (
                <p className="text-sm text-text">You are in the top tier.</p>
              )}
              <p className="text-sm text-muted">{next ? `${next.min - s.rating} points to ${next.label}.` : null}</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="How ratings work" />
            <CardBody className="grid gap-2 text-sm text-muted">
              <p>Everyone starts at 1200. For each contest you enter, half of your contest score is added (solving every problem scores 100, which adds 50 points).</p>
              <p>Finishing in the top 10% of a contest adds 10 more points. Contest scores are calculated on the server from your accepted submissions.</p>
              <p>Tiers: Intermediate 1200+, Advanced 1300+, Expert 1400+, Master 1500+.</p>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </PageContainer>
  );
}
