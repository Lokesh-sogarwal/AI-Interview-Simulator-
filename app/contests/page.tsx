"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, CodeXml, Medal, Users } from "lucide-react";

import { Alert, Badge, Button, ButtonLink, Card, CardBody, EmptyState, ErrorState, LoadingState, PageContainer, PageHeader, Tabs } from "@/app/components/ui";
import { formatDateTime } from "@/app/lib/format";
import { postJson, useApi } from "@/app/lib/useApi";

type Contest = {
  _id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  isRegistered: boolean;
  participantCount: number;
  maxParticipants?: number;
  problems: Array<{ title: string; difficulty: string }>;
  problemCount?: number;
  frequency?: string;
};

type Phase = "active" | "upcoming" | "ended";

function phaseOf(c: Contest, now: number): Phase {
  if (now < Date.parse(c.startDate)) return "upcoming";
  if (now > Date.parse(c.endDate)) return "ended";
  return "active";
}

const PHASE_LABEL: Record<Phase, string> = { active: "Live", upcoming: "Upcoming", ended: "Ended" };
const PHASE_TONE = { active: "success", upcoming: "info", ended: "neutral" } as const;

export default function ContestsPage() {
  const { data, error, loading, reload } = useApi<{ contests: Contest[] }>("/api/contests");
  const [filter, setFilter] = useState<"all" | Phase>("all");
  const [registering, setRegistering] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [now] = useState(() => Date.now());

  const contests = useMemo(() => data?.contests ?? [], [data]);
  const counts = useMemo(() => {
    const c = { all: contests.length, active: 0, upcoming: 0, ended: 0 };
    contests.forEach((x) => (c[phaseOf(x, now)] += 1));
    return c;
  }, [contests, now]);
  const visible = contests.filter((c) => filter === "all" || phaseOf(c, now) === filter);

  async function register(id: string) {
    setRegistering(id);
    setMessage(null);
    try {
      const res = await postJson(`/api/contests/${id}/register`, {});
      setMessage(res.ok ? { tone: "success", text: "You’re registered." } : { tone: "error", text: res.data?.error || "Registration failed." });
      if (res.ok) reload();
    } catch {
      setMessage({ tone: "error", text: "Could not reach the server." });
    } finally {
      setRegistering(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Coding contests"
        description="Register, solve problems in Python, JavaScript, C++ or Java, and climb the contest leaderboard."
        actions={<ButtonLink href="/ratings" variant="secondary">Your rating</ButtonLink>}
      />

      <Tabs
        label="Filter contests"
        value={filter}
        onChange={setFilter}
        className="mb-4"
        tabs={[
          { value: "all", label: "All", count: counts.all },
          { value: "active", label: "Live", count: counts.active },
          { value: "upcoming", label: "Upcoming", count: counts.upcoming },
          { value: "ended", label: "Ended", count: counts.ended },
        ]}
      />
      {message ? <Alert tone={message.tone} className="mb-4">{message.text}</Alert> : null}
      {loading ? <LoadingState label="Loading contests…" /> : null}
      {error ? <ErrorState description={error} onRetry={reload} /> : null}
      {!loading && !error && visible.length === 0 ? (
        <EmptyState icon={<Medal className="size-5" />} title={contests.length ? "No contests in this view" : "No contests yet"} description={contests.length ? undefined : "New contests will appear here when an admin creates them."} />
      ) : null}

      <ul className="grid gap-4 md:grid-cols-2">
        {visible.map((c) => {
          const phase = phaseOf(c, now);
          const full = typeof c.maxParticipants === "number" && c.participantCount >= c.maxParticipants;
          const count = c.problems.length || c.problemCount || 0;
          return (
            <li key={c._id}>
              <Card className="flex h-full flex-col">
                <CardBody className="grid flex-1 gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-semibold text-text">
                      <Link href={`/contests/${c._id}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </h2>
                    <Badge tone={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</Badge>
                  </div>
                  {c.description ? <p className="line-clamp-2 text-sm text-muted">{c.description}</p> : null}
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-muted">
                      <CalendarClock className="size-3.5" aria-hidden />
                      <dt className="sr-only">Starts</dt>
                      <dd>{formatDateTime(c.startDate)}</dd>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted">
                      <Users className="size-3.5" aria-hidden />
                      <dt className="sr-only">Participants</dt>
                      <dd>
                        {c.participantCount}
                        {c.maxParticipants ? ` / ${c.maxParticipants}` : ""} registered
                      </dd>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted">
                      <CodeXml className="size-3.5" aria-hidden />
                      <dt className="sr-only">Problems</dt>
                      <dd>{count} problem{count === 1 ? "" : "s"}</dd>
                    </div>
                    <div className="text-muted">
                      <dt className="sr-only">Ends</dt>
                      <dd>Ends {formatDateTime(c.endDate)}</dd>
                    </div>
                  </dl>
                </CardBody>
                <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
                  {c.isRegistered ? <Badge tone="success">Registered</Badge> : <span />}
                  <div className="flex gap-2">
                    <ButtonLink href={`/contests/${c._id}`} variant="secondary" size="sm">
                      Details
                    </ButtonLink>
                    {!c.isRegistered && phase !== "ended" ? (
                      <Button size="sm" disabled={full} loading={registering === c._id} onClick={() => register(c._id)}>
                        {full ? "Full" : "Register"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </PageContainer>
  );
}
