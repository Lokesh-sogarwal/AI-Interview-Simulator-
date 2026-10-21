"use client";

import Link from "next/link";
import { use, useState } from "react";
import { CircleCheck, ChevronLeft, ChevronRight, CodeXml, Trophy } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
  StatCard,
  cn,
} from "@/app/components/ui";
import { formatDateTime } from "@/app/lib/format";
import { postJson, useApi } from "@/app/lib/useApi";

type ContestDetail = {
  _id: string;
  name: string;
  description?: string;
  rules?: string;
  startDate: string;
  endDate: string;
  isRegistered: boolean;
  participantCount: number;
  maxParticipants?: number;
  problems: Array<{ title: string; difficulty: string }>;
  myScore: number | null;
  solvedProblems: number[];
  phase: "upcoming" | "active" | "ended";
};

type Board = {
  leaderboard: Array<{ rank: number; userId: string; username: string; isMe: boolean; score: number; solvedCount: number; status: string }>;
  totalPages: number;
  total: number;
};

const PHASE_LABEL = { active: "Live", upcoming: "Upcoming", ended: "Ended" } as const;

export default function ContestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [page, setPage] = useState(1);
  const contest = useApi<{ contest: ContestDetail }>(`/api/contests/${encodeURIComponent(id)}/register`);
  const board = useApi<Board>(`/api/contests/${encodeURIComponent(id)}/leaderboard?page=${page}`);
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState("");

  const c = contest.data?.contest;

  async function register() {
    setRegistering(true);
    setRegError("");
    const res = await postJson(`/api/contests/${encodeURIComponent(id)}/register`, {}).catch(() => null);
    if (!res?.ok) setRegError(res?.data?.error || "Registration failed.");
    else {
      contest.reload();
      board.reload();
    }
    setRegistering(false);
  }

  if (contest.loading) return <PageContainer><LoadingState label="Loading contest…" /></PageContainer>;
  if (contest.error || !c) {
    return (
      <PageContainer width="narrow">
        <ErrorState title="Contest unavailable" description={contest.error || "Contest not found."} onRetry={contest.reload} />
        <ButtonLink href="/contests" variant="secondary" className="mt-4">Back to contests</ButtonLink>
      </PageContainer>
    );
  }

  const canSolve = c.isRegistered && c.phase === "active";
  const solved = new Set(c.solvedProblems ?? []);

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ label: "Contests", href: "/contests" }, { label: c.name }]}
        title={c.name}
        description={c.description}
        actions={
          !c.isRegistered && c.phase !== "ended" ? (
            <Button onClick={register} loading={registering}>Register</Button>
          ) : canSolve && c.problems.length ? (
            <ButtonLink href={`/contests/challenge?contestId=${encodeURIComponent(id)}&problemIndex=0`} icon={<CodeXml className="size-4" aria-hidden />}>
              Start solving
            </ButtonLink>
          ) : undefined
        }
      />
      {regError ? <Alert tone="error" className="mb-4">{regError}</Alert> : null}
      {c.phase === "upcoming" ? <Alert tone="info" className="mb-4">Problems unlock when the contest starts on {formatDateTime(c.startDate)}.</Alert> : null}
      {c.phase === "ended" ? <Alert tone="info" className="mb-4">This contest has ended. Submissions are closed.</Alert> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Status" value={PHASE_LABEL[c.phase]} hint={`Ends ${formatDateTime(c.endDate)}`} />
        <StatCard label="Participants" value={c.participantCount} hint={c.maxParticipants ? `of ${c.maxParticipants}` : undefined} />
        <StatCard label="Problems" value={c.problems.length} />
        <StatCard label="Your score" value={c.isRegistered ? `${c.myScore ?? 0}%` : "—"} hint={c.isRegistered ? `${solved.size} solved` : "Not registered"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader title="Problems" icon={<CodeXml className="size-4" />} />
            {c.problems.length === 0 ? (
              <CardBody><p className="text-sm text-muted">This contest has no problems yet.</p></CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {c.problems.map((p, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">
                        {idx + 1}. {p.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge tone={p.difficulty === "Easy" ? "success" : p.difficulty === "Medium" ? "warning" : "error"}>{p.difficulty}</Badge>
                        {solved.has(idx) ? <Badge tone="success" icon={<CircleCheck className="size-3" aria-hidden />}>Solved</Badge> : null}
                      </div>
                    </div>
                    {canSolve ? (
                      <ButtonLink href={`/contests/challenge?contestId=${encodeURIComponent(id)}&problemIndex=${idx}`} size="sm" variant={solved.has(idx) ? "secondary" : "primary"}>
                        {solved.has(idx) ? "Revisit" : "Solve"}
                      </ButtonLink>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {c.rules ? (
            <Card>
              <CardHeader title="Rules" />
              <CardBody><p className="whitespace-pre-wrap text-sm leading-6 text-text">{c.rules}</p></CardBody>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader title="Leaderboard" description="Score = share of problems solved; ties go to whoever got there first." icon={<Trophy className="size-4" />} />
          {board.loading ? <CardBody><LoadingState rows={2} /></CardBody> : null}
          {board.error ? <CardBody><ErrorState description={board.error} onRetry={board.reload} /></CardBody> : null}
          {board.data && board.data.leaderboard.length === 0 ? (
            <CardBody><EmptyState title="No participants yet" /></CardBody>
          ) : null}
          {board.data && board.data.leaderboard.length > 0 ? (
            <>
              <ol className="divide-y divide-border">
                {board.data.leaderboard.map((e) => (
                  <li key={e.userId} className={cn("flex items-center justify-between gap-3 px-5 py-2.5 text-sm", e.isMe && "bg-accent/40")}>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="w-8 shrink-0 font-semibold tabular-nums text-muted">#{e.rank}</span>
                      <span className="truncate font-medium text-text">
                        {e.username}
                        {e.isMe ? <span className="ml-1.5 text-xs text-muted">(you)</span> : null}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-text">
                      <span className="font-semibold">{e.score}%</span>
                      <span className="ml-2 text-xs text-muted">{e.solvedCount} solved</span>
                    </span>
                  </li>
                ))}
              </ol>
              {board.data.totalPages > 1 ? (
                <CardBody className="flex items-center justify-between border-t border-border text-sm">
                  <span className="text-muted">Page {page} of {board.data.totalPages}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="size-4" aria-hidden />}>Previous</Button>
                    <Button size="sm" variant="secondary" disabled={page >= board.data.totalPages} onClick={() => setPage((p) => p + 1)} className="flex-row-reverse" icon={<ChevronRight className="size-4" aria-hidden />}>Next</Button>
                  </div>
                </CardBody>
              ) : null}
            </>
          ) : null}
        </Card>
      </div>
      <p className="mt-6 text-sm text-muted">
        <Link href="/contests" className="underline underline-offset-2 hover:text-text">All contests</Link>
      </p>
    </PageContainer>
  );
}
