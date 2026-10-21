import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, History, Mic } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import StartScheduledButton from "../dashboard/StartScheduledButton";
import { Alert, Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageContainer, PageHeader, cn } from "@/app/components/ui";
import { STATUS_LABEL, formatDateTime, formatScore, statusTone } from "@/app/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "History" };

type InterviewItem = {
  _id: { toString(): string };
  createdAt?: Date;
  completedAt?: Date;
  scheduledFor?: Date;
  role?: string;
  experience?: string;
  type?: string;
  difficulty?: string;
  company?: string;
  focusAreas?: string;
  interactionMode?: "typing" | "video";
  useResume?: boolean;
  totalScore?: number | null;
  averageScore?: number | null;
  status?: string;
  turns?: unknown[];
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In progress" },
  { value: "terminated", label: "Ended early" },
] as const;

const PAGE_SIZE = 10;

function isDue(when: Date | undefined) {
  return when ? new Date(when).getTime() <= Date.now() : true;
}

function scoreOf(i: InterviewItem) {
  if (typeof i.averageScore === "number") return i.averageScore;
  if (typeof i.totalScore === "number" && i.totalScore > 0) return i.totalScore / 10;
  return null;
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string; scheduled?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const db = await getDb();
  const status = FILTERS.some((f) => f.value === params?.status) ? (params.status as string) : "all";
  const page = Math.max(1, Math.floor(Number(params?.page) || 1));

  const listFilter = { userId: user.id, ...(status === "all" ? { status: { $ne: "scheduled" } } : { status }) };
  const projection = { resumeText: 0, resumeProfile: 0, pendingEvaluations: 0, liveState: 0, finalReport: 0, "turns.evaluation": 0, "turns.star": 0 };

  const [scheduled, total, interviews] = db
    ? await Promise.all([
        db.collection("interviews").find({ userId: user.id, status: "scheduled" }, { projection }).sort({ scheduledFor: 1 }).limit(20).toArray(),
        db.collection("interviews").countDocuments(listFilter),
        db
          .collection("interviews")
          .find(listFilter, { projection })
          .sort({ createdAt: -1 })
          .skip((page - 1) * PAGE_SIZE)
          .limit(PAGE_SIZE)
          .toArray(),
      ])
    : [[], 0, []];

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number, s = status) => `/history?${new URLSearchParams({ ...(s !== "all" ? { status: s } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <PageContainer>
      <PageHeader
        title="Interview history"
        description="Every session you have started, with its score and full review."
        actions={
          <ButtonLink href="/interview/setup" icon={<Mic className="size-4" aria-hidden />}>
            New interview
          </ButtonLink>
        }
      />

      {!db ? <Alert tone="error" title="Database unavailable" className="mb-6">History can’t be loaded right now. Please try again later.</Alert> : null}
      {params?.scheduled ? <Alert tone="success" className="mb-6">Your interview is scheduled. It will appear below and on your dashboard.</Alert> : null}

      {(scheduled as unknown as InterviewItem[]).length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Scheduled" description="You can start each interview once its time arrives." icon={<CalendarClock className="size-4" />} />
          <ul className="divide-y divide-border">
            {(scheduled as unknown as InterviewItem[]).map((it) => {
              const ready = isDue(it.scheduledFor);
              return (
                <li key={it._id.toString()} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{it.role || "Interview"}</p>
                    <p className="text-xs text-muted">
                      {formatDateTime(it.scheduledFor)} · {[it.type, it.difficulty, it.interactionMode === "video" ? "Video" : "Typing"].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!ready ? <Badge tone="info">Not yet open</Badge> : null}
                    <StartScheduledButton
                      disabled={!ready}
                      details={{
                        id: it._id.toString(),
                        type: it.type || "Mixed",
                        role: it.role || "",
                        experience: it.experience || "",
                        difficulty: it.difficulty || "Adaptive",
                        company: it.company,
                        focusAreas: it.focusAreas,
                        interactionMode: it.interactionMode,
                        useResume: it.useResume,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <nav aria-label="Filter interviews" className="mb-4 flex gap-1 overflow-x-auto rounded-control border border-border bg-surface p-1 sm:inline-flex">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={href(1, f.value)}
            aria-current={status === f.value ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-md px-3 text-sm font-medium",
              status === f.value ? "bg-primary text-on-primary" : "text-muted hover:bg-background hover:text-text",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {(interviews as unknown as InterviewItem[]).length === 0 ? (
        <EmptyState
          icon={<History className="size-5" />}
          title={status === "all" ? "No interviews yet" : "No interviews match this filter"}
          description={status === "all" ? "Your completed and in-progress sessions will be listed here." : undefined}
          action={status === "all" ? <ButtonLink href="/interview/setup">Start your first interview</ButtonLink> : <ButtonLink href="/history" variant="secondary">Show all</ButtonLink>}
        />
      ) : (
        <Card>
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_8rem_6rem_5rem] gap-4 border-b border-border px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted md:grid">
            <span>Role</span>
            <span>Date</span>
            <span>Status</span>
            <span>Questions</span>
            <span className="text-right">Score</span>
          </div>
          <ul className="divide-y divide-border">
            {(interviews as unknown as InterviewItem[]).map((it) => {
              const score = scoreOf(it);
              return (
                <li key={it._id.toString()}>
                  <Link
                    href={`/history/interviews/${it._id.toString()}`}
                    className="grid gap-1 px-5 py-3.5 hover:bg-surface-muted md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_8rem_6rem_5rem] md:items-center md:gap-4"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-text">{it.role || "Interview"}</span>
                      <span className="block truncate text-xs text-muted">{[it.type, it.difficulty, it.company].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="text-xs text-muted md:text-sm">{formatDateTime(it.completedAt || it.createdAt)}</span>
                    <span>
                      <Badge tone={statusTone(it.status)}>{STATUS_LABEL[it.status || ""] || "Saved"}</Badge>
                    </span>
                    <span className="hidden text-sm tabular-nums text-text md:block">{Array.isArray(it.turns) ? it.turns.length : "—"}</span>
                    <span className="text-sm font-semibold tabular-nums text-text md:text-right">
                      <span className="text-xs font-normal text-muted md:hidden">Score: </span>
                      {score !== null ? `${formatScore(score)}/10` : "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {totalPages > 1 ? (
            <CardBody className="flex items-center justify-between border-t border-border text-sm">
              <span className="text-muted">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <ButtonLink href={href(page - 1)} variant="secondary" size="sm" icon={<ChevronLeft className="size-4" aria-hidden />}>
                    Previous
                  </ButtonLink>
                ) : null}
                {page < totalPages ? (
                  <ButtonLink href={href(page + 1)} variant="secondary" size="sm" className="flex-row-reverse" icon={<ChevronRight className="size-4" aria-hidden />}>
                    Next
                  </ButtonLink>
                ) : null}
              </div>
            </CardBody>
          ) : null}
        </Card>
      )}
    </PageContainer>
  );
}
