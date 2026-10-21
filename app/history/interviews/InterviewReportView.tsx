import { ObjectId } from "mongodb";
import { CircleCheck, Clock, MessageSquareText, TriangleAlert } from "lucide-react";

import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ChartFrame,
  EmptyState,
  PageContainer,
  PageHeader,
  ScoreBars,
  ScoreRing,
} from "@/app/components/ui";
import { STATUS_LABEL, formatDateTime, formatScore, statusTone } from "@/app/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import FinishInterviewButton from "./FinishInterviewButton";

type StoredEvaluation = {
  technical_score?: number;
  clarity_score?: number;
  confidence_score?: number;
  depth_score?: number;
  english_fluency_score?: number;
  project_knowledge_score?: number;
  overall_score?: number;
  strengths?: string;
  weaknesses?: string;
  improvement?: string;
  ideal_answer?: string;
};

type StoredTurn = {
  question?: string;
  answer?: string;
  evaluation?: StoredEvaluation | null;
  star?: { star_used?: boolean; structure_score?: number; emotional_intelligence_score?: number; improvement_feedback?: string } | null;
};

type StoredReport = {
  candidate_summary?: string;
  technical_knowledge_score?: number;
  communication_skill_score?: number;
  confidence_score?: number;
  problem_solving_score?: number;
  english_fluency_score?: number;
  project_knowledge_score?: number;
  final_recommendation?: "Hire" | "No Hire";
  strengths?: string[];
  weaknesses?: string[];
  improvement_suggestions?: string[];
};

type StoredInterview = {
  role?: string;
  type?: string;
  difficulty?: string;
  experience?: string;
  company?: string;
  focusAreas?: string;
  interactionMode?: string;
  status?: string;
  endedReason?: string | null;
  createdAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  totalScore?: number | null;
  averageScore?: number | null;
  finalReport?: StoredReport | null;
  turns?: StoredTurn[];
  transcript?: StoredTurn[];
  proctoring?: { violations?: number | null; lastViolation?: string | null } | null;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function overallOf(i: StoredInterview, turns: StoredTurn[]) {
  if (num(i.averageScore) !== null) return i.averageScore as number;
  if (num(i.totalScore) !== null && (i.totalScore as number) > 0) return (i.totalScore as number) / 10;
  const s = turns.map((t) => num(t.evaluation?.overall_score)).filter((n): n is number => n !== null);
  return s.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 : null;
}

function durationLabel(i: StoredInterview) {
  const start = i.startedAt ?? i.createdAt;
  if (!start || !i.completedAt) return null;
  const minutes = Math.round((new Date(i.completedAt).getTime() - new Date(start).getTime()) / 60000);
  return minutes > 0 && minutes < 600 ? `${minutes} min` : null;
}

function NotFound({ message }: { message: string }) {
  return (
    <PageContainer width="narrow">
      <PageHeader breadcrumbs={[{ label: "History", href: "/history" }, { label: "Interview" }]} title="Interview report" />
      <EmptyState title={message} action={<ButtonLink href="/history">Back to history</ButtonLink>} />
    </PageContainer>
  );
}

/** Full report for one of the signed-in user's interviews (server component). */
export default async function InterviewReportView({ id }: { id: string }) {
  const user = await getCurrentUser();
  if (!user) return <NotFound message="Sign in to view this interview." />;
  if (!/^[a-f\d]{24}$/i.test(id)) return <NotFound message="This interview link is not valid." />;

  const db = await getDb();
  if (!db) return <NotFound message="The database is unavailable right now. Please try again later." />;

  // Ownership is part of the query: other users' interviews are indistinguishable from missing ones.
  const interview = (await db
    .collection("interviews")
    .findOne({ _id: new ObjectId(id), userId: user.id }, { projection: { pendingEvaluations: 0, liveState: 0, resumeText: 0, resumeProfile: 0 } })) as StoredInterview | null;
  if (!interview) return <NotFound message="Interview not found." />;

  const turns = (Array.isArray(interview.turns) ? interview.turns : Array.isArray(interview.transcript) ? interview.transcript : []) as StoredTurn[];
  const overall = overallOf(interview, turns);
  const report = interview.finalReport ?? null;
  const evaluated = turns.filter((t) => t.evaluation);
  const avg = (key: keyof StoredEvaluation) => {
    const s = evaluated.map((t) => num(t.evaluation?.[key])).filter((n): n is number => n !== null);
    return s.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 : null;
  };
  const duration = durationLabel(interview);
  const date = interview.completedAt ?? interview.createdAt;

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ label: "History", href: "/history" }, { label: interview.role || "Interview" }]}
        title={interview.role || "Interview report"}
        description={[interview.type, interview.difficulty, interview.experience, formatDateTime(date)].filter(Boolean).join(" · ")}
        actions={
          <>
            <ButtonLink href="/history" variant="secondary">
              Back to history
            </ButtonLink>
            <ButtonLink href="/interview/setup">Practise again</ButtonLink>
          </>
        }
      />

      {interview.status === "terminated" ? (
        <Alert tone="error" title="Ended after repeated proctoring warnings" className="mb-6">
          {interview.proctoring?.lastViolation ? `Last warning: ${interview.proctoring.lastViolation}.` : null}
        </Alert>
      ) : interview.status === "in_progress" ? (
        <Alert tone="warning" title="This interview was not finished" className="mb-6" action={<FinishInterviewButton interviewId={id} />}>
          The conversation so far is saved. Finish it to score your answers and generate the report.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardBody className="grid justify-items-center gap-4 py-6 text-center">
            <ScoreRing score={overall} size={128} label="Overall score" />
            <div className="flex flex-wrap justify-center gap-2">
              <Badge tone={statusTone(interview.status)}>{STATUS_LABEL[interview.status || ""] || "Saved"}</Badge>
              {report?.final_recommendation ? <Badge tone={report.final_recommendation === "Hire" ? "success" : "warning"}>{report.final_recommendation}</Badge> : null}
            </div>
            <dl className="grid w-full grid-cols-2 gap-3 text-left text-sm">
              <div>
                <dt className="text-xs text-muted">Questions</dt>
                <dd className="font-semibold text-text">{turns.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Duration</dt>
                <dd className="font-semibold text-text">{duration ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Mode</dt>
                <dd className="font-semibold text-text">{interview.interactionMode === "video" ? "Video" : "Typing"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Company</dt>
                <dd className="truncate font-semibold text-text">{interview.company || "—"}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Summary" icon={<MessageSquareText className="size-4" />} />
          <CardBody className="grid gap-5">
            {report?.candidate_summary ? (
              <p className="text-sm leading-6 text-text">{report.candidate_summary}</p>
            ) : (
              <p className="text-sm text-muted">No AI summary was generated for this session. Scores below come from the per-answer evaluations.</p>
            )}
            <ChartFrame title="Score breakdown" description={report ? "From the final report (0–10)" : "Average of evaluated answers (0–10)"}>
              <ScoreBars
                items={
                  report
                    ? [
                        { label: "Technical knowledge", value: num(report.technical_knowledge_score) },
                        { label: "Communication", value: num(report.communication_skill_score) },
                        { label: "Confidence", value: num(report.confidence_score) },
                        { label: "Problem solving", value: num(report.problem_solving_score) },
                        { label: "English fluency", value: num(report.english_fluency_score) },
                        { label: "Project knowledge", value: num(report.project_knowledge_score) },
                      ]
                    : [
                        { label: "Technical", value: avg("technical_score") },
                        { label: "Clarity", value: avg("clarity_score") },
                        { label: "Confidence", value: avg("confidence_score") },
                        { label: "Depth", value: avg("depth_score") },
                      ]
                }
              />
            </ChartFrame>
            {report && (report.strengths?.length || report.weaknesses?.length) ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                    <CircleCheck className="size-4" aria-hidden /> Strengths
                  </p>
                  <ul className="mt-2 grid gap-1.5 text-sm text-text">
                    {(report.strengths ?? []).map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                    <TriangleAlert className="size-4" aria-hidden /> Areas to improve
                  </p>
                  <ul className="mt-2 grid gap-1.5 text-sm text-text">
                    {[...(report.weaknesses ?? []), ...(report.improvement_suggestions ?? [])].map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby="qa-title" className="mt-8">
        <h2 id="qa-title" className="mb-4 text-lg font-semibold text-text">
          Question-by-question review
        </h2>
        {turns.length === 0 ? (
          <EmptyState icon={<Clock className="size-5" />} title="No answers were recorded for this session." />
        ) : (
          <ol className="grid gap-4">
            {turns.map((t, idx) => {
              const e = t.evaluation;
              return (
                <li key={idx}>
                  <Card>
                    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-muted">Question {idx + 1}</p>
                        <h3 className="mt-1 text-base font-medium text-text">{t.question || "—"}</h3>
                      </div>
                      <span className="shrink-0 rounded-full bg-background px-3 py-1 text-sm font-semibold tabular-nums text-text">
                        {e ? `${formatScore(num(e.overall_score))}/10` : "Not evaluated"}
                      </span>
                    </div>
                    <CardBody className="grid gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your answer</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">{t.answer?.trim() || <span className="text-muted">No answer given.</span>}</p>
                      </div>
                      {e ? (
                        <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
                          <dl className="grid gap-3 text-sm">
                            {e.strengths ? (
                              <div>
                                <dt className="font-semibold text-success">Strengths</dt>
                                <dd className="mt-0.5 text-text">{e.strengths}</dd>
                              </div>
                            ) : null}
                            {e.weaknesses ? (
                              <div>
                                <dt className="font-semibold text-warning">Gaps</dt>
                                <dd className="mt-0.5 text-text">{e.weaknesses}</dd>
                              </div>
                            ) : null}
                            {e.improvement ? (
                              <div>
                                <dt className="font-semibold text-text">How to improve</dt>
                                <dd className="mt-0.5 text-text">{e.improvement}</dd>
                              </div>
                            ) : null}
                            {e.ideal_answer ? (
                              <div>
                                <dt className="font-semibold text-text">A stronger answer would</dt>
                                <dd className="mt-0.5 text-text">{e.ideal_answer}</dd>
                              </div>
                            ) : null}
                            {t.star ? (
                              <div>
                                <dt className="font-semibold text-text">STAR method</dt>
                                <dd className="mt-0.5 text-text">
                                  {t.star.star_used ? "Used" : "Not used"}
                                  {num(t.star.structure_score) !== null ? ` · structure ${t.star.structure_score}/10` : ""}
                                  {t.star.improvement_feedback ? ` — ${t.star.improvement_feedback}` : ""}
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                          <ScoreBars
                            items={[
                              { label: "Technical", value: num(e.technical_score) },
                              { label: "Clarity", value: num(e.clarity_score) },
                              { label: "Confidence", value: num(e.confidence_score) },
                              { label: "Depth", value: num(e.depth_score) },
                            ]}
                          />
                        </div>
                      ) : (
                        <p className="text-sm text-muted">This answer was saved without an evaluation (the AI service was unavailable at the time).</p>
                      )}
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </PageContainer>
  );
}
