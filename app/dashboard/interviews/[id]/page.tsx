import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

type StoredEvaluation = {
  technical_score?: number;
  clarity_score?: number;
  confidence_score?: number;
  depth_score?: number;
  overall_score?: number;
  strengths?: string;
  weaknesses?: string;
  improvement?: string;
  ideal_answer?: string;
  follow_up_question?: string;
};

type StoredTurn = {
  question?: string;
  answer?: string;
  evaluation?: StoredEvaluation | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  star?: any;
  askedAt?: Date | string | null;
  answeredAt?: Date | string | null;
};

type StoredFinalReport = {
  // New schema
  candidate_summary?: string;
  technical_knowledge_score?: number;
  communication_skill_score?: number;
  confidence_score?: number;
  problem_solving_score?: number;
  english_fluency_score?: number;
  project_knowledge_score?: number;
  final_recommendation?: "Hire" | "No Hire";

  // Legacy schema (older saved reports)
  overall_score?: number;
  technical_score?: number;
  communication_score?: number;
  strengths?: string[];
  weaknesses?: string[];
  improvement_suggestions?: string[];
  recommended_focus_areas?: string[];
};

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function asDate(value: unknown) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function InterviewDetailsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await props.params;
  if (!id || !ObjectId.isValid(id)) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <main className="mx-auto w-full max-w-4xl px-6 py-10">
          <a href="/history" className="text-sm underline underline-offset-4">
            Back to history
          </a>
          <div className="mt-6 rounded-3xl border border-foreground/10 p-6 text-sm text-foreground/70">
            Invalid interview id.
          </div>
        </main>
      </div>
    );
  }

  const db = await getDb();
  if (!db) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <main className="mx-auto w-full max-w-4xl px-6 py-10">
          <a href="/history" className="text-sm underline underline-offset-4">
            Back to history
          </a>
          <div className="mt-6 rounded-3xl border border-foreground/10 p-6 text-sm text-foreground/70">
            Database is not configured.
          </div>
        </main>
      </div>
    );
  }

  const interview = (await db
    .collection("interviews")
    .findOne({ _id: new ObjectId(id), userId: user.id })) as
    | (Record<string, unknown> & {
        createdAt?: Date;
        updatedAt?: Date;
        completedAt?: Date;
        role?: string;
        type?: string;
        difficulty?: string;
        experience?: string;
        company?: string;
        focusAreas?: string;
        status?: string;
        totalScore?: number | null;
        averageScore?: number | null;
        finalReport?: StoredFinalReport | null;
        turns?: StoredTurn[];
        transcript?: StoredTurn[];
      })
    | null;

  if (!interview) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <main className="mx-auto w-full max-w-4xl px-6 py-10">
          <a href="/history" className="text-sm underline underline-offset-4">
            Back to history
          </a>
          <div className="mt-6 rounded-3xl border border-foreground/10 p-6 text-sm text-foreground/70">
            Interview not found.
          </div>
        </main>
      </div>
    );
  }

  const turns: StoredTurn[] = Array.isArray(interview.turns)
    ? interview.turns
    : Array.isArray(interview.transcript)
      ? interview.transcript
      : [];

  const overallScores = turns
    .map((t) => Number(t.evaluation?.overall_score))
    .filter((n) => Number.isFinite(n)) as number[];

  const computedAverageOverall = overallScores.length ? round1(mean(overallScores)) : null;

  const displayScore =
    typeof interview.totalScore === "number"
      ? `${interview.totalScore}`
      : typeof interview.averageScore === "number"
        ? `${interview.averageScore}/10`
        : computedAverageOverall !== null
          ? `${computedAverageOverall}/10`
          : "—";

  const createdAt = asDate(interview.createdAt);
  const completedAt = asDate(interview.completedAt);

  const report = interview.finalReport ?? null;

  return (
    <div className="min-h-dvh bg-background text-foreground">
        <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-6">
        <a href="/history" className="text-sm underline underline-offset-4">
          Back to history
        </a>
        <a
          href="/interview/setup"
          className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
        >
          New interview
        </a>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 pb-14">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Interview report</h1>
          <div className="text-sm text-foreground/70">
            {createdAt ? createdAt.toLocaleString() : "—"}
            {completedAt ? ` · Completed: ${completedAt.toLocaleString()}` : ""}
          </div>
        </div>

        <section className="mt-6 rounded-3xl border border-foreground/10 bg-background p-6">
          <div className="grid gap-3 text-sm text-foreground/80">
            <div>
              <span className="font-medium">Role:</span> {interview.role || "—"}
              {" · "}
              <span className="font-medium">Type:</span> {interview.type || "—"}
              {" · "}
              <span className="font-medium">Difficulty:</span> {interview.difficulty || "—"}
            </div>
            <div>
              <span className="font-medium">Score:</span> {displayScore}
              {interview.status ? (
                <>
                  {" · "}
                  <span className="font-medium">Status:</span> {interview.status}
                </>
              ) : null}
            </div>
            {typeof interview.company === "string" && interview.company.trim() ? (
              <div>
                <span className="font-medium">Company:</span> {interview.company}
              </div>
            ) : null}
            {typeof interview.focusAreas === "string" && interview.focusAreas.trim() ? (
              <div>
                <span className="font-medium">Focus areas:</span> {interview.focusAreas}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-foreground/10 bg-background p-6">
          <h2 className="text-lg font-semibold tracking-tight">Final report card</h2>
          {!report ? (
            <div className="mt-3 text-sm text-foreground/70">No final report saved for this interview.</div>
          ) : (
            <div className="mt-3 grid gap-3 text-sm text-foreground/80">
              {report.final_recommendation ? (
                <div>
                  <span className="font-medium">Recommendation:</span> {report.final_recommendation}
                </div>
              ) : null}

              {typeof report.candidate_summary === "string" && report.candidate_summary.trim() ? (
                <div>
                  <span className="font-medium">Candidate summary:</span> {report.candidate_summary}
                </div>
              ) : null}

              {typeof report.technical_knowledge_score === "number" || typeof report.communication_skill_score === "number" ? (
                <div>
                  <span className="font-medium">Technical knowledge:</span> {report.technical_knowledge_score ?? "—"}/10
                  {" · "}
                  <span className="font-medium">Communication:</span> {report.communication_skill_score ?? "—"}/10
                  {" · "}
                  <span className="font-medium">Confidence:</span> {report.confidence_score ?? "—"}/10
                  {" · "}
                  <span className="font-medium">Problem solving:</span> {report.problem_solving_score ?? "—"}/10
                  {" · "}
                  <span className="font-medium">English:</span> {report.english_fluency_score ?? "—"}/10
                  {" · "}
                  <span className="font-medium">Project knowledge:</span> {report.project_knowledge_score ?? "—"}/10
                </div>
              ) : (
                <div>
                  <span className="font-medium">Overall:</span> {report.overall_score ?? "—"}/10
                  {" · "}
                  <span className="font-medium">Technical:</span> {report.technical_score ?? "—"}/10
                  {" · "}
                  <span className="font-medium">Communication:</span> {report.communication_score ?? "—"}/10
                  {" · "}
                  <span className="font-medium">Problem-solving:</span> {report.problem_solving_score ?? "—"}/10
                </div>
              )}
              {report.strengths?.length ? (
                <div>
                  <span className="font-medium">Strengths:</span> {report.strengths.join(" ")}
                </div>
              ) : null}
              {report.weaknesses?.length ? (
                <div>
                  <span className="font-medium">Weaknesses:</span> {report.weaknesses.join(" ")}
                </div>
              ) : null}
              {report.improvement_suggestions?.length ? (
                <div>
                  <span className="font-medium">Improvements:</span> {report.improvement_suggestions.join(" ")}
                </div>
              ) : null}
              {report.recommended_focus_areas?.length ? (
                <div>
                  <span className="font-medium">Recommended focus areas:</span> {report.recommended_focus_areas.join(", ")}
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-foreground/10 bg-background p-6">
          <h2 className="text-lg font-semibold tracking-tight">Per-question reports</h2>
          {turns.length === 0 ? (
            <div className="mt-3 text-sm text-foreground/70">No transcript found.</div>
          ) : (
            <div className="mt-4 grid gap-4">
              {turns.map((t, idx) => (
                <div key={idx} className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
                  <div className="text-xs text-foreground/60">Q{idx + 1}</div>
                  <div className="mt-1 text-sm font-medium">{t.question || "—"}</div>
                  <div className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap">{t.answer || "—"}</div>

                  <div className="mt-3 grid gap-2 text-sm text-foreground/80">
                    <div>
                      <span className="font-medium">Overall:</span> {t.evaluation?.overall_score ?? "—"}/10
                      {" · "}
                      <span className="font-medium">Technical:</span> {t.evaluation?.technical_score ?? "—"}/10
                      {" · "}
                      <span className="font-medium">Clarity:</span> {t.evaluation?.clarity_score ?? "—"}/10
                      {" · "}
                      <span className="font-medium">Confidence:</span> {t.evaluation?.confidence_score ?? "—"}/10
                      {" · "}
                      <span className="font-medium">Depth:</span> {t.evaluation?.depth_score ?? "—"}/10
                    </div>
                    {t.evaluation?.strengths ? (
                      <div>
                        <span className="font-medium">Strengths:</span> {t.evaluation.strengths}
                      </div>
                    ) : null}
                    {t.evaluation?.weaknesses ? (
                      <div>
                        <span className="font-medium">Weaknesses:</span> {t.evaluation.weaknesses}
                      </div>
                    ) : null}
                    {t.evaluation?.improvement ? (
                      <div>
                        <span className="font-medium">Improve:</span> {t.evaluation.improvement}
                      </div>
                    ) : null}
                    {t.evaluation?.follow_up_question ? (
                      <div>
                        <span className="font-medium">Follow-up:</span> {t.evaluation.follow_up_question}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
