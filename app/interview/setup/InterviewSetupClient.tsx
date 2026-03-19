"use client";

import { useEffect, useMemo, useState } from "react";

import type { Difficulty, InterviewType } from "@/lib/prompts";

type InterviewDetails = {
  type: InterviewType;
  role: string;
  experience: string;
  difficulty: Difficulty;
  company?: string;
  focusAreas?: string;
  useResume: boolean;
  interactionMode: "typing" | "video";
};

const DETAILS_KEY = "aisim_interview_details";
const RESUME_KEY = "aisim_resume_text";
const INTERVIEW_ID_KEY = "aisim_interview_id";

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

function normalizeExperienceBucket(raw: string) {
  const v = raw.trim();
  if (v === "0-2 years" || v === "2-5 years" || v === "5-8 years" || v === "8+ years") return v;
  return "0-2 years";
}

function safeParseDetails(value: string | null): InterviewDetails | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<InterviewDetails>;
    if (!parsed || typeof parsed !== "object") return null;

    const type = parsed.type === "Technical" ? "Technical" : "HR";
    const difficulty =
      parsed.difficulty === "Easy" || parsed.difficulty === "Hard" || parsed.difficulty === "Adaptive"
        ? parsed.difficulty
        : "Medium";
    const role = typeof parsed.role === "string" && parsed.role.trim() ? parsed.role : "Software Engineer";
    const experience = typeof parsed.experience === "string" && parsed.experience.trim() ? parsed.experience : "0-2 years";

    return {
      type,
      role,
      experience,
      difficulty,
      company: typeof parsed.company === "string" ? parsed.company : "",
      focusAreas: typeof parsed.focusAreas === "string" ? parsed.focusAreas : "",
      useResume: parsed.useResume !== false,
      interactionMode: parsed.interactionMode === "video" ? "video" : "typing",
    };
  } catch {
    return null;
  }
}

export default function InterviewSetupClient() {
  const [type, setType] = useState<InterviewType>("HR");
  const [role, setRole] = useState("Software Engineer");
  const [experience, setExperience] = useState("0-2 years");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [company, setCompany] = useState("");
  const [focusAreas, setFocusAreas] = useState("");
  const [interactionMode, setInteractionMode] = useState<"typing" | "video">("typing");

  const [resumeMode, setResumeMode] = useState<"upload" | "default">("upload");
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const [startMode, setStartMode] = useState<"now" | "schedule">("now");
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [scheduledTime, setScheduledTime] = useState<string>("");

  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  const accept = useMemo(() => ".pdf,.doc,.docx", []);

  const minScheduleDate = useMemo(() => {
    const now = new Date();
    const y = String(now.getFullYear());
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!scheduledDate) {
        setAvailableTimeSlots([]);
        return;
      }

      setSlotsLoading(true);
      try {
        const res = await fetch(`/api/interviews/slots?date=${encodeURIComponent(scheduledDate)}`, {
          method: "GET",
          credentials: "include",
        });
        const payload = (await res.json().catch(() => null)) as
          | { ok: true; slots: string[] }
          | { ok: false; error: string }
          | null;

        if (cancelled) return;
        if (!res.ok || !payload || payload.ok === false) {
          setAvailableTimeSlots([]);
          return;
        }

        setAvailableTimeSlots(Array.isArray(payload.slots) ? payload.slots : []);
      } catch {
        if (!cancelled) setAvailableTimeSlots([]);
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [scheduledDate]);

  useEffect(() => {
    // If the selected time is no longer available (e.g. user changes date), reset.
    if (!scheduledTime) return;
    if (availableTimeSlots.includes(scheduledTime)) return;
    setScheduledTime("");
  }, [availableTimeSlots, scheduledTime]);

  useEffect(() => {
    const existing = safeParseDetails(window.localStorage.getItem(DETAILS_KEY));
    if (!existing) return;

    setType(existing.type);
    setRole(existing.role);
    setExperience(existing.experience);
    setDifficulty(existing.difficulty);
    setCompany(existing.company || "");
    setFocusAreas(existing.focusAreas || "");
    setResumeMode(existing.useResume ? "upload" : "default");
    setInteractionMode(existing.interactionMode === "video" ? "video" : "typing");
  }, []);

  function persistDetails(useResume: boolean, overrides?: Partial<InterviewDetails>) {
    const details: InterviewDetails = {
      type,
      role: role.trim() || "Software Engineer",
      experience: experience.trim() || "0-2 years",
      difficulty,
      company: company.trim(),
      focusAreas: focusAreas.trim(),
      useResume,
      interactionMode,
      ...overrides,
    };

    window.localStorage.setItem(DETAILS_KEY, JSON.stringify(details));
  }

  async function uploadResumeText(): Promise<string> {
    if (!resumeFile) {
      throw new Error("Please select a resume file, or choose Default.");
    }

    const formData = new FormData();
    formData.set("resume", resumeFile);

    const response = await fetch("/api/resume", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          ok: true;
          filename: string;
          size: number;
          type: string;
          resumeText: string | null;
        }
      | { ok: false; error: string }
      | null;

    if (!response.ok || !payload || payload.ok === false) {
      const errorMessage =
        payload && "error" in payload && payload.error
          ? payload.error
          : "Upload failed. Please try again.";
      throw new Error(errorMessage);
    }

    return payload.resumeText?.trim() || "";
  }

  async function startDefault() {
    persistDetails(false);
    window.localStorage.removeItem(RESUME_KEY);
    window.localStorage.removeItem(INTERVIEW_ID_KEY);
    window.location.href = "/interview";
  }

  async function uploadAndStart() {
    try {
      setStatus("submitting");
      setMessage("Uploading resume…");

      const extractedText = await uploadResumeText();
      if (extractedText) window.localStorage.setItem(RESUME_KEY, extractedText);
      else window.localStorage.removeItem(RESUME_KEY);

      window.localStorage.removeItem(INTERVIEW_ID_KEY);
      let nextFocusAreas = focusAreas.trim();

      // Use LLM (or fallback) to extract skills and auto-fill Focus areas.
      if (extractedText) {
        try {
          const profileRes = await fetch("/api/resume/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resumeText: extractedText, role, experience }),
          });

          const profilePayload = (await profileRes.json().catch(() => null)) as
            | {
                ok: true;
                profile: {
                  suggested_role?: string;
                  suggested_experience?: string;
                  hard_skills?: string[];
                  soft_skills?: string[];
                  tools?: string[];
                  domains?: string[];
                  projects?: Array<{ name?: string }>;
                };
              }
            | { ok: false; error: string }
            | null;

          if (profileRes.ok && profilePayload && profilePayload.ok !== false) {
            const p = profilePayload.profile;

            // Auto-fill role/experience if user hasn't customized.
            const suggestedRole = typeof p.suggested_role === "string" ? p.suggested_role.trim() : "";
            const suggestedExp = typeof p.suggested_experience === "string" ? normalizeExperienceBucket(p.suggested_experience) : "";

            const shouldReplaceRole = (role.trim() === "" || role.trim() === "Software Engineer") && suggestedRole;
            const shouldReplaceExp = (experience.trim() === "" || experience.trim() === "0-2 years") && suggestedExp;

            if (shouldReplaceRole) setRole(suggestedRole);
            if (shouldReplaceExp) setExperience(suggestedExp);

            const skills = uniq([
              ...(p.hard_skills || []),
              ...(p.tools || []),
              ...(p.domains || []),
              ...(p.soft_skills || []),
            ]);

            if (skills.length) {
              const suggested = skills.slice(0, 14).join(", ");
              nextFocusAreas = nextFocusAreas ? `${nextFocusAreas}, ${suggested}` : suggested;
              setFocusAreas(nextFocusAreas);
            }

            // Persist inferred fields so /interview uses them even after redirect.
            persistDetails(true, {
              focusAreas: nextFocusAreas,
              role: shouldReplaceRole ? suggestedRole : role,
              experience: shouldReplaceExp ? suggestedExp : experience,
            });
            window.location.href = "/interview";
            return;
          }
        } catch {
          // Ignore skill extraction failures.
        }
      }

      persistDetails(true, { focusAreas: nextFocusAreas });
      window.location.href = "/interview";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setStatus("error");
      setMessage(msg);
    } finally {
      setStatus("idle");
    }
  }

  async function scheduleInterview() {
    try {
      if (!scheduledDate.trim() || !scheduledTime.trim()) {
        setStatus("error");
        setMessage("Please choose a date and an available time slot.");
        return;
      }

      const scheduledLocal = new Date(`${scheduledDate}T${scheduledTime}`);
      if (!Number.isFinite(scheduledLocal.getTime())) {
        setStatus("error");
        setMessage("Please choose a valid date and time.");
        return;
      }

      // Always send ISO (timezone-safe) to the backend.
      const scheduledForIso = scheduledLocal.toISOString();

      setStatus("submitting");
      setMessage("Scheduling…");

      const useResume = resumeMode === "upload";
      let extractedText = "";
      if (useResume) {
        setMessage("Uploading resume…");
        extractedText = await uploadResumeText();
      }

      // Persist what the scheduled interview should use.
      persistDetails(useResume);

      const res = await fetch("/api/interviews/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor: scheduledForIso,
          role,
          experience,
          type,
          difficulty,
          company,
          focusAreas,
          interactionMode,
          useResume,
          resumeText: useResume ? extractedText : "",
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { ok: true; id: string }
        | { ok: false; error: string }
        | null;

      if (!res.ok || !payload || payload.ok === false) {
        const errorMessage =
          payload && "error" in payload && payload.error
            ? payload.error
            : "Could not schedule the interview. Please try again.";
        setStatus("error");
        setMessage(errorMessage);
        return;
      }

      setMessage("Interview scheduled successfully. Redirecting to dashboard…");
      window.setTimeout(() => {
        window.location.href = "/dashboard";
      }, 900);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setStatus("error");
      setMessage(msg);
    } finally {
      setStatus("idle");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setStatus("idle");

    if (startMode === "schedule") {
      await scheduleInterview();
      return;
    }

    if (resumeMode === "default") {
      await startDefault();
      return;
    }

    await uploadAndStart();
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6">
        <div className="leading-tight">
          <div className="text-base font-semibold tracking-tight">Interview Setup</div>
          <div className="text-xs text-foreground/70">Enter details and start</div>
        </div>

        <a
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
        >
          Home
        </a>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 pb-16">
        <form onSubmit={onSubmit} className="grid gap-6 rounded-3xl border border-foreground/10 bg-background p-6 md:p-8">
          <div className="grid gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Interview details</h1>
            <p className="text-sm leading-6 text-foreground/70">
              These inputs are used to generate questions (and tailor them using resume skills when provided).
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">Practice mode</span>
              <div className="flex flex-col gap-2 rounded-2xl border border-foreground/15 bg-background p-4 sm:flex-row sm:items-center sm:gap-6">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="interactionMode"
                    value="typing"
                    checked={interactionMode === "typing"}
                    onChange={() => setInteractionMode("typing")}
                  />
                  <span className="text-sm">Typing practice</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="interactionMode"
                    value="video"
                    checked={interactionMode === "video"}
                    onChange={() => setInteractionMode("video")}
                  />
                  <span className="text-sm">Video call (voice)</span>
                </label>

                <div className="text-sm text-foreground/70 sm:ml-auto">
                  {interactionMode === "video"
                    ? "Uses your webcam + microphone and reads questions aloud."
                    : "Type answers and submit like a standard practice interview."}
                </div>
              </div>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Interview type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as InterviewType)}
                className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm"
              >
                <option value="HR">HR</option>
                <option value="Technical">Technical</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm"
              >
                <option value="Adaptive">Adaptive</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">Role</span>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g., Software Engineer"
                className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Experience</span>
              <select
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm"
              >
                <option value="0-2 years">0-2 years</option>
                <option value="2-5 years">2-5 years</option>
                <option value="5-8 years">5-8 years</option>
                <option value="8+ years">8+ years</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Company (optional)</span>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g., Google"
                className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm"
              />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">Focus areas (optional)</span>
              <textarea
                value={focusAreas}
                onChange={(e) => setFocusAreas(e.target.value)}
                placeholder="e.g., leadership, stakeholder management, system design, React"
                className="min-h-24 rounded-2xl border border-foreground/15 bg-background px-4 py-3 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-2xl border border-foreground/10 p-4">
            <div className="text-sm font-medium">Start</div>
            <div className="text-sm text-foreground/70">Start now, or schedule it and begin from the dashboard.</div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="startMode"
                  value="now"
                  checked={startMode === "now"}
                  onChange={() => setStartMode("now")}
                />
                <span className="text-sm">Start now</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="startMode"
                  value="schedule"
                  checked={startMode === "schedule"}
                  onChange={() => setStartMode("schedule")}
                />
                <span className="text-sm">Schedule interview</span>
              </label>

              {startMode === "schedule" ? (
                <div className="grid gap-2 sm:ml-auto sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="sr-only">Scheduled date</span>
                    <input
                      type="date"
                      value={scheduledDate}
                      min={minScheduleDate}
                      onChange={(e) => {
                        setScheduledDate(e.target.value);
                        setMessage("");
                        setStatus("idle");
                      }}
                      className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm"
                      required
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="sr-only">Scheduled time</span>
                    <select
                      value={scheduledTime}
                      onChange={(e) => {
                        setScheduledTime(e.target.value);
                        setMessage("");
                        setStatus("idle");
                      }}
                      className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm"
                      required
                      disabled={!scheduledDate || availableTimeSlots.length === 0}
                    >
                      <option value="">
                        {!scheduledDate
                          ? "Pick a date first"
                          : slotsLoading
                            ? "Loading slots…"
                            : availableTimeSlots.length === 0
                              ? "No slots available"
                              : "Select a time"}
                      </option>
                      {availableTimeSlots.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-foreground/10 p-4">
            <div className="text-sm font-medium">Resume</div>
            <div className="text-sm text-foreground/70">
              Choose Upload for resume-based questions, or Default to start without a resume.
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="resumeMode"
                  value="upload"
                  checked={resumeMode === "upload"}
                  onChange={() => setResumeMode("upload")}
                />
                <span className="text-sm">Upload resume</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="resumeMode"
                  value="default"
                  checked={resumeMode === "default"}
                  onChange={() => setResumeMode("default")}
                />
                <span className="text-sm">Default (no resume)</span>
              </label>
            </div>

            <label className="block cursor-pointer rounded-2xl border border-dashed border-foreground/25 p-4 transition-opacity hover:opacity-95">
              <input
                type="file"
                className="sr-only"
                accept={accept}
                disabled={resumeMode !== "upload"}
                onChange={(e) => {
                  setResumeFile(e.target.files?.[0] ?? null);
                  setMessage("");
                  setStatus("idle");
                }}
              />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Choose a file</div>
                  <div className="text-sm text-foreground/70">
                    {resumeMode !== "upload"
                      ? "Disabled (default mode)"
                      : resumeFile
                        ? resumeFile.name
                        : "PDF, DOC, or DOCX"}
                  </div>
                </div>
                <div className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium">
                  Browse
                </div>
              </div>
            </label>
          </div>

          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={status === "submitting"}
              className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
            >
              {status === "submitting"
                ? startMode === "schedule"
                  ? "Scheduling…"
                  : "Starting…"
                : startMode === "schedule"
                  ? "Schedule interview"
                  : "Start interview"}
            </button>

            <div className={status === "error" ? "text-sm text-foreground" : "text-sm text-foreground/70"} aria-live="polite">
              {message || "You can change these later during the interview."}
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
