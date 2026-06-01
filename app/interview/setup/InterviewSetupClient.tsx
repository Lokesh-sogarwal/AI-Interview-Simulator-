"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";

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

    const type = parsed.type === "Technical" || parsed.type === "Mixed" ? parsed.type : "HR";
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
  const [type, setType] = useState<InterviewType>("Mixed");
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

      setMessage("Interview scheduled successfully. Redirecting to history…");
      window.setTimeout(() => {
        window.location.href = "/history";
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
      {/* Header with Profile Dropdown */}
      <PageHeader 
        title="Interview Setup" 
        subtitle="Configure your interview details"
        showProfile={true}
      />

      <main className="mx-auto w-full max-w-5xl px-6 py-8 pb-16">
        <form onSubmit={onSubmit} className="space-y-6">
          {/* Title Section */}
          <div>
            <h2 className="text-2xl font-bold text-foreground">Configure Your Interview</h2>
            <p className="mt-1 text-sm text-foreground/70">
              Set your preferences and let us tailor the experience to your needs
            </p>
          </div>

          {/* Practice Mode Card */}
          <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6">
            <div className="mb-4">
              <h3 className="font-semibold text-foreground">🎯 Practice Mode</h3>
              <p className="mt-1 text-sm text-foreground/70">Choose how you want to practice</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`rounded-lg border-2 p-4 cursor-pointer transition-all ${
                interactionMode === "typing"
                  ? "border-blue-500 bg-blue-500/5"
                  : "border-foreground/10 hover:border-foreground/20"
              }`}>
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="interactionMode"
                    value="typing"
                    checked={interactionMode === "typing"}
                    onChange={() => setInteractionMode("typing")}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-foreground">⌨️ Typing Practice</div>
                    <p className="mt-1 text-xs text-foreground/70">Type answers and submit like a standard practice interview</p>
                  </div>
                </div>
              </label>

              <label className={`rounded-lg border-2 p-4 cursor-pointer transition-all ${
                interactionMode === "video"
                  ? "border-blue-500 bg-blue-500/5"
                  : "border-foreground/10 hover:border-foreground/20"
              }`}>
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="interactionMode"
                    value="video"
                    checked={interactionMode === "video"}
                    onChange={() => setInteractionMode("video")}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-foreground">📹 Video Call</div>
                    <p className="mt-1 text-xs text-foreground/70">Uses your webcam and microphone with questions read aloud</p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Interview Details Grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Interview Type */}
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6">
              <label className="block">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">🎤</span>
                  <span className="text-sm font-semibold text-foreground">Interview Type</span>
                </div>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as InterviewType)}
                  className="w-full rounded-lg border border-foreground/15 bg-background px-4 py-3 text-sm font-medium transition-all hover:border-foreground/25 focus:border-blue-500 focus:outline-none"
                >
                  <option value="HR">HR Interview</option>
                  <option value="Technical">Technical Interview</option>
                </select>
              </label>
            </div>

            {/* Difficulty */}
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6">
              <label className="block">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">📊</span>
                  <span className="text-sm font-semibold text-foreground">Difficulty</span>
                </div>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="w-full rounded-lg border border-foreground/15 bg-background px-4 py-3 text-sm font-medium transition-all hover:border-foreground/25 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Adaptive">Adaptive</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </label>
            </div>

            {/* Role */}
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6 md:col-span-2">
              <label className="block">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">💼</span>
                  <span className="text-sm font-semibold text-foreground">Target Role</span>
                </div>
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g., Senior Software Engineer, Product Manager"
                  className="w-full rounded-lg border border-foreground/15 bg-background px-4 py-3 text-sm transition-all placeholder:text-foreground/50 hover:border-foreground/25 focus:border-blue-500 focus:outline-none"
                />
              </label>
            </div>

            {/* Experience */}
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6">
              <label className="block">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">⏱️</span>
                  <span className="text-sm font-semibold text-foreground">Experience Level</span>
                </div>
                <select
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="w-full rounded-lg border border-foreground/15 bg-background px-4 py-3 text-sm font-medium transition-all hover:border-foreground/25 focus:border-blue-500 focus:outline-none"
                >
                  <option value="0-2 years">0-2 years</option>
                  <option value="2-5 years">2-5 years</option>
                  <option value="5-8 years">5-8 years</option>
                  <option value="8+ years">8+ years</option>
                </select>
              </label>
            </div>

            {/* Company */}
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6">
              <label className="block">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">🏢</span>
                  <span className="text-sm font-semibold text-foreground">Company (Optional)</span>
                </div>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g., Google, Meta, Amazon"
                  className="w-full rounded-lg border border-foreground/15 bg-background px-4 py-3 text-sm transition-all placeholder:text-foreground/50 hover:border-foreground/25 focus:border-blue-500 focus:outline-none"
                />
              </label>
            </div>

            {/* Focus Areas */}
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6 md:col-span-2">
              <label className="block">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">🎯</span>
                  <span className="text-sm font-semibold text-foreground">Focus Areas (Optional)</span>
                </div>
                <textarea
                  value={focusAreas}
                  onChange={(e) => setFocusAreas(e.target.value)}
                  placeholder="e.g., leadership, system design, React, API design, project management"
                  className="w-full rounded-lg border border-foreground/15 bg-background px-4 py-3 text-sm transition-all placeholder:text-foreground/50 hover:border-foreground/25 focus:border-blue-500 focus:outline-none"
                  rows={3}
                />
              </label>
              <p className="mt-2 text-xs text-foreground/60">Separate topics with commas for tailored questions</p>
            </div>
          </div>

          {/* Resume Section */}
          <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6">
            <div className="mb-4">
              <h3 className="font-semibold text-foreground">📄 Resume</h3>
              <p className="mt-1 text-sm text-foreground/70">Upload to personalize questions based on your experience</p>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <label className={`rounded-lg border-2 p-4 cursor-pointer transition-all ${
                resumeMode === "upload"
                  ? "border-blue-500 bg-blue-500/5"
                  : "border-foreground/10 hover:border-foreground/20"
              }`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="resumeMode"
                    value="upload"
                    checked={resumeMode === "upload"}
                    onChange={() => setResumeMode("upload")}
                  />
                  <div className="font-medium text-foreground">Upload Resume</div>
                </div>
              </label>

              <label className={`rounded-lg border-2 p-4 cursor-pointer transition-all ${
                resumeMode === "default"
                  ? "border-blue-500 bg-blue-500/5"
                  : "border-foreground/10 hover:border-foreground/20"
              }`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="resumeMode"
                    value="default"
                    checked={resumeMode === "default"}
                    onChange={() => setResumeMode("default")}
                  />
                  <div className="font-medium text-foreground">Skip Resume</div>
                </div>
              </label>
            </div>

            {resumeMode === "upload" && (
              <label className="block cursor-pointer rounded-lg border-2 border-dashed border-foreground/25 p-6 transition-all hover:border-foreground/40 hover:bg-foreground/5">
                <input
                  type="file"
                  className="sr-only"
                  accept={accept}
                  onChange={(e) => {
                    setResumeFile(e.target.files?.[0] ?? null);
                    setMessage("");
                    setStatus("idle");
                  }}
                />

                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="text-2xl">📁</div>
                  <div className="text-sm font-medium text-foreground">
                    {resumeFile ? resumeFile.name : "Click to upload resume"}
                  </div>
                  <div className="text-xs text-foreground/60">PDF, DOC, or DOCX • Max 10MB</div>
                </div>
              </label>
            )}
          </div>

          {/* Start Options */}
          <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6">
            <div className="mb-4">
              <h3 className="font-semibold text-foreground">⏰ When to Start</h3>
              <p className="mt-1 text-sm text-foreground/70">Start immediately or schedule for later</p>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <label className={`rounded-lg border-2 p-4 cursor-pointer transition-all ${
                startMode === "now"
                  ? "border-blue-500 bg-blue-500/5"
                  : "border-foreground/10 hover:border-foreground/20"
              }`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="startMode"
                    value="now"
                    checked={startMode === "now"}
                    onChange={() => setStartMode("now")}
                  />
                  <div className="font-medium text-foreground">Start Now</div>
                </div>
              </label>

              <label className={`rounded-lg border-2 p-4 cursor-pointer transition-all ${
                startMode === "schedule"
                  ? "border-blue-500 bg-blue-500/5"
                  : "border-foreground/10 hover:border-foreground/20"
              }`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="startMode"
                    value="schedule"
                    checked={startMode === "schedule"}
                    onChange={() => setStartMode("schedule")}
                  />
                  <div className="font-medium text-foreground">Schedule</div>
                </div>
              </label>
            </div>

            {startMode === "schedule" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block">
                    <span className="text-xs font-semibold text-foreground/70">Date</span>
                    <input
                      type="date"
                      value={scheduledDate}
                      min={minScheduleDate}
                      onChange={(e) => {
                        setScheduledDate(e.target.value);
                        setMessage("");
                        setStatus("idle");
                      }}
                      className="mt-2 w-full rounded-lg border border-foreground/15 bg-background px-4 py-3 text-sm transition-all hover:border-foreground/25 focus:border-blue-500 focus:outline-none"
                      required
                    />
                  </label>
                </div>
                <div>
                  <label className="block">
                    <span className="text-xs font-semibold text-foreground/70">Time</span>
                    <select
                      value={scheduledTime}
                      onChange={(e) => {
                        setScheduledTime(e.target.value);
                        setMessage("");
                        setStatus("idle");
                      }}
                      className="mt-2 w-full rounded-lg border border-foreground/15 bg-background px-4 py-3 text-sm transition-all hover:border-foreground/25 focus:border-blue-500 focus:outline-none"
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
              </div>
            )}
          </div>

          {/* Submit Button and Message */}
          <div className="flex flex-col gap-4">
            <button
              type="submit"
              disabled={status === "submitting"}
              className="inline-flex h-12 items-center justify-center rounded-lg bg-blue-600 px-8 font-semibold text-white transition-all enabled:hover:bg-blue-700 disabled:opacity-70"
            >
              {status === "submitting"
                ? startMode === "schedule"
                  ? "⏳ Scheduling…"
                  : "▶ Starting…"
                : startMode === "schedule"
                  ? "📅 Schedule Interview"
                  : "▶ Start Interview"}
            </button>

            {message && (
              <div
                className={`rounded-lg px-4 py-3 text-sm font-medium ${
                  status === "error"
                    ? "border border-red-500/30 bg-red-500/10 text-red-700"
                    : "border border-blue-500/30 bg-blue-500/10 text-blue-700"
                }`}
                role="alert"
              >
                {message}
              </div>
            )}

            {!message && status === "idle" && (
              <div className="text-xs text-foreground/60">
                ✓ All settings can be adjusted before the interview starts
              </div>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
