"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Camera,
  CircleAlert,
  CircleCheck,
  Clock,
  FileText,
  LoaderCircle,
  LogOut,
  Mic,
  ScanFace,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ChartFrame,
  ScoreBars,
  ScoreRing,
  cn,
} from "@/app/components/ui";
import type { Evaluation } from "@/lib/evaluation";
import type { FinalReport } from "@/app/api/ai/report/route";
import { formatScore } from "@/app/lib/format";

export type PermissionState = "unknown" | "granted" | "denied";
export type DetectorState = "idle" | "loading" | "ready" | "error";

export function formatMmSs(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Full-screen loading state used while the session prepares. */
export function PreparingScreen({ title, phrase }: { title: string; phrase?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center" role="status" aria-live="polite">
        <LoaderCircle className="size-8 text-primary ui-spin" aria-hidden />
        <div>
          <p className="text-lg font-semibold text-text">{title}</p>
          {phrase ? <p className="mt-1 text-sm text-muted">{phrase}</p> : null}
        </div>
      </div>
    </div>
  );
}

/** Minimal top bar for the distraction-free workspace. */
export function LiveTopBar({ meta, status, onExit, exitLabel = "Exit" }: { meta: string; status: ReactNode; onExit: () => void; exitLabel?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-primary text-on-primary" aria-hidden>
            <Mic className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">Mock interview</p>
            <p className="truncate text-xs text-muted">{meta}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status}
          <Button variant="ghost" size="sm" onClick={onExit} icon={<LogOut className="size-4" aria-hidden />}>
            {exitLabel}
          </Button>
        </div>
      </div>
    </header>
  );
}

function CheckRow({ icon, label, state, detail, action }: { icon: ReactNode; label: string; state: "ok" | "pending" | "error" | "loading"; detail: string; action?: ReactNode }) {
  const tone = { ok: "text-success", pending: "text-muted", error: "text-error", loading: "text-muted" }[state];
  const StateIcon = state === "ok" ? CircleCheck : state === "error" ? CircleAlert : state === "loading" ? LoaderCircle : Clock;
  return (
    <li className="flex flex-col gap-3 rounded-control border border-border p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-primary" aria-hidden>
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-text">{label}</p>
          <p className={cn("mt-0.5 flex items-center gap-1.5 text-xs", tone)}>
            <StateIcon className={cn("size-3.5", state === "loading" && "ui-spin")} aria-hidden />
            {detail}
          </p>
        </div>
      </div>
      {action}
    </li>
  );
}

type PreflightProps = {
  meta: Array<[string, string]>;
  interactionMode: "typing" | "video";
  resume: { needed: boolean; status: "idle" | "loading" | "ready" | "error" };
  camera: PermissionState;
  mic: PermissionState;
  detector: DetectorState;
  scheduleMessage?: string | null;
  canStart: boolean;
  starting: boolean;
  message?: string;
  onRequestCamera: () => void;
  onRequestMic: () => void;
  onLoadDetector: () => void;
  onStart: () => void;
  onUseTyping: () => void;
};

/** Pre-interview checklist: confirms configuration and, for video mode, device permissions. */
export function PreflightScreen(p: PreflightProps) {
  const video = p.interactionMode === "video";
  const deviceProblem = video && (p.camera === "denied" || p.mic === "denied" || p.detector === "error");
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Ready when you are</h1>
        <p className="mt-1.5 text-sm text-muted">
          {video
            ? "Video mode reads each question aloud, transcribes your spoken answers and monitors the session. Allow access below to begin."
            : "Questions appear one at a time. Type your answer and submit it, or let the answer timer move you on."}
        </p>
      </div>

      <Card>
        <CardHeader title="Session" description="Change these on the setup page." icon={<FileText className="size-4" />} action={<ButtonLink href="/interview/setup" variant="ghost" size="sm">Edit</ButtonLink>} />
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {p.meta.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="truncate font-medium text-text">{v}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Checklist" icon={<ShieldCheck className="size-4" />} />
        <CardBody>
          <ul className="grid gap-2.5">
            <CheckRow
              icon={<FileText className="size-4" />}
              label="Resume"
              state={!p.resume.needed ? "ok" : p.resume.status === "ready" ? "ok" : p.resume.status === "error" ? "error" : "loading"}
              detail={
                !p.resume.needed
                  ? "Not used for this session"
                  : p.resume.status === "ready"
                    ? "Skills and projects extracted"
                    : p.resume.status === "error"
                      ? "Could not extract details; the raw resume text will still be used"
                      : "Analysing resume…"
              }
            />
            {video ? (
              <>
                <CheckRow
                  icon={<Camera className="size-4" />}
                  label="Camera"
                  state={p.camera === "granted" ? "ok" : p.camera === "denied" ? "error" : "pending"}
                  detail={p.camera === "granted" ? "Access granted" : p.camera === "denied" ? "Blocked or unavailable. Allow it in your browser settings." : "Permission needed"}
                  action={p.camera !== "granted" ? <Button size="sm" variant="secondary" onClick={p.onRequestCamera}>Allow camera</Button> : undefined}
                />
                <CheckRow
                  icon={<Mic className="size-4" />}
                  label="Microphone"
                  state={p.mic === "granted" ? "ok" : p.mic === "denied" ? "error" : "pending"}
                  detail={p.mic === "granted" ? "Access granted" : p.mic === "denied" ? "Blocked or unavailable. Allow it in your browser settings." : "Permission needed"}
                  action={p.mic !== "granted" ? <Button size="sm" variant="secondary" onClick={p.onRequestMic}>Allow microphone</Button> : undefined}
                />
                <CheckRow
                  icon={<ScanFace className="size-4" />}
                  label="Face detection"
                  state={p.detector === "ready" ? "ok" : p.detector === "error" ? "error" : p.detector === "loading" ? "loading" : "pending"}
                  detail={
                    p.detector === "ready"
                      ? "Ready"
                      : p.detector === "error"
                        ? "Not supported in this browser or the model failed to load"
                        : p.detector === "loading"
                          ? "Loading model…"
                          : "Loads a small on-device model"
                  }
                  action={p.detector === "idle" || p.detector === "error" ? <Button size="sm" variant="secondary" onClick={p.onLoadDetector}>{p.detector === "error" ? "Retry" : "Load"}</Button> : undefined}
                />
              </>
            ) : null}
          </ul>
          {deviceProblem ? (
            <Alert
              tone="warning"
              className="mt-4"
              title="Video mode can’t start yet"
              action={
                <Button size="sm" variant="secondary" onClick={p.onUseTyping}>
                  Use typing mode
                </Button>
              }
            >
              You can fix the item above, or continue this interview in typing mode instead.
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      {p.scheduleMessage ? <Alert tone="info">{p.scheduleMessage}</Alert> : null}
      {p.message ? <Alert tone="error">{p.message}</Alert> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <ButtonLink href="/" variant="secondary">
          Back to dashboard
        </ButtonLink>
        <Button size="lg" onClick={p.onStart} disabled={!p.canStart} loading={p.starting}>
          {p.starting ? "Starting…" : "Start interview"}
        </Button>
      </div>
    </div>
  );
}

const EVAL_DIMS: Array<[keyof Evaluation, string]> = [
  ["technical_score", "Technical"],
  ["clarity_score", "Clarity"],
  ["confidence_score", "Confidence"],
  ["depth_score", "Depth"],
];

/** Feedback for the most recent answer (typing mode shows it after each answer). */
export function AnswerFeedback({ evaluation, question }: { evaluation: Evaluation; question: string }) {
  return (
    <Card>
      <CardHeader title="Feedback on your last answer" description={question} as="h3" />
      <CardBody className="grid gap-4">
        <div className="flex items-center gap-4">
          <ScoreRing score={evaluation.overall_score} size={72} label="Answer score" />
          <div className="flex-1">
            <ScoreBars items={EVAL_DIMS.map(([k, label]) => ({ label, value: Number(evaluation[k]) }))} />
          </div>
        </div>
        <dl className="grid gap-3 text-sm">
          {evaluation.strengths ? (
            <div>
              <dt className="font-semibold text-success">Strengths</dt>
              <dd className="mt-0.5 text-text">{evaluation.strengths}</dd>
            </div>
          ) : null}
          {evaluation.weaknesses ? (
            <div>
              <dt className="font-semibold text-warning">Gaps</dt>
              <dd className="mt-0.5 text-text">{evaluation.weaknesses}</dd>
            </div>
          ) : null}
          {evaluation.improvement ? (
            <div>
              <dt className="font-semibold text-text">Try next time</dt>
              <dd className="mt-0.5 text-text">{evaluation.improvement}</dd>
            </div>
          ) : null}
        </dl>
      </CardBody>
    </Card>
  );
}

const REPORT_DIMS: Array<[keyof FinalReport, string]> = [
  ["technical_knowledge_score", "Technical knowledge"],
  ["communication_skill_score", "Communication"],
  ["confidence_score", "Confidence"],
  ["problem_solving_score", "Problem solving"],
  ["english_fluency_score", "English fluency"],
  ["project_knowledge_score", "Project knowledge"],
];

type CompletionProps = {
  onRetryFinish?: () => void;
  pendingEvaluations?: number;
  onRetryEvaluation?: () => void;
  retrying?: boolean;
  averageScore: number | null;
  report: FinalReport | null;
  reportError: string | null;
  endedReason: string | null;
  answered: number;
  saved: boolean;
  interviewId: string;
};

/** In-place completion view shown when the session ends. */
export function CompletionView({ averageScore, report, reportError, endedReason, answered, saved, interviewId, pendingEvaluations = 0, onRetryEvaluation, retrying, onRetryFinish }: CompletionProps) {
  const terminated = endedReason === "proctor_violations";
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <Badge tone={terminated ? "error" : "success"} className="w-fit" icon={terminated ? <TriangleAlert className="size-3" aria-hidden /> : <CircleCheck className="size-3" aria-hidden />}>
          {terminated ? "Ended after repeated proctoring warnings" : "Interview complete"}
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Your results</h1>
        <p className="text-sm text-muted">
          {answered} question{answered === 1 ? "" : "s"} answered{endedReason === "time_limit" ? " before the time limit" : ""}.{" "}
          {saved ? "Saved to your history." : "This session could not be saved to your history."}
        </p>
      </div>

      {!saved && onRetryFinish ? (
        <Alert
          tone="error"
          title="Your interview couldn't be finalised"
          action={<Button size="sm" variant="secondary" loading={retrying} onClick={onRetryFinish}>Try again</Button>}
        >
          Your conversation is saved on the server. Try again to score it and generate the report.
        </Alert>
      ) : null}

      {pendingEvaluations > 0 ? (
        <Alert
          tone="warning"
          title={`${pendingEvaluations} answer${pendingEvaluations === 1 ? "" : "s"} could not be evaluated yet`}
          action={onRetryEvaluation ? <Button size="sm" variant="secondary" loading={retrying} onClick={onRetryEvaluation}>Retry evaluation</Button> : undefined}
        >
          Your transcript is saved. The score below only covers evaluated answers; nothing was estimated for the rest.
        </Alert>
      ) : null}

      <Card>
        <CardBody className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <ScoreRing score={averageScore} size={128} label="Average answer score" />
          <div className="grid gap-2">
            {report ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-text">Recommendation</p>
                  <Badge tone={report.final_recommendation === "Hire" ? "success" : "warning"}>{report.final_recommendation}</Badge>
                </div>
                <p className="text-sm leading-6 text-text">{report.candidate_summary}</p>
              </>
            ) : (
              <Alert tone="warning" title="AI report unavailable">
                {reportError || "The summary report could not be generated."} Your score above is the average of the per-answer evaluations, which are saved with the session.
              </Alert>
            )}
          </div>
        </CardBody>
      </Card>

      {report ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader title="Score breakdown" as="h2" />
            <CardBody>
              <ChartFrame title="Report dimensions" description="Scores out of 10">
                <ScoreBars items={REPORT_DIMS.map(([k, label]) => ({ label, value: Number(report[k]) }))} />
              </ChartFrame>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Strengths and areas to improve" as="h2" />
            <CardBody className="grid gap-4 text-sm">
              <div>
                <p className="font-semibold text-success">Strengths</p>
                <ul className="mt-1.5 grid gap-1.5">
                  {report.strengths.length ? report.strengths.map((s, i) => <li key={i} className="text-text">• {s}</li>) : <li className="text-muted">None identified.</li>}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-warning">Areas to improve</p>
                <ul className="mt-1.5 grid gap-1.5">
                  {report.weaknesses.length ? report.weaknesses.map((s, i) => <li key={i} className="text-text">• {s}</li>) : <li className="text-muted">None identified.</li>}
                </ul>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {saved && interviewId ? <ButtonLink href={`/history/interviews/${interviewId}`}>View question-by-question review</ButtonLink> : null}
        <ButtonLink href="/interview/setup" variant="secondary">
          Start another interview
        </ButtonLink>
        <Link href="/" className="inline-flex h-10 items-center justify-center rounded-control px-4 text-sm font-medium text-text hover:bg-primary/[0.06]">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export function TimerPill({ label, seconds, warnAt = 15 }: { label: string; seconds: number; warnAt?: number }) {
  const low = seconds <= warnAt;
  return (
    <div className={cn("rounded-control border px-3 py-2", low ? "border-warning/40 bg-warning-soft" : "border-border bg-surface")}>
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className={cn("text-base font-semibold tabular-nums", low ? "text-warning" : "text-text")} aria-live={low ? "polite" : "off"}>
        {formatMmSs(seconds)}
      </p>
    </div>
  );
}

export { formatScore };
