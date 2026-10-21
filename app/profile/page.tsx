"use client";

import Link from "next/link";
import { useState } from "react";
import { Award, BadgeCheck, ChartColumn, LogOut, Medal, Mic } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ChartFrame,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
  Progress,
  StatCard,
} from "@/app/components/ui";
import { STATUS_LABEL, formatDate, formatScore, statusTone } from "@/app/lib/format";
import { useApi } from "@/app/lib/useApi";
import { signOut } from "@/app/components/shell/signOut";

type Profile = {
  user: { id: string; email: string; name: string; isAdmin: boolean };
  metrics: {
    interviewScore: number;
    interviewCount: number;
    contestScore: number;
    contestCount: number;
    contestWins: number;
    eloRating: number;
    performance: string;
    consistency: number;
    overallScore: number;
  };
  stats: { totalInterviews: number; completedInterviews: number; acceptanceRate: number; totalContests: number; rank: number };
  breakdown: {
    byDifficulty: Record<string, number>;
    byType: Record<string, number>;
    byRole: Array<{ role: string; interviews: number; avgScore: number }>;
  };
  recentSubmissions: Array<{ id: string; role: string; type: string; difficulty: string; status?: string; score: number | null; createdAt: string }>;
};

function Distribution({ title, data, labels }: { title: string; data: Record<string, number>; labels: Record<string, string> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return (
    <ChartFrame title={title} summary={Object.entries(data).map(([k, v]) => `${labels[k] ?? k}: ${v}`).join(", ")}>
      <div className="grid gap-3">
        {Object.entries(labels).map(([key, label]) => (
          <Progress key={key} label={label} value={data[key] ?? 0} max={Math.max(1, total)} showValue />
        ))}
      </div>
    </ChartFrame>
  );
}

export default function ProfilePage() {
  const { data, error, loading, reload } = useApi<{ profile: Profile }>("/api/profile");
  const [signOutError, setSignOutError] = useState("");
  const profile = data?.profile;

  return (
    <PageContainer>
      <PageHeader
        title="Profile"
        description="Your account and a summary of your practice."
        actions={
          <Button
            variant="secondary"
            icon={<LogOut className="size-4" aria-hidden />}
            onClick={() => signOut().catch((e: Error) => setSignOutError(e.message))}
          >
            Sign out
          </Button>
        }
      />
      {signOutError ? <Alert tone="error" className="mb-6">{signOutError}</Alert> : null}
      {loading ? <LoadingState label="Loading profile…" /> : null}
      {error ? <ErrorState description={error} onRetry={reload} /> : null}

      {profile ? (
        <div className="grid gap-6">
          <Card>
            <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-lg font-semibold text-primary" aria-hidden>
                  {(profile.user.name || profile.user.email).charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-text">{profile.user.name || profile.user.email.split("@")[0]}</h2>
                  <p className="truncate text-sm text-muted">{profile.user.email}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone="accent">{profile.metrics.performance}</Badge>
                    {profile.stats.rank > 0 ? <Badge>Global rank #{profile.stats.rank}</Badge> : null}
                    {profile.user.isAdmin ? <Badge tone="info">Admin</Badge> : null}
                  </div>
                </div>
              </div>
              <ButtonLink href="/auth/verify" variant="secondary" size="sm" icon={<BadgeCheck className="size-4" aria-hidden />}>
                Verify email or phone
              </ButtonLink>
            </CardBody>
          </Card>

          <section aria-label="Statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Interviews started" value={profile.stats.totalInterviews} icon={<Mic className="size-4" />} />
            <StatCard label="Completed" value={profile.stats.completedInterviews} hint={`${profile.stats.acceptanceRate}% completion rate`} />
            <StatCard label="Avg interview score" value={profile.metrics.interviewCount ? `${formatScore(profile.metrics.interviewScore / 10)}/10` : "—"} icon={<ChartColumn className="size-4" />} />
            <StatCard label="Contest rating" value={profile.metrics.eloRating} hint={`${profile.stats.totalContests} contests · ${profile.metrics.contestWins} top-10% finishes`} icon={<Medal className="size-4" />} />
          </section>

          {profile.stats.totalInterviews === 0 ? (
            <EmptyState icon={<Award className="size-5" />} title="No practice data yet" description="Complete an interview to see your breakdown by type, difficulty and role." action={<ButtonLink href="/interview/setup">Start an interview</ButtonLink>} />
          ) : (
            <>
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader title="By interview type" as="h3" />
                  <CardBody>
                    <Distribution title="Sessions per type" data={profile.breakdown.byType} labels={{ hr: "HR", technical: "Technical", mixed: "Mixed" }} />
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="By difficulty" as="h3" />
                  <CardBody>
                    <Distribution title="Sessions per difficulty" data={profile.breakdown.byDifficulty} labels={{ easy: "Easy", medium: "Medium", hard: "Hard", adaptive: "Adaptive" }} />
                  </CardBody>
                </Card>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader title="Best roles" description="Average score by target role" as="h3" />
                  <CardBody>
                    {profile.breakdown.byRole.length ? (
                      <ul className="grid gap-3">
                        {profile.breakdown.byRole.map((r) => (
                          <li key={r.role}>
                            <Progress label={`${r.role} (${r.interviews} session${r.interviews === 1 ? "" : "s"})`} value={Math.round(r.avgScore) / 10} max={10} showValue />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted">No scored sessions yet.</p>
                    )}
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Recent sessions" as="h3" action={<ButtonLink href="/history" variant="ghost" size="sm">History</ButtonLink>} />
                  <ul className="divide-y divide-border">
                    {profile.recentSubmissions.map((s) => (
                      <li key={String(s.id)}>
                        <Link href={`/history/interviews/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-muted">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-text">{s.role || "Interview"}</span>
                            <span className="block text-xs text-muted">{[s.type, s.difficulty, formatDate(s.createdAt)].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {s.status ? <Badge tone={statusTone(s.status)}>{STATUS_LABEL[s.status] ?? s.status}</Badge> : null}
                            <span className="text-sm font-semibold tabular-nums text-text">{s.score !== null ? formatScore(s.score / 10) : "—"}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </>
          )}
        </div>
      ) : null}
    </PageContainer>
  );
}
