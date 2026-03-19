import { safeJsonParse } from "@/lib/openai";
import { llmText } from "@/lib/llm";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";

export type ResumeProfile = {
  summary: string;
  suggested_role: string;
  suggested_experience: string;
  hard_skills: string[];
  soft_skills: string[];
  domains: string[];
  tools: string[];
  projects: Array<{ name?: string; technologies?: string[]; description?: string }>;
  highlights: string[];
  work_experience?: Array<{
    company?: string;
    title?: string;
    dates?: string;
    highlights?: string[];
  }>;
  education?: Array<{
    institution?: string;
    degree?: string;
    dates?: string;
    highlights?: string[];
  }>;
  achievements?: string[];
};

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

function bucketExperience(raw: string) {
  const lower = raw.toLowerCase();
  const match = lower.match(/(\d+(?:\.\d+)?)\s*\+?\s*years?/);
  const years = match ? Number(match[1]) : NaN;
  if (Number.isFinite(years)) {
    if (years <= 2) return "0-2 years";
    if (years <= 5) return "2-5 years";
    if (years <= 8) return "5-8 years";
    return "8+ years";
  }

  if (/(intern|internship|student|b\.?tech|bachelor)/i.test(lower)) return "0-2 years";
  return "0-2 years";
}

function inferRole(resumeText: string) {
  const text = resumeText.toLowerCase();
  const candidates: Array<[RegExp, string]> = [
    [/full[-\s]?stack/, "Full Stack Developer"],
    [/front[-\s]?end/, "Frontend Developer"],
    [/back[-\s]?end/, "Backend Developer"],
    [/software\s+engineer|sde\b/, "Software Engineer"],
    [/data\s+analyst/, "Data Analyst"],
    [/data\s+scientist/, "Data Scientist"],
    [/machine\s+learning|ml\b/, "Machine Learning Engineer"],
    [/devops/, "DevOps Engineer"],
    [/mobile\s+app|android|ios/, "Mobile Developer"],
  ];

  for (const [re, label] of candidates) {
    if (re.test(text)) return label;
  }

  // Heuristic based on stack
  if (/(react|next\.js|nextjs)/i.test(text) && /(node|express|flask|django)/i.test(text)) {
    return "Full Stack Developer";
  }
  if (/(react|next\.js|nextjs)/i.test(text)) return "Frontend Developer";
  if (/(node|express|flask|django)/i.test(text)) return "Backend Developer";

  return "Software Engineer";
}

function extractProjects(resumeText: string): ResumeProfile["projects"] {
  const lines = resumeText
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const startIdx = lines.findIndex((l) => /^projects?$/i.test(l) || /^projects?\b/i.test(l));
  if (startIdx === -1) return [];

  const endIdx = (() => {
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^(work\s+experience|experience|education|skills|certifications|achievements|summary)$/i.test(lines[i])) {
        return i;
      }
    }
    return Math.min(lines.length, startIdx + 20);
  })();

  const slice = lines.slice(startIdx + 1, endIdx);
  const projects: ResumeProfile["projects"] = [];
  let current: { name?: string; technologies?: string[]; description?: string } | null = null;

  for (const l of slice) {
    const isHeaderLike = /^[-•]?\s*[A-Za-z0-9][A-Za-z0-9 .()/#&+_-]{2,}$/.test(l) && l.length <= 80;
    const maybeTech = l.match(/\b(tech|stack|technologies)\b\s*[:\-]\s*(.+)$/i);

    if (isHeaderLike && !maybeTech) {
      if (current && (current.name || current.description)) projects.push(current);
      current = { name: l.replace(/^[-•]\s*/, "").trim() };
      continue;
    }

    if (!current) current = {};

    if (maybeTech) {
      const techList = maybeTech[2]
        .split(/,|\||\//)
        .map((s) => s.trim())
        .filter(Boolean);
      current.technologies = uniq([...(current.technologies || []), ...techList]);
      continue;
    }

    current.description = current.description
      ? `${current.description} ${l}`.trim()
      : l;
  }

  if (current && (current.name || current.description)) projects.push(current);
  return projects.slice(0, 6);
}

function extractSectionLines(params: {
  resumeText: string;
  start: RegExp;
  end: RegExp[];
  maxLines: number;
}) {
  const lines = params.resumeText
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const startIdx = lines.findIndex((l) => params.start.test(l));
  if (startIdx === -1) return [];

  const endIdx = (() => {
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (params.end.some((re) => re.test(lines[i]))) return i;
    }
    return Math.min(lines.length, startIdx + 1 + params.maxLines);
  })();

  return lines.slice(startIdx + 1, endIdx).slice(0, params.maxLines);
}

function extractExperience(resumeText: string): NonNullable<ResumeProfile["work_experience"]> {
  const lines = extractSectionLines({
    resumeText,
    start: /^(work\s+experience|experience)$/i,
    end: [/^education$/i, /^projects?$/i, /^skills?$/i, /^certifications?$/i, /^achievements?$/i, /^summary$/i],
    maxLines: 28,
  });
  if (lines.length === 0) return [];

  const entries: NonNullable<ResumeProfile["work_experience"]> = [];
  let current: NonNullable<ResumeProfile["work_experience"]>[number] | null = null;

  for (const l of lines) {
    const clean = l.replace(/^[-•]\s*/, "").trim();
    const isHeaderLike = clean.length <= 90 && /[A-Za-z]/.test(clean) && !/^\d{4}/.test(clean);
    const hasDate = /(\b\d{4}\b|present|current|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i.test(clean);

    if (isHeaderLike && (clean.includes("-") || clean.includes("|") || hasDate) && (current === null || (current.highlights?.length ?? 0) > 0)) {
      if (current) entries.push(current);
      const parts = clean.split(/\s+[\-|\|]\s+/).map((p) => p.trim()).filter(Boolean);
      current = {
        company: parts[0],
        title: parts[1],
        dates: parts[2],
        highlights: [],
      };
      continue;
    }

    if (!current) current = { highlights: [] };
    current.highlights = [...(current.highlights || []), clean].slice(0, 6);
  }

  if (current && (current.company || current.title || (current.highlights?.length ?? 0) > 0)) {
    entries.push(current);
  }

  return entries.slice(0, 5);
}

function extractEducation(resumeText: string): NonNullable<ResumeProfile["education"]> {
  const lines = extractSectionLines({
    resumeText,
    start: /^education$/i,
    end: [/^(work\s+experience|experience)$/i, /^projects?$/i, /^skills?$/i, /^certifications?$/i, /^achievements?$/i, /^summary$/i],
    maxLines: 18,
  });
  if (lines.length === 0) return [];

  const entries: NonNullable<ResumeProfile["education"]> = [];
  let current: NonNullable<ResumeProfile["education"]>[number] | null = null;

  for (const l of lines) {
    const clean = l.replace(/^[-•]\s*/, "").trim();
    const isHeaderLike = clean.length <= 120 && /[A-Za-z]/.test(clean) && !clean.startsWith("•");
    const hasDegree = /(b\.?tech|bachelor|master|m\.?s\b|mca|phd|degree|university|college)/i.test(clean);
    const hasDate = /(\b\d{4}\b|present|current)/i.test(clean);

    if (isHeaderLike && (hasDegree || hasDate) && (current === null || (current.highlights?.length ?? 0) > 0)) {
      if (current) entries.push(current);
      const parts = clean.split(/\s+[\-|\|]\s+/).map((p) => p.trim()).filter(Boolean);
      current = {
        institution: parts[0],
        degree: parts[1],
        dates: parts[2],
        highlights: [],
      };
      continue;
    }

    if (!current) current = { highlights: [] };
    current.highlights = [...(current.highlights || []), clean].slice(0, 4);
  }

  if (current && (current.institution || current.degree || (current.highlights?.length ?? 0) > 0)) {
    entries.push(current);
  }

  return entries.slice(0, 3);
}

function extractAchievements(resumeText: string): string[] {
  const lines = extractSectionLines({
    resumeText,
    start: /^achievements?$|^certifications?$|^awards?$/i,
    end: [/^(work\s+experience|experience)$/i, /^education$/i, /^projects?$/i, /^skills?$/i, /^summary$/i],
    maxLines: 18,
  });
  return lines
    .map((l) => l.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

function fallbackExtractProfile(resumeText: string): ResumeProfile {
  const text = resumeText.toLowerCase();

  const hardSkillKeywords = [
    "javascript",
    "typescript",
    "react",
    "next.js",
    "nextjs",
    "node",
    "node.js",
    "express",
    "python",
    "java",
    "c++",
    "c#",
    "go",
    "sql",
    "mongodb",
    "postgres",
    "mysql",
    "redis",
    "aws",
    "gcp",
    "azure",
    "docker",
    "kubernetes",
    "git",
    "rest",
    "graphql",
    "html",
    "css",
    "tailwind",
  ];

  const softSkillKeywords = [
    "communication",
    "teamwork",
    "leadership",
    "ownership",
    "problem solving",
    "problem-solving",
    "collaboration",
    "stakeholder",
    "mentoring",
    "time management",
    "adaptability",
  ];

  const domainKeywords = [
    "fintech",
    "ecommerce",
    "healthcare",
    "edtech",
    "saas",
    "banking",
    "payments",
    "analytics",
    "security",
  ];

  const foundHard = hardSkillKeywords.filter((k) => text.includes(k));
  const foundSoft = softSkillKeywords.filter((k) => text.includes(k));
  const foundDomains = domainKeywords.filter((k) => text.includes(k));

  const normalizedHard = foundHard
    .map((s) =>
      s
        .replace("nextjs", "Next.js")
        .replace("next.js", "Next.js")
        .replace("node.js", "Node.js")
        .replace("javascript", "JavaScript")
        .replace("typescript", "TypeScript")
        .replace("react", "React")
        .replace("tailwind", "Tailwind")
        .replace("mongodb", "MongoDB")
        .replace("postgres", "Postgres")
        .replace("mysql", "MySQL")
        .replace("aws", "AWS")
        .replace("gcp", "GCP")
        .replace("azure", "Azure")
        .replace("docker", "Docker")
        .replace("kubernetes", "Kubernetes")
        .replace("graphql", "GraphQL")
        .replace("rest", "REST"),
    )
    .map((s) => (s.length <= 1 ? s.toUpperCase() : s));

  const normalizedSoft = foundSoft.map((s) =>
    s
      .replace("problem-solving", "problem solving")
      .replace(/\b\w/g, (m) => m.toUpperCase()),
  );

  const normalizedDomains = foundDomains.map((s) => s.toUpperCase());

  const suggested_role = inferRole(resumeText);
  const suggested_experience = bucketExperience(resumeText);
  const projects = extractProjects(resumeText);
  const work_experience = extractExperience(resumeText);
  const education = extractEducation(resumeText);
  const achievements = extractAchievements(resumeText);

  return {
    summary:
      resumeText.trim().slice(0, 240) + (resumeText.trim().length > 240 ? "…" : ""),
    suggested_role,
    suggested_experience,
    hard_skills: uniq(normalizedHard).slice(0, 15),
    soft_skills: uniq(normalizedSoft).slice(0, 10),
    domains: uniq(normalizedDomains).slice(0, 10),
    tools: [],
    projects,
    highlights: [],
    work_experience,
    education,
    achievements,
  };
}

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "resume:profile",
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as
    | {
        resumeText?: string;
        role?: string;
        experience?: string;
      }
    | null;

  const resumeText = clampString(body?.resumeText?.trim() || "", 15000);
  const role = clampString(body?.role?.trim() || "", 120);
  const experience = clampString(body?.experience?.trim() || "", 40);

  if (!resumeText) {
    return Response.json(
      { ok: false, error: "Missing resumeText." },
      { status: 400 },
    );
  }

  const system = [
    "You extract structured candidate information from raw resume text.",
    "Return ONLY valid JSON. No extra text.",
    "If something is unknown, use empty arrays/strings.",
  ].join("\n");

  const user = [
    "Extract a compact candidate profile for interview question selection.",
    "Return JSON exactly with this shape:",
    "{",
    '  "summary": string,',
    '  "suggested_role": string,',
    '  "suggested_experience": string,',
    '  "hard_skills": string[],',
    '  "soft_skills": string[],',
    '  "domains": string[],',
    '  "tools": string[],',
    '  "projects": {"name"?: string, "technologies"?: string[], "description"?: string}[],',
    '  "highlights": string[],',
    '  "work_experience": {"company"?: string, "title"?: string, "dates"?: string, "highlights"?: string[]}[],',
    '  "education": {"institution"?: string, "degree"?: string, "dates"?: string, "highlights"?: string[]}[],',
    '  "achievements": string[]',
    "}",
    role ? `Provided Role (optional): ${role}` : "",
    experience ? `Provided Experience (optional): ${experience}` : "",
    "If role/experience are not provided, infer them from the resume.",
    "For suggested_experience, return one of: 0-2 years | 2-5 years | 5-8 years | 8+ years",
    "Try to populate work_experience, education, and achievements if present.",
    "Resume Text:",
    resumeText.slice(0, 8000),
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await llmText({
    system,
    user,
    models: {
      huggingface: process.env.HUGGINGFACE_MODEL_RESUME || process.env.HUGGINGFACE_MODEL,
      openai: process.env.OPENAI_MODEL,
    },
  });
  if (raw) {
    const parsed = safeJsonParse<ResumeProfile>(raw.text);
    if (parsed && typeof parsed.summary === "string") {
      return Response.json({ ok: true, profile: parsed, source: raw.provider });
    }
  }

  const profile = fallbackExtractProfile(resumeText);
  return Response.json({ ok: true, profile, source: "fallback" });
}
