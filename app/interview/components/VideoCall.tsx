"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { AudioLines, Bot, Camera, CircleAlert, CircleCheck, Clock, FileText, LoaderCircle, Mic, MicOff, PhoneOff, ScanFace, ShieldCheck, Video, VideoOff } from "lucide-react";

import { Alert, Button, ButtonLink, Card, CardBody, CardHeader, Checkbox, cn } from "@/app/components/ui";
import { PROCTORING_RETENTION_DAYS } from "@/lib/proctoring";
import type { DeviceState } from "../useMediaDevices";
import type { DetectorState } from "./LiveParts";

/** How the candidate's speech becomes text. */
export type SpeechEngine = "browser" | "server" | "none";

/** Attaches a MediaStream to a muted, mirrored <video>; re-attaches when tracks change. */
export function StreamVideo({ stream, version, videoRef, className, label }: { stream: MediaStream | null; version: number; videoRef?: RefObject<HTMLVideoElement | null>; className?: string; label: string }) {
  const own = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = own.current;
    if (!el) return;
    if (videoRef) videoRef.current = el;
    if (el.srcObject !== stream) el.srcObject = stream;
  }, [stream, version, videoRef]);
  return <video ref={own} autoPlay playsInline muted aria-label={label} className={cn("-scale-x-100 object-cover", className)} />;
}

function deviceText(kind: "Camera" | "Microphone", s: DeviceState) {
  switch (s) {
    case "granted":
      return "On";
    case "off":
      return "Off";
    case "requesting":
      return "Waiting for permission…";
    case "denied":
      return "Blocked. Allow it in your browser's site settings, then try again.";
    case "unavailable":
      return kind === "Camera" ? "No camera found, or it's in use by another app." : "No microphone found, or it's in use by another app.";
    default:
      return "Permission needed";
  }
}

function CheckRow({ icon, label, ok, error, loading, detail, action }: { icon: ReactNode; label: string; ok: boolean; error?: boolean; loading?: boolean; detail: string; action?: ReactNode }) {
  const Icon = ok ? CircleCheck : error ? CircleAlert : loading ? LoaderCircle : Clock;
  return (
    <li className="flex flex-col gap-2 rounded-control border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background text-primary" aria-hidden>
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-text">{label}</p>
          <p className={cn("mt-0.5 flex items-center gap-1.5 text-xs", ok ? "text-success" : error ? "text-error" : "text-muted")}>
            <Icon className={cn("size-3.5 shrink-0", loading && "ui-spin")} aria-hidden />
            {detail}
          </p>
        </div>
      </div>
      {action}
    </li>
  );
}

type LobbyProps = {
  meta: Array<[string, string]>;
  stream: MediaStream | null;
  version: number;
  camera: DeviceState;
  mic: DeviceState;
  micLevel: number;
  engine: SpeechEngine;
  detector: DetectorState;
  canStart: boolean;
  starting: boolean;
  message?: string;
  scheduleMessage?: string | null;
  onRequestDevices: () => void;
  onLoadDetector: () => void;
  onStart: () => void;
  /** The candidate has read and accepted the proctoring disclosure. */
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  fullscreenSupported: boolean;
};

/** What is monitored, what is kept and how it is used: shown before any monitoring starts. */
function ProctoringDisclosure({ engine, fullscreenSupported, consent, onConsentChange }: { engine: SpeechEngine; fullscreenSupported: boolean; consent: boolean; onConsentChange: (v: boolean) => void }) {
  return (
    <Card>
      <CardHeader title="Proctoring and privacy" icon={<ShieldCheck className="size-4" />} />
      <CardBody className="grid gap-3 text-sm text-text">
        <dl className="grid gap-2.5">
          <div>
            <dt className="font-semibold">Inputs used</dt>
            <dd className="text-muted">
              Your camera and microphone, only after you allow them and only during the interview. {engine === "server" ? "Each spoken answer is sent once to our server to be transcribed, then discarded." : "Your browser converts your speech to text (some browsers use their vendor's online speech service)."}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">What is monitored</dt>
            <dd className="text-muted">
              Leaving the interview tab or window{fullscreenSupported ? ", exiting fullscreen (you'll be asked to stay in fullscreen)" : ""}, camera or microphone disconnections, long silences while you answer, pauses and reloads, and, if the on-device model loads, whether a face is visible or more than one face appears for several seconds.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">What is stored</dt>
            <dd className="text-muted">
              Only small event records (type, time, duration). Video and audio are never recorded or stored, and face checks run on this device; no face identity, emotion or voice analysis is done. Event records are deleted automatically after {PROCTORING_RETENTION_DAYS} days; a summary stays with your report.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">How it is used</dt>
            <dd className="text-muted">
              Fixed rules sort events into informational, warning and &ldquo;review recommended&rdquo;. They appear in a separate integrity summary in your report, which you can add a note to. They never end the interview, change your scores, or prove misconduct; a browser can&rsquo;t see other devices or people off camera. If your microphone disconnects, your answer timer pauses until it&rsquo;s reconnected.
            </dd>
          </div>
        </dl>
        <Checkbox label="I've read this and agree to proctoring for this interview" checked={consent} onChange={(e) => onConsentChange(e.target.checked)} />
      </CardBody>
    </Card>
  );
}

/** Pre-call lobby: camera preview, microphone check, speech support and privacy notes. */
export function VideoLobby(p: LobbyProps) {
  const devicesAsked = p.camera !== "unknown" || p.mic !== "unknown";
  const needsDevices = p.camera !== "granted" || p.mic !== "granted";
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid content-start gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">Get ready for your video interview</h1>
          <p className="mt-1.5 text-sm text-muted">The AI interviewer asks each question aloud and listens to your spoken answers. You have 60 seconds per answer once the question has been read.</p>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-card bg-primary">
          {p.camera === "granted" ? (
            <StreamVideo stream={p.stream} version={p.version} label="Your camera preview" className="size-full" />
          ) : (
            <div className="grid size-full place-items-center p-6 text-center text-sm text-on-primary/80">
              {p.camera === "unknown" ? "Your camera preview appears here." : deviceText("Camera", p.camera)}
            </div>
          )}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-primary/80 px-3 py-1.5 text-xs text-on-primary">
            {p.mic === "granted" ? <Mic className="size-3.5" aria-hidden /> : <MicOff className="size-3.5" aria-hidden />}
            <span className="sr-only">Microphone level</span>
            <span className="flex h-3 items-end gap-0.5" aria-hidden>
              {[0.15, 0.35, 0.55, 0.75, 0.9].map((t) => (
                <span key={t} className={cn("w-1 rounded-sm transition-all", p.micLevel >= t ? "h-3 bg-success" : "h-1.5 bg-on-primary/40")} />
              ))}
            </span>
            <span>{p.mic === "granted" ? "Speak to test your microphone" : "Microphone off"}</span>
          </div>
        </div>

        {needsDevices ? (
          <Button size="lg" variant={devicesAsked ? "secondary" : "primary"} onClick={p.onRequestDevices} loading={p.camera === "requesting" || p.mic === "requesting"} icon={<Video className="size-4" aria-hidden />} className="justify-self-start">
            {devicesAsked ? "Try camera and microphone again" : "Allow camera and microphone"}
          </Button>
        ) : null}

        <ProctoringDisclosure engine={p.engine} fullscreenSupported={p.fullscreenSupported} consent={p.consent} onConsentChange={p.onConsentChange} />
      </div>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader title="Session" icon={<FileText className="size-4" />} action={<ButtonLink href="/interview/setup" variant="ghost" size="sm">Edit</ButtonLink>} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
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
            <ul className="grid gap-2">
              <CheckRow icon={<Mic className="size-4" />} label="Microphone (required)" ok={p.mic === "granted"} error={p.mic === "denied" || p.mic === "unavailable"} loading={p.mic === "requesting"} detail={deviceText("Microphone", p.mic)} />
              <CheckRow
                icon={<Camera className="size-4" />}
                label="Camera"
                ok={p.camera === "granted"}
                error={p.camera === "denied" || p.camera === "unavailable"}
                loading={p.camera === "requesting"}
                detail={p.camera === "denied" || p.camera === "unavailable" ? `${deviceText("Camera", p.camera)} You can still interview with audio only.` : deviceText("Camera", p.camera)}
              />
              <CheckRow
                icon={<AudioLines className="size-4" />}
                label="Speech to text"
                ok={p.engine !== "none"}
                error={p.engine === "none"}
                detail={p.engine === "browser" ? "Live captions in this browser" : p.engine === "server" ? "Transcribed after each answer (this browser has no live captions)" : "This browser can't capture speech. Use a recent Chrome, Edge or Safari."}
              />
              <CheckRow
                icon={<ScanFace className="size-4" />}
                label="Face presence check (optional)"
                ok={p.detector === "ready"}
                loading={p.detector === "loading"}
                detail={p.detector === "ready" ? "Ready (runs on this device)" : p.detector === "error" ? "Unavailable here; only tab switches will be checked" : p.detector === "loading" ? "Loading…" : "Loads a small on-device model"}
                action={p.detector === "idle" || p.detector === "error" ? <Button size="sm" variant="secondary" onClick={p.onLoadDetector}>{p.detector === "error" ? "Retry" : "Load"}</Button> : undefined}
              />
            </ul>
          </CardBody>
        </Card>

        {p.scheduleMessage ? <Alert tone="info">{p.scheduleMessage}</Alert> : null}
        {p.message ? <Alert tone="error">{p.message}</Alert> : null}
        <Button size="lg" onClick={p.onStart} disabled={!p.canStart} loading={p.starting} className="w-full">
          {p.starting ? "Joining…" : "Start interview"}
        </Button>
        <ButtonLink href="/" variant="ghost" className="w-full">
          Back to dashboard
        </ButtonLink>
      </div>
    </div>
  );
}

export type CallPhase = "connecting" | "ai_speaking" | "listening" | "candidate_speaking" | "muted" | "transcribing" | "saving" | "thinking" | "paused" | "error";

const PHASE_LABEL: Record<CallPhase, string> = {
  connecting: "Connecting…",
  ai_speaking: "Interviewer is speaking",
  listening: "Listening… your turn to answer",
  candidate_speaking: "You're speaking",
  muted: "Your microphone is muted",
  transcribing: "Transcribing your answer…",
  saving: "Saving your answer…",
  thinking: "Interviewer is preparing the next question…",
  paused: "Paused",
  error: "Needs attention",
};

/** The large interviewer tile with its live caption. */
export function InterviewerStage({ phase, caption, children }: { phase: CallPhase; caption: string; children?: ReactNode }) {
  const speaking = phase === "ai_speaking";
  const busy = phase === "thinking" || phase === "saving" || phase === "transcribing" || phase === "connecting";
  return (
    <section aria-label="Interviewer" className="relative flex min-h-[22rem] flex-1 flex-col items-center justify-center overflow-hidden rounded-card bg-primary p-6 text-on-primary sm:min-h-[28rem]">
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-on-primary/10 px-3 py-1 text-xs font-medium" aria-live="polite">
        <span className={cn("size-2 rounded-full", speaking ? "bg-success ui-pulse" : phase === "candidate_speaking" || phase === "listening" ? "bg-error ui-pulse" : busy ? "bg-warning ui-pulse" : "bg-on-primary/50")} aria-hidden />
        {PHASE_LABEL[phase]}
      </div>
      <div className={cn("grid size-28 place-items-center rounded-full bg-on-primary/10 ring-on-primary/30 transition-all sm:size-36", speaking && "ring-8 ui-pulse")} aria-hidden>
        <Bot className="size-12 sm:size-16" />
      </div>
      <p className="mt-3 text-sm font-medium text-on-primary/80">AI Interviewer</p>
      {caption ? (
        <p className="mt-6 max-w-2xl text-center text-base leading-7 sm:text-lg" aria-live="polite">
          {caption}
        </p>
      ) : null}
      {children}
    </section>
  );
}

/** Picture-in-picture self view. */
export function SelfView({ stream, version, camera, mic, videoRef }: { stream: MediaStream | null; version: number; camera: DeviceState; mic: DeviceState; videoRef: RefObject<HTMLVideoElement | null> }) {
  return (
    <div className="absolute bottom-4 right-4 w-32 overflow-hidden rounded-control border-2 border-on-primary/30 bg-primary shadow-overlay sm:w-48">
      <div className="relative aspect-video">
        {camera === "granted" ? (
          <StreamVideo stream={stream} version={version} videoRef={videoRef} label="Your camera" className="size-full" />
        ) : (
          <div className="grid size-full place-items-center text-xs text-on-primary/80">{camera === "off" ? "Camera off" : "No camera"}</div>
        )}
        <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-primary/80 px-1.5 py-0.5 text-[10px] text-on-primary">
          {mic === "granted" ? <Mic className="size-3" aria-hidden /> : <MicOff className="size-3 text-error" aria-hidden />}
          You
        </span>
        {camera === "granted" ? <span className="absolute right-1 top-1 size-2 rounded-full bg-error" title="Camera is on" aria-label="Camera is on" /> : null}
      </div>
    </div>
  );
}

function RoundButton({ label, pressed, danger, onClick, disabled, children }: { label: string; pressed?: boolean; danger?: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        "grid size-12 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "bg-error text-on-primary hover:bg-error/90" : pressed === false ? "bg-error-soft text-error hover:bg-error-soft/80" : "bg-surface text-text hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Bottom call controls. */
export function CallControls(p: { micOn: boolean; cameraOn: boolean; micDisabled?: boolean; ending?: boolean; onToggleMic: () => void; onToggleCamera: () => void; onEnd: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-card border border-border bg-surface-muted px-4 py-3">
      <RoundButton label={p.micOn ? "Mute microphone" : "Unmute microphone"} pressed={p.micOn} onClick={p.onToggleMic} disabled={p.micDisabled}>
        {p.micOn ? <Mic className="size-5" aria-hidden /> : <MicOff className="size-5" aria-hidden />}
      </RoundButton>
      <RoundButton label={p.cameraOn ? "Turn camera off" : "Turn camera on"} pressed={p.cameraOn} onClick={p.onToggleCamera}>
        {p.cameraOn ? <Video className="size-5" aria-hidden /> : <VideoOff className="size-5" aria-hidden />}
      </RoundButton>
      {p.children}
      <RoundButton label="End interview" danger onClick={p.onEnd} disabled={p.ending}>
        <PhoneOff className="size-5" aria-hidden />
      </RoundButton>
    </div>
  );
}
