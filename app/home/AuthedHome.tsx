"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarClock, ChartColumn, CircleCheck, Flame, Medal, Mic, Target, Trophy } from "lucide-react";

import StartScheduledButton from "@/app/dashboard/StartScheduledButton";
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
  ScoreBars,
  StatCard,
  TrendChart,
} from "@/app/components/ui";
import { postJson, useApi } from "@/app/lib/useApi";
import { STATUS_LABEL, formatDate, formatDateTime, formatScore, statusTone } from "@/app/lib/format";

type InterviewListItem = {
  _id: string;
  role?: string;
  type?: string;
  difficulty?: string;
  status?: string;
  experience?: string;
  company?: string;
  focusAreas?: string;
  interactionMode?: "typing" | "video";
  useResume?: boolean;
  averageScore?: number | null;
  totalScore?: number | null;
  createdAt?: string;
  completedAt?: string;
  scheduledFor?: string;
  finalReport?: { weaknesses?: string[]; strengths?: string[] } | null;
  turns?: Array<{ evaluation?: { improvement?: string } | null }>;
};

type Performance = {
  totalInterviews: number;
  averageScore: number | null;
  bestScore: number | null;
  stats: Record<"technical" | "clarity" | "confidence" | "depth", number | null>;
  trend: Array<{ id: string; createdAt: string; score: number; role: string }>;
  insights: { bestMetric: string | null; worstMetric: string | null; change: number | null };
};

type Gamification = { points: number; level: number; streak: number; badges: string[] };
type Challenge = { id: string; title: string; description: string; reward: number; completed: boolean; eligible: boolean };
type UserStats = { stats: { rating: number; contestsEntered: number; contestsCompleted: number } };

const DIM_LABEL: Record<string, string> = { technical: "Technical", clarity: "Clarity", confidence: "Confidence", depth: "Depth" };

function scoreOf(i: InterviewListItem) {
  if (typeof i.averageScore === "number") return i.averageScore;
  if (typeof i.totalScore === "number" && i.totalScore > 0) return i.totalScore / 10;
  return null;
}

function isDue(iso: string) {
  return Date.parse(iso) <= Date.now();
}

function Challenges() {
  const { data, error, loading, reload } = useApi<{ challenges: Challenge[] }>("/api/gamification/challenges");
  const [claiming, setClaiming] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function claim(id: string) {
    setClaiming(id);
    setMessage(null);
    const res = await postJson<{ message?: string }>("/api/gamification/challenges", { challengeId: id });
    setMessage({ tone: res.ok ? "success" : "error", text: res.data?.message || res.data?.error || "Could not claim this challenge." });
    setClaiming(null);
    if (res.ok) reload();
  }

  return (
    <Card>
      <CardHeader title="Daily challenges" description="Rewards unlock when your recorded activity meets the goal." icon={<Target className="size-4" />} />
      <CardBody className="grid gap-3">
        {loading ? <LoadingState rows={2} label="Loading challenges…" /> : null}
        {error ? <ErrorState description={error} onRetry={reload} /> : null}
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
        {data?.challenges.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-control border border-border px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">{c.title}</p>
              <p className="text-xs text-muted">
                {c.description} · {c.reward} pts
              </p>
            </div>
            {c.completed ? (
              <Badge tone="success" icon={<CircleCheck className="size-3" aria-hidden />}>
                Claimed
              </Badge>
            ) : c.eligible ? (
              <Button size="sm" variant="accent" loading={claiming === c.id} onClick={() => claim(c.id)}>
                Claim
              </Button>
            ) : (
              <Badge>Not yet</Badge>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export default function AuthedHome() {
  const user = useApi<{ user: { name?: string } }>("/api/user");
  const interviews = useApi<{ interviews: InterviewListItem[] }>("/api/interviews?limit=50");
  const perf = useApi<Performance>("/api/performance");
  const game = useApi<Gamification>("/api/gamification/stats");
  const coding = useApi<UserStats>("/api/users/stats");

  const firstName = user.data?.user?.name?.trim().split(/\s+/)[0];
  const all = interviews.data?.interviews ?? [];
  const upcoming = all
    .filter((i) => i.status === "scheduled" && i.scheduledFor)
    .sort((a, b) => Date.parse(a.scheduledFor!) - Date.parse(b.scheduledFor!));
  const recent = all.filter((i) => i.status !== "scheduled").slice(0, 5);
  const latestCompleted = all.find((i) => i.status === "completed");
  const focusItems = (
    latestCompleted?.finalReport?.weaknesses?.length
      ? latestCompleted.finalReport.weaknesses
      : (latestCompleted?.turns ?? []).map((t) => t.evaluation?.improvement || "").filter(Boolean)
  ).slice(0, 3);

  const isNewUser = !interviews.loading && !interviews.error && all.length === 0;
  const p = perf.data;

  return (
    <PageContainer>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="Pick up where you left off, or start a new mock interview."
        actions={
          <ButtonLink href="/interview/setup" icon={<Mic className="size-4" aria-hidden />}>
            Start interview
          </ButtonLink>
        }
      />

      {isNewUser ? (
        <EmptyState
          className="mb-8"
          icon={<Mic className="size-5" />}
          title="Run your first mock interview"
          description="Choose an interview type and difficulty, optionally add your resume, and answer one question at a time. Your scores and feedback will appear here."
          action={
            <ButtonLink href="/interview/setup" icon={<ArrowRight className="size-4" aria-hidden />}>
              Set up an interview
            </ButtonLink>
          }
        />
      ) : null}

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Completed interviews" icon={<CircleCheck className="size-4" />} value={perf.loading ? "…" : p ? p.totalInterviews : "—"} />
        <StatCard
          label="Average score"
          icon={<ChartColumn className="size-4" />}
          value={perf.loading ? "…" : p?.averageScore != null ? `${formatScore(p.averageScore)}/10` : "—"}
          hint={p?.insights.change != null ? `${p.insights.change >= 0 ? "+" : ""}${formatScore(p.insights.change)} since your first session` : undefined}
        />
        <StatCard label="Best score" icon={<Trophy className="size-4" />} value={perf.loading ? "…" : p?.bestScore != null ? `${formatScore(p.bestScore)}/10` : "—"} />
        <StatCard
          label="Practice streak"
          icon={<Flame className="size-4" />}
          value={game.loading ? "…" : game.data ? `${game.data.streak} day${game.data.streak === 1 ? "" : "s"}` : "—"}
          hint={game.data ? `${game.data.points} points · level ${game.data.level}` : undefined}
        />
      </section>
      {perf.error ? <ErrorState className="mt-3" description={perf.error} onRetry={perf.reload} /> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="Progress" description="Overall score of your completed sessions (0–10)." icon={<ChartColumn className="size-4" />} />
            <CardBody>
              {perf.loading ? (
                <LoadingState rows={1} label="Loading progress…" />
              ) : p && p.trend.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
                  <ChartFrame title="Score trend" description={`Last ${p.trend.length} scored session${p.trend.length === 1 ? "" : "s"}, oldest first`}>
                    <TrendChart title="Overall score by session" points={p.trend.map((t) => ({ label: `${formatDate(t.createdAt)}${t.role ? ` · ${t.role}` : ""}`, value: t.score }))} />
                  </ChartFrame>
                  <ChartFrame title="Score breakdown" description="Average across scored answers">
                    <ScoreBars items={Object.entries(p.stats).map(([k, v]) => ({ label: DIM_LABEL[k], value: v }))} />
                  </ChartFrame>
                </div>
              ) : (
                <p className="text-sm text-muted">Complete an interview to see your score trend and breakdown.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent sessions"
              icon={<Mic className="size-4" />}
              action={
                <ButtonLink href="/history" variant="ghost" size="sm">
                  View all
                </ButtonLink>
              }
            />
            <CardBody className="p-0">
              {interviews.loading ? <LoadingState className="p-5" rows={3} label="Loading sessions…" /> : null}
              {interviews.error ? <ErrorState className="m-5" description={interviews.error} onRetry={interviews.reload} /> : null}
              {!interviews.loading && !interviews.error && recent.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No sessions yet.</p> : null}
              <ul className="divide-y divide-border">
                {recent.map((i) => {
                  const score = scoreOf(i);
                  return (
                    <li key={i._id}>
                      <Link href={`/history/interviews/${i._id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-surface-muted">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text">{i.role || "Interview"}</p>
                          <p className="text-xs text-muted">
                            {[i.type, i.difficulty, formatDate(i.completedAt || i.createdAt)].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <Badge tone={statusTone(i.status)}>{STATUS_LABEL[i.status || ""] || "Saved"}</Badge>
                          <span className="w-12 text-right text-sm font-semibold tabular-nums text-text">{score !== null ? formatScore(score) : "—"}</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          {upcoming.length > 0 ? (
            <Card>
              <CardHeader title="Upcoming" description="Scheduled interviews" icon={<CalendarClock className="size-4" />} />
              <CardBody className="grid gap-3">
                {upcoming.slice(0, 3).map((i) => {
                  const ready = isDue(i.scheduledFor!);
                  return (
                    <div key={i._id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text">{i.role}</p>
                        <p className="text-xs text-muted">{formatDateTime(i.scheduledFor)}</p>
                      </div>
                      <StartScheduledButton
                        disabled={!ready}
                        details={{
                          id: i._id,
                          type: i.type || "Mixed",
                          role: i.role || "",
                          experience: i.experience || "",
                          difficulty: i.difficulty || "Adaptive",
                          company: i.company,
                          focusAreas: i.focusAreas,
                          interactionMode: i.interactionMode,
                          useResume: i.useResume,
                        }}
                      />
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Focus next" description={latestCompleted ? `From your ${formatDate(latestCompleted.completedAt || latestCompleted.createdAt)} session` : undefined} icon={<Target className="size-4" />} />
            <CardBody>
              {focusItems.length ? (
                <ul className="grid gap-2.5">
                  {focusItems.map((f, idx) => (
                    <li key={idx} className="flex gap-2.5 text-sm text-text">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Improvement suggestions from your latest completed interview will show here.</p>
              )}
              {p?.insights.worstMetric ? (
                <p className="mt-3 text-xs text-muted">
                  Weakest dimension so far: <span className="font-medium text-text">{DIM_LABEL[p.insights.worstMetric]}</span>
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Challenges />

          <Card>
            <CardHeader title="Coding contests" icon={<Medal className="size-4" />} />
            <CardBody className="grid gap-3">
              {coding.data ? (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted">Rating</dt>
                    <dd className="text-lg font-semibold tabular-nums text-text">{coding.data.stats.rating}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Contests entered</dt>
                    <dd className="text-lg font-semibold tabular-nums text-text">{coding.data.stats.contestsEntered}</dd>
                  </div>
                </dl>
              ) : coding.loading ? (
                <LoadingState rows={1} />
              ) : (
                <p className="text-sm text-muted">Contest stats are unavailable right now.</p>
              )}
              <ButtonLink href="/contests" variant="secondary" size="sm">
                Browse contests
              </ButtonLink>
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
