"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Lightbulb, MessageSquareText } from "lucide-react";

import PerformanceDashboard from "@/app/components/PerformanceDashboard";
import {
  Alert,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
  ScoreBars,
  ScoreRing,
} from "@/app/components/ui";
import type { Evaluation } from "@/lib/evaluation";
import { formatDateTime, formatScore } from "@/app/lib/format";
import { loadTurns } from "@/app/lib/interviewStorage";
import { useApi } from "@/app/lib/useApi";

type Turn = { question: string; answer: string; evaluation: Evaluation | null };
type Interview = { _id: string; role?: string; type?: string; completedAt?: string; createdAt?: string; averageScore?: number | null; turns?: Turn[] };

function avg(nums: Array<number | undefined>) {
  const vals = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
}

export default function FeedbackClient() {
  const latest = useApi<{ interviews: Interview[] }>("/api/interviews?status=completed&limit=1");
  // Turns kept on this device from the last session, used only when nothing is saved.
  const [localTurns] = useState<Turn[]>(() => (typeof window === "undefined" ? [] : loadTurns<Turn>()));

  const interview = latest.data?.interviews?.[0] ?? null;
  const savedTurns = (interview?.turns ?? []).filter((t) => t && t.question);
  const usingLocal = !latest.loading && savedTurns.length === 0 && localTurns.length > 0;
  const turns = usingLocal ? localTurns : savedTurns;
  const evaluated = turns.filter((t) => t.evaluation);

  const summary = useMemo(
    () => ({
      overall: interview?.averageScore ?? avg(evaluated.map((t) => t.evaluation?.overall_score)),
      technical: avg(evaluated.map((t) => t.evaluation?.technical_score)),
      clarity: avg(evaluated.map((t) => t.evaluation?.clarity_score)),
      confidence: avg(evaluated.map((t) => t.evaluation?.confidence_score)),
      depth: avg(evaluated.map((t) => t.evaluation?.depth_score)),
    }),
    [evaluated, interview],
  );

  const improvements = Array.from(new Set(evaluated.map((t) => t.evaluation?.improvement?.trim()).filter((s): s is string => Boolean(s)))).slice(0, 5);

  return (
    <PageContainer>
      <PageHeader
        title="Feedback"
        description="What went well and what to work on, from your most recent completed interview."
        actions={
          interview ? (
            <ButtonLink href={`/history/interviews/${interview._id}`} variant="secondary">
              Open full report
            </ButtonLink>
          ) : undefined
        }
      />

      {latest.loading ? <LoadingState label="Loading feedback…" /> : null}
      {latest.error ? <ErrorState description={latest.error} onRetry={latest.reload} className="mb-6" /> : null}

      {!latest.loading && turns.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText className="size-5" />}
          title="No feedback yet"
          description="Finish an interview and your per-answer feedback will appear here."
          action={<ButtonLink href="/interview/setup">Start an interview</ButtonLink>}
        />
      ) : null}

      {turns.length > 0 ? (
        <div className="grid gap-6">
          {usingLocal ? (
            <Alert tone="warning" title="Showing your last session on this device">
              It isn’t in your saved history, so it won’t count toward progress or rankings.
            </Alert>
          ) : interview ? (
            <p className="text-sm text-muted">
              {interview.role || "Interview"} · {interview.type} · {formatDateTime(interview.completedAt || interview.createdAt)}
            </p>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardBody className="grid justify-items-center gap-3 py-6 text-center">
                <ScoreRing score={summary.overall} label="Session score" />
                <p className="text-sm text-muted">
                  {evaluated.length} of {turns.length} answers evaluated
                </p>
              </CardBody>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Breakdown" description="Average across evaluated answers (0–10)" />
              <CardBody>
                <ScoreBars
                  items={[
                    { label: "Technical", value: summary.technical },
                    { label: "Clarity", value: summary.clarity },
                    { label: "Confidence", value: summary.confidence },
                    { label: "Depth", value: summary.depth },
                  ]}
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Top things to improve" icon={<Lightbulb className="size-4" />} />
            <CardBody>
              {improvements.length ? (
                <ol className="grid gap-2.5">
                  {improvements.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm text-text">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-primary" aria-hidden>
                        {i + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">No improvement suggestions were recorded for this session.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Answers" description="Score per question" />
            <ul className="divide-y divide-border">
              {turns.map((t, i) => (
                <li key={i} className="flex items-start justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted">Q{i + 1}</p>
                    <p className="text-sm text-text">{t.question}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-text">
                    {t.evaluation ? `${formatScore(t.evaluation.overall_score)}/10` : <span className="font-normal text-muted">Not evaluated</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <section aria-labelledby="overall-title" className="grid gap-3">
            <h2 id="overall-title" className="text-lg font-semibold text-text">
              Progress over time
            </h2>
            <PerformanceDashboard />
            <p className="text-sm text-muted">
              See every session on the <Link href="/history" className="font-medium text-text underline underline-offset-2">history page</Link>.
            </p>
          </section>
        </div>
      ) : null}
    </PageContainer>
  );
}
