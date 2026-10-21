"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";

import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
  StatCard,
  Tabs,
  cn,
} from "@/app/components/ui";
import { formatScore } from "@/app/lib/format";
import { useApi } from "@/app/lib/useApi";

type Entry = {
  rank: number;
  userId: string;
  userName: string;
  metrics: { interviewScore: number; interviewCount: number; contestCount: number; eloRating: number; performance: string; overallScore: number };
};
type Board = { leaderboard: Entry[]; pagination: { page: number; limit: number; total: number; totalPages: number }; userRank: number | null; userTotalRank: number | null };
type Stats = { stats: { rating: number; contestsEntered: number; contestsCompleted: number; averageContestScore: number; rank: number; totalRanked: number } };

export default function LeaderboardPage() {
  const [tab, setTab] = useState<"global" | "me">("global");
  const [page, setPage] = useState(1);
  const board = useApi<Board>(`/api/leaderboard/global?page=${page}&limit=25`);
  const me = useApi<{ user: { id: string } }>("/api/user");
  const stats = useApi<Stats>("/api/users/stats");
  const myId = me.data?.user.id;

  return (
    <PageContainer>
      <PageHeader
        title="Leaderboard"
        description="Rankings combine interview scores, contest results, consistency and recent activity."
        actions={<Tabs label="Leaderboard view" value={tab} onChange={setTab} tabs={[{ value: "global", label: "Global" }, { value: "me", label: "My standing" }]} />}
      />

      {tab === "me" ? (
        <div className="grid gap-6">
          {stats.loading || board.loading ? <LoadingState rows={1} /> : null}
          {stats.error ? <ErrorState description={stats.error} onRetry={stats.reload} /> : null}
          {stats.data ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Overall rank" value={board.data?.userRank ? `#${board.data.userRank}` : "—"} hint={board.data?.userTotalRank ? `of ${board.data.userTotalRank} users` : undefined} />
              <StatCard label="Contest rating" value={stats.data.stats.rating} hint={stats.data.stats.rank ? `#${stats.data.stats.rank} by rating` : undefined} />
              <StatCard label="Contests entered" value={stats.data.stats.contestsEntered} hint={`${stats.data.stats.contestsCompleted} fully solved`} />
              <StatCard label="Avg contest score" value={stats.data.stats.contestsEntered ? `${stats.data.stats.averageContestScore}%` : "—"} />
            </div>
          ) : null}
          <Card>
            <CardBody className="grid gap-2 text-sm text-text">
              <p className="font-semibold">How the overall score is calculated</p>
              <ul className="grid gap-1 text-muted">
                <li>25% average interview score (completed sessions)</li>
                <li>25% average contest score</li>
                <li>30% contest rating</li>
                <li>10% consistency of your interview scores</li>
                <li>10% recent activity</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      ) : (
        <>
          {board.loading ? <LoadingState label="Loading leaderboard…" /> : null}
          {board.error ? <ErrorState description={board.error} onRetry={board.reload} /> : null}
          {board.data && board.data.leaderboard.length === 0 ? (
            <EmptyState icon={<Trophy className="size-5" />} title="No rankings yet" description="Rankings appear once people complete interviews or contests." action={<ButtonLink href="/interview/setup">Start an interview</ButtonLink>} />
          ) : null}
          {board.data && board.data.leaderboard.length > 0 ? (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <caption className="sr-only">Global leaderboard, page {board.data.pagination.page}</caption>
                  <thead className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3">Rank</th>
                      <th scope="col" className="px-3 py-3">Name</th>
                      <th scope="col" className="px-3 py-3">Level</th>
                      <th scope="col" className="px-3 py-3 text-right">Interviews</th>
                      <th scope="col" className="px-3 py-3 text-right">Avg score</th>
                      <th scope="col" className="px-3 py-3 text-right">Rating</th>
                      <th scope="col" className="px-5 py-3 text-right">Overall</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {board.data.leaderboard.map((e) => {
                      const mine = e.userId === myId;
                      return (
                        <tr key={e.userId} className={cn(mine && "bg-accent/40")} aria-current={mine ? "true" : undefined}>
                          <td className="px-5 py-3 font-semibold tabular-nums text-text">
                            {e.rank <= 3 ? <Trophy className={cn("mr-1.5 inline size-4", e.rank === 1 ? "text-warning" : "text-muted")} aria-hidden /> : null}#{e.rank}
                          </td>
                          <td className="px-3 py-3 font-medium text-text">
                            {e.userName}
                            {mine ? <Badge tone="accent" className="ml-2">You</Badge> : null}
                          </td>
                          <td className="px-3 py-3 text-muted">{e.metrics.performance}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{e.metrics.interviewCount}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{e.metrics.interviewCount ? `${formatScore(e.metrics.interviewScore / 10)}/10` : "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{e.metrics.eloRating}</td>
                          <td className="px-5 py-3 text-right font-semibold tabular-nums text-text">{e.metrics.overallScore}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {board.data.pagination.totalPages > 1 ? (
                <CardBody className="flex items-center justify-between border-t border-border text-sm">
                  <span className="text-muted">
                    Page {board.data.pagination.page} of {board.data.pagination.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="size-4" aria-hidden />}>
                      Previous
                    </Button>
                    <Button size="sm" variant="secondary" disabled={page >= board.data.pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="flex-row-reverse" icon={<ChevronRight className="size-4" aria-hidden />}>
                      Next
                    </Button>
                  </div>
                </CardBody>
              ) : null}
            </Card>
          ) : null}
        </>
      )}
    </PageContainer>
  );
}
