"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  Briefcase,
  CalendarClock,
  CircleCheck,
  FileText,
  Gauge,
  Layers,
  MessagesSquare,
  Play,
  Upload,
  UserRound,
  Video,
  Wrench,
  Zap,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  OptionCards,
  PageContainer,
  PageHeader,
  Select,
  Textarea,
  cn,
} from "@/app/components/ui";
import type { Difficulty, InterviewType } from "@/lib/prompts";
import {
  DEFAULT_DETAILS,
  EXPERIENCE_LEVELS,
  loadDetails,
  loadResumeId,
  loadResumeText,
  normalizeExperience,
  saveDetails,
  saveInterviewId,
  saveResumeId,
  saveResumeText,
  type InterviewDetails,
} from "@/app/lib/interviewStorage";

type ResumeMode = "upload" | "saved" | "none";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

async function uploadResume(file: File) {
  const formData = new FormData();
  formData.set("resume", file);
  const response = await fetch("/api/resume", { method: "POST", body: formData });
  const payload = (await response.json().catch(() => null)) as {
    ok: boolean;
    error?: string;
    resumeText?: string | null;
    resumeId?: string | null;
    warnings?: string[];
    parsed?: { skills?: string[]; projects?: Array<{ technologies?: string[] }> };
  } | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Resume upload failed. Please try again.");
  const text = payload.resumeText?.trim() || "";
  if (!text) throw new Error("No text could be read from that file. Try a PDF with selectable text or a .txt file.");
  const skills = uniq([...(payload.parsed?.skills ?? []), ...(payload.parsed?.projects ?? []).flatMap((p) => p.technologies ?? [])]).slice(0, 12);
  return { text, resumeId: payload.resumeId ?? null, skills, warnings: payload.warnings ?? [] };
}

function SectionCard({ step, title, description, done, children }: { step: number; title: string; description: string; done: boolean; children: React.ReactNode }) {
  const headingId = useId();
  return (
    <Card>
      <section aria-labelledby={headingId}>
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
              done ? "bg-success text-white" : "bg-accent text-primary",
            )}
            aria-hidden
          >
            {done ? <CircleCheck className="size-4" /> : step}
          </span>
          <div>
            <h2 id={headingId} className="text-base font-semibold text-text">
              {title}
              <span className="sr-only">{done ? " (complete)" : " (needs input)"}</span>
            </h2>
            <p className="mt-0.5 text-sm text-muted">{description}</p>
          </div>
        </div>
        <CardBody className="grid gap-5">{children}</CardBody>
      </section>
    </Card>
  );
}

export default function InterviewSetupClient() {
  const [details, setDetails] = useState<InterviewDetails>(DEFAULT_DETAILS);
  const [resumeMode, setResumeMode] = useState<ResumeMode>("none");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [savedResume, setSavedResume] = useState("");
  const [startMode, setStartMode] = useState<"now" | "schedule">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsState, setSlotsState] = useState<"idle" | "loading" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ role?: string; resume?: string; schedule?: string }>({});

  const set = <K extends keyof InterviewDetails>(key: K, value: InterviewDetails[K]) => setDetails((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    // Restore the last configuration (storage contract shared with /interview).
    const existing = loadDetails();
    const stored = loadResumeText();
    setSavedResume(stored);
    if (existing) {
      setDetails(existing);
      setResumeMode(existing.useResume && stored ? "saved" : "none");
    } else if (stored) {
      setResumeMode("saved");
    }
  }, []);

  const minScheduleDate = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    if (!scheduledDate) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setSlotsState("loading");
    fetch(`/api/interviews/slots?date=${encodeURIComponent(scheduledDate)}`, { credentials: "include" })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as { ok: boolean; slots?: string[] } | null;
        if (cancelled) return;
        if (!res.ok || !payload?.ok) {
          setSlots([]);
          setSlotsState("error");
          return;
        }
        setSlots(payload.slots ?? []);
        setSlotsState("idle");
      })
      .catch(() => {
        if (!cancelled) setSlotsState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [scheduledDate]);

  useEffect(() => {
    if (scheduledTime && !slots.includes(scheduledTime)) setScheduledTime("");
  }, [slots, scheduledTime]);

  const roleDone = details.role.trim().length > 0;
  const resumeDone = resumeMode === "none" || (resumeMode === "upload" ? Boolean(resumeFile) : Boolean(savedResume));
  const scheduleDone = startMode === "now" || Boolean(scheduledDate && scheduledTime);

  function validate() {
    const errors: typeof fieldErrors = {};
    if (!details.role.trim()) errors.role = "Enter the role you are preparing for.";
    if (resumeMode === "upload" && !resumeFile) errors.resume = "Choose a resume file, or select “No resume”.";
    if (startMode === "schedule" && (!scheduledDate || !scheduledTime)) errors.schedule = "Choose a date and an available time.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      let resumeText = resumeMode === "saved" ? savedResume : "";
      let next: InterviewDetails = { ...details, role: details.role.trim(), company: details.company.trim(), focusAreas: details.focusAreas.trim() };

      let resumeId: string | null = resumeMode === "saved" ? loadResumeId() || null : null;
      if (resumeMode === "upload" && resumeFile) {
        setProgress("Reading your resume…");
        const uploaded = await uploadResume(resumeFile);
        resumeText = uploaded.text;
        resumeId = uploaded.resumeId;
        if (!next.focusAreas && uploaded.skills.length) next = { ...next, focusAreas: uploaded.skills.join(", ") };
        if (uploaded.warnings.length) setNotice("Your resume was uploaded with warnings; open the Resume checker to review what was parsed.");
      }

      const useResume = Boolean(resumeText);
      next = { ...next, useResume };
      saveDetails(next);
      saveResumeText(useResume ? resumeText : null);
      saveResumeId(useResume ? resumeId : null);

      if (startMode === "schedule") {
        setProgress("Scheduling…");
        const scheduledLocal = new Date(`${scheduledDate}T${scheduledTime}`);
        const res = await fetch("/api/interviews/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...next, scheduledFor: scheduledLocal.toISOString(), resumeText: useResume ? resumeText : "", resumeId: useResume ? resumeId : null }),
        });
        const payload = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
        if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Could not schedule the interview. Please try again.");
        window.location.href = "/history?scheduled=1";
        return;
      }

      // A fresh session: never reuse an earlier interview id.
      saveInterviewId(null);
      window.location.href = "/interview";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
      setProgress("");
    }
  }

  const summary: Array<[string, string]> = [
    ["Type", details.type],
    ["Difficulty", details.difficulty],
    ["Role", details.role.trim() || "—"],
    ["Experience", details.experience],
    ["Company", details.company.trim() || "Any"],
    ["Mode", "Video interview"],
    ["Resume", resumeMode === "upload" ? resumeFile?.name || "Not chosen" : resumeMode === "saved" ? "Saved resume" : "None"],
    ["Start", startMode === "now" ? "Now" : scheduledDate && scheduledTime ? `${scheduledDate} at ${scheduledTime}` : "Not scheduled"],
  ];

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "New interview" }]}
        title="Set up your interview"
        description="Tell the interviewer what to focus on. You can change these settings every time."
      />

      <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="grid gap-6">
          <SectionCard step={1} title="Interview style" description="What kind of questions and how hard they should be." done>
            <OptionCards<InterviewType>
              label="Interview type"
              value={details.type}
              onChange={(v) => set("type", v)}
              options={[
                { value: "HR", label: "HR", description: "Behavioural: communication, ownership, conflict.", icon: <MessagesSquare className="size-4" /> },
                { value: "Technical", label: "Technical", description: "Projects, architecture, debugging, problem solving.", icon: <Wrench className="size-4" /> },
                { value: "Mixed", label: "Mixed", description: "A blend of technical and HR questions.", icon: <Layers className="size-4" /> },
              ]}
            />
            <OptionCards<Difficulty>
              label="Difficulty"
              value={details.difficulty}
              onChange={(v) => set("difficulty", v)}
              columns={4}
              options={[
                { value: "Easy", label: "Easy", description: "Fundamentals" },
                { value: "Medium", label: "Medium", description: "Typical interview level" },
                { value: "Hard", label: "Hard", description: "Deep, senior-level" },
                { value: "Adaptive", label: "Adaptive", description: "Starts medium, adjusts to each answer", icon: <Gauge className="size-4" /> },
              ]}
            />
          </SectionCard>

          <SectionCard step={2} title="Target role" description="Used to tailor questions to the job you want." done={roleDone}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job role" required error={fieldErrors.role}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    value={details.role}
                    onChange={(e) => set("role", e.target.value)}
                    maxLength={120}
                    placeholder="e.g. Backend Engineer"
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    autoComplete="organization-title"
                  />
                )}
              </Field>
              <Field label="Experience level">
                {({ id }) => (
                  <Select id={id} value={normalizeExperience(details.experience)} onChange={(e) => set("experience", e.target.value)}>
                    {EXPERIENCE_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Target company" hint="Optional">
                {({ id, describedBy }) => (
                  <Input id={id} value={details.company} onChange={(e) => set("company", e.target.value)} maxLength={80} placeholder="e.g. Acme Corp" aria-describedby={describedBy} />
                )}
              </Field>
              <Field label="Focus areas" hint="Optional, comma separated. Filled from your resume if left empty." className="sm:col-span-2">
                {({ id, describedBy }) => (
                  <Textarea
                    id={id}
                    rows={2}
                    value={details.focusAreas}
                    onChange={(e) => set("focusAreas", e.target.value)}
                    maxLength={600}
                    placeholder="e.g. system design, REST APIs, leadership"
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
            </div>
          </SectionCard>

          <SectionCard step={3} title="Resume and mode" description="Ground questions in your experience and choose how to answer." done={resumeDone}>
            <OptionCards<ResumeMode>
              label="Resume"
              value={resumeMode}
              onChange={(v) => {
                setResumeMode(v);
                setFieldErrors((f) => ({ ...f, resume: undefined }));
              }}
              options={[
                { value: "upload", label: "Upload resume", description: "PDF with selectable text, or .txt (max 5 MB).", icon: <Upload className="size-4" /> },
                {
                  value: "saved",
                  label: "Use saved resume",
                  description: savedResume ? "The resume from your last setup or the resume checker." : "No saved resume on this device.",
                  icon: <FileText className="size-4" />,
                  disabled: !savedResume,
                },
                { value: "none", label: "No resume", description: "General questions for the role.", icon: <UserRound className="size-4" /> },
              ]}
            />
            {resumeMode === "upload" ? (
              <Field label="Resume file" error={fieldErrors.resume} hint={resumeFile ? `${resumeFile.name} · ${(resumeFile.size / 1024).toFixed(0)} KB` : "Your file is parsed for text and not stored."}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    className="h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file && file.size > MAX_RESUME_BYTES) {
                        setFieldErrors((f) => ({ ...f, resume: "That file is larger than 5 MB." }));
                        setResumeFile(null);
                        e.target.value = "";
                        return;
                      }
                      setFieldErrors((f) => ({ ...f, resume: undefined }));
                      setResumeFile(file);
                    }}
                  />
                )}
              </Field>
            ) : null}

            <div className="flex items-start gap-3 rounded-control border border-border bg-surface-muted p-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-primary" aria-hidden>
                <Video className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-text">Video interview</p>
                <p className="mt-0.5 text-xs text-muted">The AI interviewer asks each question aloud and you answer by speaking, with 60 seconds per answer. You&rsquo;ll need a microphone; a camera is recommended.</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard step={4} title="When to start" description="Start right away or book a time slot." done={scheduleDone}>
            <OptionCards<"now" | "schedule">
              label="Start time"
              value={startMode}
              onChange={setStartMode}
              columns={2}
              options={[
                { value: "now", label: "Start now", icon: <Zap className="size-4" /> },
                { value: "schedule", label: "Schedule for later", description: "Appears on your dashboard and history.", icon: <CalendarClock className="size-4" /> },
              ]}
            />
            {startMode === "schedule" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date" required>
                  {({ id }) => <Input id={id} type="date" min={minScheduleDate} value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />}
                </Field>
                <Field
                  label="Time"
                  required
                  error={fieldErrors.schedule}
                  hint={slotsState === "loading" ? "Loading available slots…" : slotsState === "error" ? "Could not load slots. Try another date." : scheduledDate && slots.length === 0 ? "No slots left on this date." : "Slots run 09:00–17:30 in your local time."}
                >
                  {({ id, describedBy, invalid }) => (
                    <Select id={id} value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} disabled={!scheduledDate || slotsState === "loading"} aria-describedby={describedBy} aria-invalid={invalid}>
                      <option value="">Select a time</option>
                      {slots.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            ) : null}
          </SectionCard>
        </div>

        <aside className="lg:sticky lg:top-6">
          <Card>
            <CardHeader title="Review" description="Check your choices before you begin." icon={<Briefcase className="size-4" />} />
            <CardBody className="grid gap-4">
              <dl className="grid gap-2 text-sm">
                {summary.map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="max-w-[60%] break-words text-right font-medium text-text">{v}</dd>
                  </div>
                ))}
              </dl>
              <Badge tone="info" className="w-fit">
                You will be asked for camera and microphone access
              </Badge>
              {error ? <Alert tone="error">{error}</Alert> : null}
              {notice ? <Alert tone="warning">{notice}</Alert> : null}
              <Button type="submit" size="lg" loading={submitting} icon={<Play className="size-4" aria-hidden />} className="w-full">
                {submitting ? progress || "Preparing…" : startMode === "schedule" ? "Schedule interview" : "Start interview"}
              </Button>
              <p className="sr-only" aria-live="polite">
                {progress}
              </p>
            </CardBody>
          </Card>
        </aside>
      </form>
    </PageContainer>
  );
}
