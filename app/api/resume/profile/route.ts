import { getCurrentUser } from "@/lib/auth";
import { aiFailureDetail } from "@/lib/llm";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";
import { extractTechnologies, parseResume, type ParsedResume } from "@/lib/resumeParsing";
import { resumeLLM } from "@/lib/resumeStore";

/** Legacy profile shape consumed by interview setup and the live interview. */
export type ResumeProfile = {
  summary: string;
  suggested_role: string;
  suggested_experience: string;
  hard_skills: string[];
  soft_skills: string[];
  domains: string[];
  tools: string[];
  projects: Array<{ name?: string; technologies?: string[]; description?: string; responsibilities?: string[]; achievements?: string[]; links?: string[] }>;
  highlights: string[];
  work_experience?: Array<{ company?: string; title?: string; dates?: string; highlights?: string[] }>;
  education?: Array<{ institution?: string; degree?: string; dates?: string; highlights?: string[] }>;
  achievements?: string[];
};

const SOFT_SKILLS = ["communication", "teamwork", "leadership", "ownership", "problem solving", "collaboration", "mentoring", "time management", "adaptability"];

function experienceBucket(p: ParsedResume) {
  const years = p.experience
    .map((e) => {
      const start = Number(e.startDate?.match(/\d{4}/)?.[0]);
      const end = /present|current|now/i.test(e.endDate || "") ? new Date().getFullYear() : Number(e.endDate?.match(/\d{4}/)?.[0]);
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : 0;
    })
    .reduce((a, b) => a + b, 0);
  if (years <= 2) return "0-2 years";
  if (years <= 5) return "2-5 years";
  if (years <= 8) return "5-8 years";
  return "8+ years";
}

function suggestedRole(p: ParsedResume) {
  const latest = p.experience.find((e) => e.role)?.role;
  if (latest) return latest;
  const tech = new Set([...p.skills, ...p.projects.flatMap((x) => x.technologies)].map((s) => s.toLowerCase()));
  const has = (...t: string[]) => t.some((x) => tech.has(x));
  if (has("react", "next.js", "vue", "angular") && has("node.js", "express", "django", "flask", "spring boot")) return "Full Stack Developer";
  if (has("react", "next.js", "vue", "angular")) return "Frontend Developer";
  if (has("node.js", "express", "django", "flask", "spring boot", "fastapi")) return "Backend Developer";
  if (has("pytorch", "tensorflow", "scikit-learn")) return "Machine Learning Engineer";
  return "Software Engineer";
}

function toLegacyProfile(p: ParsedResume, text: string): ResumeProfile {
  const lower = text.toLowerCase();
  return {
    summary: p.summary || "",
    suggested_role: suggestedRole(p),
    suggested_experience: experienceBucket(p),
    hard_skills: Array.from(new Set([...p.skills, ...extractTechnologies(text)])).slice(0, 30),
    soft_skills: SOFT_SKILLS.filter((s) => lower.includes(s)),
    domains: [],
    tools: [],
    projects: p.projects.map((pr) => ({
      name: pr.name,
      technologies: pr.technologies,
      description: pr.description,
      responsibilities: pr.responsibilities,
      achievements: pr.achievements,
      links: pr.links,
    })),
    highlights: p.achievements.slice(0, 5),
    work_experience: p.experience.map((e) => ({
      company: e.company,
      title: e.role,
      dates: [e.startDate, e.endDate].filter(Boolean).join(" – ") || undefined,
      highlights: [...e.responsibilities, ...e.achievements].slice(0, 6),
    })),
    education: p.education.map((e) => ({
      institution: e.institution,
      degree: [e.degree, e.fieldOfStudy && !e.degree?.includes(e.fieldOfStudy) ? e.fieldOfStudy : ""].filter(Boolean).join(", ") || undefined,
      dates: [e.startDate, e.endDate].filter(Boolean).join(" – ") || undefined,
      highlights: e.grade ? [`Grade: ${e.grade}`] : [],
    })),
    achievements: [...p.achievements, ...p.certifications],
  };
}

/** Parses raw resume text (without storing it) and returns both shapes. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(request, { keyPrefix: "resume:profile", key: user.id, limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as { resumeText?: string } | null;
  const resumeText = clampString(String(body?.resumeText ?? "").trim(), 20000);
  if (!resumeText) return Response.json({ ok: false, error: "Missing resumeText." }, { status: 400 });

  const outcome = await parseResume(resumeText, resumeLLM(), new Date(), () => aiFailureDetail().text);
  return Response.json({
    ok: true,
    profile: toLegacyProfile(outcome.parsed, resumeText),
    parsed: outcome.parsed,
    warnings: outcome.warnings,
    missingSections: outcome.missingSections,
    // "fallback" kept for existing clients that check for it.
    source: outcome.parsed.sourceMetadata.source === "rules" ? "fallback" : outcome.parsed.sourceMetadata.source,
  });
}
