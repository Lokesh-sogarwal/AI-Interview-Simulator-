/**
 * Browser storage contract shared by the setup page, the live interview, the
 * resume checker and scheduled-interview starts. Keys and shapes are unchanged
 * from earlier versions so existing saved settings keep working.
 */
import type { Difficulty, InterviewType } from "@/lib/prompts";

export const DETAILS_KEY = "aisim_interview_details";
export const RESUME_KEY = "aisim_resume_text";
export const INTERVIEW_ID_KEY = "aisim_interview_id";
export const TURNS_KEY = "aisim_turns";
export const RESUME_ID_KEY = "aisim_resume_id";

export const INTERVIEW_TYPES: InterviewType[] = ["HR", "Technical", "Mixed"];
export const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard", "Adaptive"];
export const EXPERIENCE_LEVELS = ["0-2 years", "2-5 years", "5-8 years", "8+ years"] as const;

export type InteractionMode = "typing" | "video";

export type InterviewDetails = {
  type: InterviewType;
  role: string;
  experience: string;
  difficulty: Difficulty;
  company: string;
  focusAreas: string;
  useResume: boolean;
  interactionMode: InteractionMode;
};

export const DEFAULT_DETAILS: InterviewDetails = {
  type: "Mixed",
  role: "Software Engineer",
  experience: "0-2 years",
  difficulty: "Adaptive",
  company: "",
  focusAreas: "",
  useResume: false,
  interactionMode: "video",
};

export function normalizeExperience(raw: unknown) {
  const v = typeof raw === "string" ? raw.trim() : "";
  return (EXPERIENCE_LEVELS as readonly string[]).includes(v) ? v : DEFAULT_DETAILS.experience;
}

/** Validates stored details; every field falls back to a safe default. */
export function parseDetails(value: string | null): InterviewDetails | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<InterviewDetails> | null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      type: INTERVIEW_TYPES.includes(parsed.type as InterviewType) ? (parsed.type as InterviewType) : DEFAULT_DETAILS.type,
      difficulty: DIFFICULTIES.includes(parsed.difficulty as Difficulty) ? (parsed.difficulty as Difficulty) : DEFAULT_DETAILS.difficulty,
      role: typeof parsed.role === "string" && parsed.role.trim() ? parsed.role.trim().slice(0, 120) : DEFAULT_DETAILS.role,
      experience: typeof parsed.experience === "string" && parsed.experience.trim() ? parsed.experience.trim().slice(0, 40) : DEFAULT_DETAILS.experience,
      company: typeof parsed.company === "string" ? parsed.company.slice(0, 80) : "",
      focusAreas: typeof parsed.focusAreas === "string" ? parsed.focusAreas.slice(0, 600) : "",
      useResume: parsed.useResume !== false,
      // Interviews are video-only; settings saved by the old typing mode open as video.
      interactionMode: "video",
    };
  } catch {
    return null;
  }
}

function safeGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, quota); callers continue without it.
  }
}

export function loadDetails() {
  return parseDetails(safeGet(DETAILS_KEY));
}

export function saveDetails(details: InterviewDetails) {
  safeSet(DETAILS_KEY, JSON.stringify(details));
}

export function loadResumeText() {
  return safeGet(RESUME_KEY)?.trim() || "";
}

export function saveResumeText(text: string | null) {
  safeSet(RESUME_KEY, text && text.trim() ? text : null);
}

export function loadInterviewId() {
  return safeGet(INTERVIEW_ID_KEY)?.trim() || "";
}

export function saveInterviewId(id: string | null) {
  safeSet(INTERVIEW_ID_KEY, id);
}

export function saveTurns(turns: unknown[]) {
  safeSet(TURNS_KEY, JSON.stringify(turns));
}

export function loadTurns<T>(): T[] {
  try {
    const parsed = JSON.parse(safeGet(TURNS_KEY) || "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Id of the stored, parsed resume (server-side) used for the next interview. */
export function loadResumeId() {
  const id = safeGet(RESUME_ID_KEY)?.trim() || "";
  return /^[a-f\d]{24}$/i.test(id) ? id : "";
}

export function saveResumeId(id: string | null) {
  safeSet(RESUME_ID_KEY, id);
}
