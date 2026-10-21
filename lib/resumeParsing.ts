/**
 * Two-stage resume parsing.
 *
 * Stage A (deterministic): normalise the extracted text, detect sections
 * (including heading variants such as "Personal Projects"), and parse every
 * section with rules. This always runs and never invents data.
 *
 * Stage B (AI, optional): ask the configured provider for the same schema,
 * validate it strictly, drop anything not grounded in the resume text, and
 * reconcile it with Stage A so detected projects are never silently lost.
 */

export const PARSER_VERSION = "2.0";

export type ResumeProject = {
  name: string;
  description: string;
  technologies: string[];
  responsibilities: string[];
  achievements: string[];
  links: string[];
  startDate?: string;
  endDate?: string;
};

export type ResumeExperience = {
  company?: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  responsibilities: string[];
  achievements: string[];
  technologies: string[];
};

export type ResumeEducation = {
  institution?: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  grade?: string;
};

export type ParsedResume = {
  name?: string;
  email?: string;
  phone?: string;
  links: string[];
  summary?: string;
  skills: string[];
  education: ResumeEducation[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  certifications: string[];
  achievements: string[];
  sourceMetadata: { parserVersion: string; parsedAt: string; source: "ai" | "ai+rules" | "rules" };
};

export type SectionKey = "summary" | "skills" | "experience" | "projects" | "education" | "certifications" | "achievements";
export const SECTION_KEYS: SectionKey[] = ["summary", "skills", "experience", "projects", "education", "certifications", "achievements"];

const HEADINGS: Record<SectionKey, string[]> = {
  summary: ["summary", "professional summary", "profile", "professional profile", "about me", "about", "objective", "career objective", "overview"],
  skills: ["skills", "technical skills", "key skills", "core skills", "core competencies", "competencies", "technologies", "tech stack", "tools and technologies", "tools & technologies", "skills and tools", "programming skills"],
  experience: ["experience", "work experience", "professional experience", "employment", "employment history", "work history", "internships", "internship", "internship experience", "relevant experience"],
  projects: ["projects", "personal projects", "academic projects", "key projects", "selected projects", "notable projects", "side projects", "project experience", "major projects", "technical projects", "project work", "projects and research", "open source projects", "open source"],
  education: ["education", "academic background", "academics", "educational qualifications", "qualifications", "education and training"],
  certifications: ["certifications", "certificates", "licenses and certifications", "licenses & certifications", "courses", "courses and certifications", "training"],
  achievements: ["achievements", "awards", "honors", "honours", "awards and achievements", "accomplishments", "extracurricular", "extracurricular activities", "activities", "leadership", "positions of responsibility"],
};

const HEADING_LOOKUP = new Map<string, SectionKey>(
  (Object.entries(HEADINGS) as Array<[SectionKey, string[]]>).flatMap(([key, list]) => list.map((h) => [h, key] as [string, SectionKey])),
);

// Ordered longest-first so "personal projects" wins over "projects" when reflowing.
const ALL_HEADINGS = [...HEADING_LOOKUP.keys()].sort((a, b) => b.length - a.length);

/** Technologies recognised inside free text (matched case-insensitively on word boundaries). */
const KNOWN_TECH = [
  "JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "C", "Go", "Golang", "Rust", "Kotlin", "Swift", "Ruby", "PHP", "Scala", "Dart", "R", "SQL", "Bash",
  "React", "React Native", "Next.js", "Vue", "Nuxt", "Angular", "Svelte", "Redux", "Tailwind", "Tailwind CSS", "HTML", "CSS", "Sass", "Bootstrap", "jQuery",
  "Node.js", "Express", "NestJS", "Django", "Flask", "FastAPI", "Spring", "Spring Boot", "Rails", "Laravel", ".NET", "ASP.NET", "GraphQL", "REST", "gRPC", "WebSockets", "Socket.IO",
  "MongoDB", "Mongoose", "PostgreSQL", "Postgres", "MySQL", "SQLite", "Redis", "DynamoDB", "Firebase", "Firestore", "Supabase", "Prisma", "Elasticsearch", "Cassandra",
  "AWS", "GCP", "Azure", "Vercel", "Netlify", "Heroku", "Docker", "Kubernetes", "Terraform", "Jenkins", "GitHub Actions", "CI/CD", "Linux", "Nginx", "Git",
  "TensorFlow", "PyTorch", "scikit-learn", "Pandas", "NumPy", "OpenCV", "Keras", "Hugging Face", "OpenAI", "LangChain", "MediaPipe", "LLM", "NLP",
  "Jest", "Vitest", "Cypress", "Playwright", "Selenium", "Figma", "Kafka", "RabbitMQ", "Stripe", "JWT", "OAuth", "Three.js", "D3.js", "Electron", "Flutter", "Android", "iOS",
];

const BULLET_RE = /^\s*(?:[•●▪▫◦‣∙·○■□➤➢►▶✓✔\-–—*]|\d+[.)])\s+/;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s,;)<>]+|\b(?:github\.com|gitlab\.com|bitbucket\.org|linkedin\.com|[a-z0-9-]+\.(?:vercel\.app|netlify\.app|herokuapp\.com|github\.io|onrender\.com|pages\.dev))\/?[^\s,;)<>]*/gi;
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_TOKEN = `(?:${MONTH}\\s*'?\\d{2,4}|\\d{1,2}/\\d{2,4}|\\d{4})`;
const DATE_RANGE_RE = new RegExp(`(${DATE_TOKEN})\\s*(?:-|–|—|to)\\s*(${DATE_TOKEN}|present|current|now|ongoing)`, "i");
const SINGLE_DATE_RE = new RegExp(`\\b(${DATE_TOKEN})\\b`, "i");
const METRIC_RE = /\d+(?:\.\d+)?\s*(?:%|x\b|k\b|\+|ms\b|users|customers|requests)|\b(?:increased|reduced|improved|decreased|grew|cut|saved|boosted)\b/i;

function uniq(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.replace(/\s+/g, " ").trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function headingKey(line: string): SectionKey | null {
  const cleaned = line
    .replace(BULLET_RE, "")
    .replace(/[:：\-–—_|]+\s*$/, "")
    .replace(/[^\p{L}\p{N}&+ ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!cleaned || cleaned.length > 40) return null;
  return HEADING_LOOKUP.get(cleaned) ?? null;
}

/**
 * Some PDF extractors join a whole page into one line. Re-insert line breaks
 * before bullets and before heading words written as headings (Title or UPPER
 * case), so section detection still works.
 */
function reflow(text: string) {
  const lines = text.split("\n");
  const avg = lines.reduce((s, l) => s + l.length, 0) / Math.max(1, lines.length);
  // Real line structure present: leave it alone.
  if (lines.length > 3 && avg < 160) return text;
  if (text.length < 80) return text;
  let out = text.replace(/\s+([•●▪◦‣■➤►✓✔])\s+/g, "\n$1 ");
  for (const h of ALL_HEADINGS) {
    const title = h.replace(/\b\w/g, (c) => c.toUpperCase());
    for (const form of [h.toUpperCase(), title]) {
      out = out.replace(new RegExp(`(^|[^\\n])\\s+(${escapeRe(form)})(:?)\\s+`, "g"), (_m, pre, word, colon) => `${pre}\n${word}${colon}\n`);
    }
  }
  return out;
}

/** Stage A, step 1: clean extraction artefacts without changing wording. */
export function normalizeResumeText(raw: string) {
  let text = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\f/g, "\n");
  // Rejoin words hyphenated across line breaks ("develop-\nment").
  text = text.replace(/([a-z])-\n([a-z])/g, "$1$2");
  text = reflow(text);
  const lines = text.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim());
  const first = lines.find(Boolean) ?? "";
  const kept = lines.filter((l, i) => {
    if (/^(page\s*)?\d+\s*(of|\/)\s*\d+$/i.test(l) || /^-+\s*\d+(\s*of\s*\d+)?\s*-+$/i.test(l)) return false; // page markers
    // Repeated page header (usually the candidate's name) after a page break.
    return !(i > 0 && first && l === first && first.length < 60);
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type DetectedSections = { header: string[]; sections: Partial<Record<SectionKey, string[]>>; headings: Array<{ key: SectionKey; heading: string }> };

/** Stage A, step 2: split the text into known sections, preserving source lines. */
export function detectSections(text: string): DetectedSections {
  const header: string[] = [];
  const sections: Partial<Record<SectionKey, string[]>> = {};
  const headings: DetectedSections["headings"] = [];
  let current: SectionKey | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    // A heading may carry content on the same line ("Skills: React, Node").
    const inline = line.match(/^([^:]{2,40}):\s+(.+)$/);
    const key = headingKey(line) ?? (inline ? headingKey(inline[1]) : null);
    if (key) {
      current = key;
      headings.push({ key, heading: (inline && !headingKey(line) ? inline[1] : line).trim() });
      sections[key] ??= [];
      if (inline && !headingKey(line)) sections[key]!.push(inline[2].trim());
      continue;
    }
    if (current) sections[current]!.push(line);
    else header.push(line);
  }
  return { header, sections, headings };
}

export function extractLinks(text: string) {
  return uniq((text.match(URL_RE) ?? []).map((u) => u.replace(/[.)]+$/, "")));
}

export function extractTechnologies(text: string) {
  const found: string[] = [];
  for (const tech of KNOWN_TECH) {
    // Single-letter languages ("C", "R") only count in explicit lists, not prose.
    if (tech.length === 1) continue;
    const re = new RegExp(`(^|[^A-Za-z0-9+#.])${escapeRe(tech)}(?![A-Za-z0-9+#])`, "i");
    if (re.test(text)) found.push(tech);
  }
  // Prefer the more specific name when both match ("React Native" over "React").
  return uniq(found).filter((t, _i, all) => !all.some((o) => o !== t && o.toLowerCase().startsWith(`${t.toLowerCase()} `)));
}

function splitList(text: string) {
  return text
    .split(/[,|;•·]|\s+\/\s+|\s{2,}/)
    .map((s) => s.replace(/^(and|&)\s+/i, "").replace(/[.]$/, "").trim())
    .filter((s) => s && s.length <= 40);
}

function stripBullet(line: string) {
  return line.replace(BULLET_RE, "").trim();
}

function isBullet(line: string) {
  return BULLET_RE.test(line);
}

function dateRange(line: string): { startDate?: string; endDate?: string } {
  const r = line.match(DATE_RANGE_RE);
  if (r) return { startDate: r[1].trim(), endDate: r[2].trim() };
  const single = line.match(SINGLE_DATE_RE);
  return single ? { endDate: single[1].trim() } : {};
}

function removeDates(line: string) {
  return line
    .replace(DATE_RANGE_RE, "")
    .replace(/\(\s*\)/g, "")
    .replace(/(\s*[|–—,-]\s*){2,}/g, " - ")
    .replace(/^\s*[|–—,-]\s*|\s*[|–—,-]\s*$/g, "")
    .trim();
}

/** Visible text of hyperlinks whose URL is not in the extracted text ("Live Demo", "GitHub Repo"). */
const LINK_LABEL_RE = /\s*(?:\b(?:live\s+demo|demo|live|github(?:\s+repo(?:sitory)?)?|repo(?:sitory)?|source(?:\s+code)?|website|code|link|deployed|preview|video)\b\s*[|,·]?\s*)+$/i;

function stripTrailingDate(line: string) {
  if (DATE_RANGE_RE.test(line)) return { text: line, date: undefined as string | undefined };
  const m = line.match(new RegExp(`\\s*[|,(–—-]?\\s*(${DATE_TOKEN})\\)?\\s*$`, "i"));
  return m ? { text: line.slice(0, m.index).trim(), date: m[1].trim() } : { text: line, date: undefined };
}

const TECH_LABEL_RE = /^(?:tech(?:nolog(?:y|ies))?(?:\s+stack)?|stack|tools|built\s+with|tech\s+used|technologies\s+used)\s*[:\-–]\s*(.+)$/i;

function looksLikeTitle(line: string) {
  if (isBullet(line)) return false;
  const text = removeDates(line.replace(URL_RE, "")).replace(/[|–—-]\s*$/, "").trim();
  if (!text || text.length > 110) return false;
  if (/[.!?]$/.test(text) && text.split(/\s+/).length > 6) return false; // a sentence, not a title
  return /[A-Za-z]/.test(text);
}

/** Splits "Name | React, Node | Jan 2024 – Mar 2024 | github.com/x" into parts. */
function parseTitleLine(input: string) {
  const links = extractLinks(input);
  const labelFree = input.replace(URL_RE, " ").replace(LINK_LABEL_RE, "").trim();
  const trailing = stripTrailingDate(labelFree);
  const line = trailing.text;
  const dates = trailing.date ? { endDate: trailing.date } : dateRange(line);
  const withoutLinks = line;
  const parts = removeDates(withoutLinks)
    .split(/\s+[|–—]\s+|\s+-\s+|\s*\|\s*/)
    .map((p) => p.replace(/^[([]|[)\]]$/g, "").trim())
    .filter(Boolean);
  const name = (parts.shift() ?? "").replace(/[:\-–]\s*$/, "").trim();
  const technologies: string[] = [];
  const rest: string[] = [];
  for (const p of parts) {
    const label = p.match(TECH_LABEL_RE);
    if (label) technologies.push(...splitList(label[1]));
    else if (/,/.test(p) || extractTechnologies(p).length) technologies.push(...splitList(p));
    else rest.push(p);
  }
  return { name, technologies, links, ...dates, rest };
}

/** Rule-based project parser. Every field comes from the section text. */
export function parseProjects(lines: string[]): ResumeProject[] {
  const projects: ResumeProject[] = [];
  let current: ResumeProject | null = null;

  const start = (line: string) => {
    const t = parseTitleLine(line);
    current = {
      name: t.name,
      description: t.rest.join(" — "),
      technologies: uniq(t.technologies),
      responsibilities: [],
      achievements: [],
      links: t.links,
      ...(t.startDate ? { startDate: t.startDate } : {}),
      ...(t.endDate ? { endDate: t.endDate } : {}),
    };
    projects.push(current);
  };

  let lastBullet: { list: string[]; index: number } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const proj = current as ResumeProject | null;
    const lineLinks = extractLinks(line);
    const linkOnly = lineLinks.length > 0 && line.replace(URL_RE, "").replace(/^(?:github|demo|live|link|repo|source|url)\s*[:\-–]?/i, "").replace(/[\s|,:-]/g, "") === "";
    if (linkOnly && proj) {
      proj.links = uniq([...proj.links, ...lineLinks]);
      continue;
    }
    // Wrapped bullet text continues on the next line (usually lower-case, or the bullet had no full stop).
    if (lastBullet && !isBullet(line)) {
      const prev = lastBullet.list[lastBullet.index] ?? "";
      if (/^[a-z(]/.test(line) || (!/[.!?:]$/.test(prev) && /[.!?]$/.test(line) && line.split(/\s+/).length <= 12)) {
        lastBullet.list[lastBullet.index] = `${prev} ${line}`.trim();
        continue;
      }
    }
    // A line that is only link labels ("GitHub Repo") belongs to the current project.
    if (proj && line.replace(LINK_LABEL_RE, "").trim() === "") continue;
    const label = stripBullet(line).match(TECH_LABEL_RE);
    if (label && proj) {
      proj.technologies = uniq([...proj.technologies, ...splitList(label[1])]);
      continue;
    }
    if (isBullet(line)) {
      if (!proj) {
        start(stripBullet(line));
        continue;
      }
      const text = stripBullet(line);
      const list = METRIC_RE.test(text) ? proj.achievements : proj.responsibilities;
      list.push(text);
      lastBullet = { list, index: list.length - 1 };
      proj.links = uniq([...proj.links, ...lineLinks]);
      continue;
    }
    lastBullet = null;
    // A comma-separated technology line right under a title is that project's stack.
    if (proj && !proj.description && proj.responsibilities.length + proj.achievements.length === 0) {
      const techLine = line.replace(URL_RE, " ").replace(LINK_LABEL_RE, "").trim();
      if (techLine.includes(",") && extractTechnologies(techLine).length > 0) {
        proj.technologies = uniq([...proj.technologies, ...splitList(techLine)]);
        proj.links = uniq([...proj.links, ...lineLinks]);
        continue;
      }
    }
    // A non-bullet line starts a new project when it looks like a title and the
    // current project already has body content (or there is no current project).
    const hasBody = proj ? proj.responsibilities.length + proj.achievements.length > 0 || Boolean(proj.description) : false;
    if (!proj || (looksLikeTitle(line) && (hasBody || parseTitleLine(line).technologies.length > 0 || DATE_RANGE_RE.test(line)))) {
      start(line);
      continue;
    }
    // Otherwise it is descriptive prose for the current project.
    proj.description = proj.description ? `${proj.description} ${line}` : line;
    proj.links = uniq([...proj.links, ...lineLinks]);
  }

  return projects
    .filter((p) => p.name)
    .map((p) => {
      const body = [p.description, ...p.responsibilities, ...p.achievements].join(" ");
      return { ...p, technologies: uniq([...p.technologies, ...extractTechnologies(body)]) };
    });
}

export function parseSkills(input: string[]) {
  // Re-join wrapped list lines ("..., DBMS, Operating" / "Systems, Computer Networks").
  const lines: string[] = [];
  for (const raw of input) {
    const line = raw.trim();
    const prev = lines[lines.length - 1];
    if (prev !== undefined && !isBullet(line) && !/^[^:]{2,40}:\s/.test(line) && !/[.;]$/.test(prev)) {
      lines[lines.length - 1] = `${prev} ${line}`;
    } else {
      lines.push(line);
    }
  }
  const out: string[] = [];
  for (const raw of lines) {
    const line = stripBullet(raw);
    const labelled = line.match(/^[^:]{2,40}:\s*(.+)$/);
    out.push(...splitList(labelled ? labelled[1] : line));
  }
  return uniq(out).slice(0, 80);
}

export function parseExperience(lines: string[]): ResumeExperience[] {
  const entries: ResumeExperience[] = [];
  let current: ResumeExperience | null = null;
  let lastBullet: { list: string[]; index: number } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isBullet(line) && current) {
      const text = stripBullet(line);
      const list = METRIC_RE.test(text) ? current.achievements : current.responsibilities;
      list.push(text);
      lastBullet = { list, index: list.length - 1 };
      continue;
    }
    if (lastBullet && /^[a-z(]/.test(line)) {
      lastBullet.list[lastBullet.index] = `${lastBullet.list[lastBullet.index]} ${line}`;
      continue;
    }
    lastBullet = null;
    const isHeader = !isBullet(line) && looksLikeTitle(line) && (DATE_RANGE_RE.test(line) || /\s[|–—-]\s|\bat\b|,/.test(line));
    if (isHeader || !current) {
      const dates = dateRange(line);
      const parts = removeDates(line)
        .split(/\s+[|–—]\s+|\s+-\s+|\s+at\s+|,\s+/i)
        .map((p) => p.trim())
        .filter(Boolean);
      const ROLE_RE = /\b(intern|engineer|developer|manager|analyst|designer|lead|consultant|architect|scientist|specialist|associate|officer|director|administrator|programmer|tester|trainee)\b/i;
      const [a, b] = [parts[0] ? stripBullet(parts[0]) : undefined, parts[1]];
      const roleFirst = a && ROLE_RE.test(a) && !(b && ROLE_RE.test(b));
      current = {
        company: roleFirst ? b : a,
        role: roleFirst ? a : b,
        ...dates,
        responsibilities: [],
        achievements: [],
        technologies: [],
      };
      entries.push(current);
      continue;
    }
    // A role on its own line under the company.
    if (!current.role && current.responsibilities.length === 0 && line.length < 80) current.role = removeDates(line);
    else current.responsibilities.push(line);
  }
  return entries.map((e) => ({ ...e, technologies: extractTechnologies([...e.responsibilities, ...e.achievements].join(" ")) }));
}

export function parseEducation(lines: string[]): ResumeEducation[] {
  const DEGREE_RE = /\b(b\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|bachelor|master|m\.?\s?tech|m\.?\s?sc|m\.?s\b|mba|mca|bca|ph\.?d|diploma|associate|high school|secondary|hsc|ssc|class\s+x)/i;
  const INSTITUTION_RE = /\b(university|college|institute|school|academy|iit|nit|iiit)\b/i;
  const GRADE_RE = /\b(?:c?gpa|grade|percentage|score)\s*[:\-]?\s*([\d.]+\s*(?:\/\s*[\d.]+)?%?)|(\d{1,2}(?:\.\d+)?\s*%)|(\d(?:\.\d+)?\s*\/\s*10)/i;
  const entries: ResumeEducation[] = [];
  let current: ResumeEducation | null = null;
  for (const raw of lines) {
    const line = stripBullet(raw);
    if (!line) continue;
    const grade = line.match(GRADE_RE);
    const noGrade = line.replace(GRADE_RE, " ").trim();
    const trailing = stripTrailingDate(noGrade);
    const dates = trailing.date ? { endDate: trailing.date } : dateRange(noGrade);
    const text = removeDates(trailing.text).replace(/[|,–—-]\s*$/, "").trim();
    const isInstitution = INSTITUTION_RE.test(text);
    const isDegree = DEGREE_RE.test(text);
    if (!current || (isInstitution && current.institution) || (isDegree && current.degree && !isInstitution)) {
      current = {};
      entries.push(current);
    }
    const parts = text.split(/\s+[|–—]\s+|\s+-\s+|,\s+/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (INSTITUTION_RE.test(part) && !current.institution) current.institution = part;
      else if (DEGREE_RE.test(part) && !current.degree) {
        const field = part.match(/\b(?:in|of)\s+(.+)$/i);
        current.degree = part;
        if (field) current.fieldOfStudy = field[1].trim();
      } else if (current.degree && !current.institution && !current.fieldOfStudy && !/\d/.test(part)) {
        // "B.Tech – Computer Science & Engineering, University"
        current.fieldOfStudy = part;
      }
    }
    if (!current.institution && !current.degree && parts[0]) current.institution = parts[0];
    Object.assign(current, dates);
    if (grade) current.grade = (grade[1] || grade[2] || grade[3]).trim();
  }
  return entries.filter((e) => e.institution || e.degree);
}

function parseList(lines: string[]) {
  return uniq(lines.map(stripBullet).filter((l) => l.length > 1)).slice(0, 30);
}

function headerDetails(header: string[], fullText: string) {
  const email = fullText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  const phone = fullText.match(/(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{3,5}[\s-]?\d{3,4}[\s-]?\d{3,4}/)?.[0]?.trim();
  const nameLine = header.find((l) => /^[A-Za-z][A-Za-z .'-]{1,50}$/.test(l) && l.split(/\s+/).length <= 5 && !headingKey(l));
  return { name: nameLine, email, phone };
}

export type ParseOutcome = {
  parsed: ParsedResume;
  warnings: string[];
  detectedSections: SectionKey[];
  missingSections: SectionKey[];
  diagnostics: { aiAttempted: boolean; aiOk: boolean; aiAttempts: number; projectRepair: boolean; droppedUngrounded: number };
};

/** Stage A only: a complete, rule-based parse of the normalised text. */
export function parseResumeDeterministic(rawText: string, now = new Date()): ParsedResume {
  const text = normalizeResumeText(rawText);
  const { header, sections } = detectSections(text);
  const contact = headerDetails(header, text);
  return {
    ...contact,
    links: extractLinks(text),
    summary: sections.summary?.map(stripBullet).join(" ") || undefined,
    skills: parseSkills(sections.skills ?? []),
    education: parseEducation(sections.education ?? []),
    experience: parseExperience(sections.experience ?? []),
    projects: parseProjects(sections.projects ?? []),
    certifications: parseList(sections.certifications ?? []),
    achievements: parseList(sections.achievements ?? []),
    sourceMetadata: { parserVersion: PARSER_VERSION, parsedAt: now.toISOString(), source: "rules" },
  };
}

// ---------------------------------------------------------------------------
// Stage B: AI extraction, validation and reconciliation
// ---------------------------------------------------------------------------

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const optStr = (v: unknown, max = 120) => str(v, max) || undefined;
const strList = (v: unknown, max = 40, each = 300) => (Array.isArray(v) ? uniq(v.map((x) => str(x, each))).slice(0, max) : []);

/**
 * Strict validation of model output. Unknown fields are ignored and wrong
 * types are coerced to "missing" rather than throwing. Returns null when the
 * value is not an object at all.
 */
export function coerceParsedResume(raw: unknown): Omit<ParsedResume, "sourceMetadata"> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : []);
  return {
    name: optStr(r.name, 80),
    email: optStr(r.email, 120),
    phone: optStr(r.phone, 40),
    links: strList(r.links, 15, 200),
    summary: optStr(r.summary, 1200),
    skills: strList(r.skills, 80, 60),
    education: arr(r.education).slice(0, 8).map((e) => ({
      institution: optStr(e.institution),
      degree: optStr(e.degree),
      fieldOfStudy: optStr(e.fieldOfStudy),
      startDate: optStr(e.startDate, 30),
      endDate: optStr(e.endDate, 30),
      grade: optStr(e.grade, 30),
    })),
    experience: arr(r.experience).slice(0, 12).map((e) => ({
      company: optStr(e.company),
      role: optStr(e.role),
      startDate: optStr(e.startDate, 30),
      endDate: optStr(e.endDate, 30),
      responsibilities: strList(e.responsibilities, 12),
      achievements: strList(e.achievements, 12),
      technologies: strList(e.technologies, 30, 60),
    })),
    projects: arr(r.projects).slice(0, 15).map((p) => ({
      name: str(p.name, 140),
      description: str(p.description, 1200),
      technologies: strList(p.technologies, 30, 60),
      responsibilities: strList(p.responsibilities, 12),
      achievements: strList(p.achievements, 12),
      links: strList(p.links, 6, 200),
      startDate: optStr(p.startDate, 30),
      endDate: optStr(p.endDate, 30),
    })).filter((p) => p.name),
    certifications: strList(r.certifications, 30),
    achievements: strList(r.achievements, 30),
  };
}

function normKey(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** True when most words of `phrase` appear in the source text (guards against invented items). */
export function isGrounded(phrase: string, sourceText: string) {
  const words = normKey(phrase).split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return normKey(sourceText).includes(normKey(phrase));
  const source = ` ${normKey(sourceText)} `;
  const hits = words.filter((w) => source.includes(` ${w}`)).length;
  return hits / words.length >= 0.6;
}

function sameProject(a: string, b: string) {
  const x = normKey(a);
  const y = normKey(b);
  return x === y || (x.length > 3 && (x.includes(y) || y.includes(x)));
}

/**
 * Combines the AI result with the rule-based one: AI values win when they are
 * grounded in the text; rule-based projects the AI missed are added back so a
 * detected Projects section is never silently dropped.
 */
export function reconcile(ai: Omit<ParsedResume, "sourceMetadata">, rules: ParsedResume, sourceText: string) {
  let dropped = 0;
  const grounded = <T,>(items: T[], label: (t: T) => string) =>
    items.filter((it) => {
      const ok = isGrounded(label(it), sourceText);
      if (!ok) dropped += 1;
      return ok;
    });

  const aiProjects = grounded(ai.projects, (p) => p.name).map((p) => ({
    ...p,
    // Only keep technologies that are actually mentioned in the resume.
    technologies: p.technologies.filter((t) => new RegExp(escapeRe(t), "i").test(sourceText)),
  }));
  const projects = [...aiProjects];
  let restored = 0;
  for (const rp of rules.projects) {
    const match = projects.find((p) => sameProject(p.name, rp.name));
    if (!match) {
      projects.push(rp);
      restored += 1;
    } else {
      match.links = uniq([...match.links, ...rp.links]);
      match.technologies = uniq([...match.technologies, ...rp.technologies]);
      if (!match.description && rp.description) match.description = rp.description;
    }
  }

  const merged: Omit<ParsedResume, "sourceMetadata"> = {
    name: ai.name && isGrounded(ai.name, sourceText) ? ai.name : rules.name,
    email: rules.email ?? (ai.email && sourceText.includes(ai.email) ? ai.email : undefined),
    phone: rules.phone ?? ai.phone,
    links: uniq([...rules.links, ...ai.links.filter((l) => sourceText.includes(l.replace(/^https?:\/\//, "")))]),
    summary: ai.summary || rules.summary,
    skills: uniq([...ai.skills.filter((s) => new RegExp(escapeRe(s), "i").test(sourceText)), ...rules.skills]),
    education: ai.education.length ? grounded(ai.education, (e) => e.institution || e.degree || "") : rules.education,
    experience: ai.experience.length ? grounded(ai.experience, (e) => e.company || e.role || "") : rules.experience,
    projects,
    certifications: ai.certifications.length ? grounded(ai.certifications, (c) => c) : rules.certifications,
    achievements: ai.achievements.length ? grounded(ai.achievements, (a) => a) : rules.achievements,
  };
  if (merged.education.length === 0) merged.education = rules.education;
  if (merged.experience.length === 0) merged.experience = rules.experience;
  return { merged, dropped, restored };
}

export const RESUME_JSON_SHAPE = `{
  "name": string, "email": string, "phone": string, "links": string[], "summary": string,
  "skills": string[],
  "education": [{"institution": string, "degree": string, "fieldOfStudy": string, "startDate": string, "endDate": string, "grade": string}],
  "experience": [{"company": string, "role": string, "startDate": string, "endDate": string, "responsibilities": string[], "achievements": string[], "technologies": string[]}],
  "projects": [{"name": string, "description": string, "technologies": string[], "responsibilities": string[], "achievements": string[], "links": string[], "startDate": string, "endDate": string}],
  "certifications": string[], "achievements": string[]
}`;

export type LLMCall = (p: { system: string; user: string; maxTokens: number }) => Promise<string | null>;

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s === -1 || e <= s) return null;
    try {
      return JSON.parse(text.slice(s, e + 1));
    } catch {
      return null;
    }
  }
}

const SYSTEM = [
  "You convert resume text into JSON. Return ONLY valid JSON matching the schema.",
  "Copy facts exactly from the resume. Never invent projects, technologies, dates, metrics or employers.",
  "Omit a field (or use an empty array) when the resume does not state it.",
  "Include EVERY project listed in the resume, even if it only has a name.",
].join("\n");

/**
 * Full two-stage parse. `callLLM` returns raw model text, or null when no
 * provider is available or the call failed. Bounded to one extraction call and
 * at most one targeted projects repair call.
 */
export async function parseResume(rawText: string, callLLM: LLMCall | null, now = new Date(), failureDetail?: () => string | null): Promise<ParseOutcome> {
  const text = normalizeResumeText(rawText);
  const { sections } = detectSections(text);
  const rules = parseResumeDeterministic(text, now);
  const detected = SECTION_KEYS.filter((k) => (sections[k]?.length ?? 0) > 0);
  const warnings: string[] = [];
  const diagnostics: ParseOutcome["diagnostics"] = { aiAttempted: false, aiOk: false, aiAttempts: 0, projectRepair: false, droppedUngrounded: 0 };

  let result: ParsedResume = rules;

  if (callLLM) {
    diagnostics.aiAttempted = true;
    diagnostics.aiAttempts += 1;
    // Keep the projects section in the prompt even for long resumes.
    const projectText = (sections.projects ?? []).join("\n");
    const body = text.length > 14000 ? `${text.slice(0, 11000)}\n...\nPROJECTS SECTION:\n${projectText.slice(0, 3000)}` : text;
    const rawOut = await callLLM({ system: SYSTEM, user: `Schema:\n${RESUME_JSON_SHAPE}\n\nResume text:\n${body}`, maxTokens: 2500 }).catch(() => null);
    let ai = rawOut ? coerceParsedResume(safeParse(rawOut)) : null;

    // Targeted repair when the model dropped projects the rules can see.
    if (ai && rules.projects.length > ai.projects.length && projectText) {
      diagnostics.projectRepair = true;
      diagnostics.aiAttempts += 1;
      const repair = await callLLM({
        system: SYSTEM,
        user: `Extract ONLY the projects from this resume section as {"projects": [...]} using this item shape: {"name": string, "description": string, "technologies": string[], "responsibilities": string[], "achievements": string[], "links": string[], "startDate": string, "endDate": string}.\n\nSection:\n${projectText.slice(0, 6000)}`,
        maxTokens: 1800,
      }).catch(() => null);
      const repaired = repair ? coerceParsedResume(safeParse(repair)) : null;
      if (repaired && repaired.projects.length > ai.projects.length) ai = { ...ai, projects: repaired.projects };
    }

    if (ai) {
      diagnostics.aiOk = true;
      const { merged, dropped, restored } = reconcile(ai, rules, text);
      diagnostics.droppedUngrounded = dropped;
      if (restored > 0) warnings.push(`${restored} project${restored === 1 ? " was" : "s were"} recovered by the rule-based parser because the AI result missed ${restored === 1 ? "it" : "them"}.`);
      if (dropped > 0) warnings.push(`${dropped} AI-extracted item${dropped === 1 ? " was" : "s were"} discarded because ${dropped === 1 ? "it was" : "they were"} not found in your resume text.`);
      result = { ...merged, sourceMetadata: { parserVersion: PARSER_VERSION, parsedAt: now.toISOString(), source: restored > 0 ? "ai+rules" : "ai" } };
    } else {
      const why = failureDetail?.();
      warnings.push(
        why
          ? `AI extraction is unavailable (${why}), so the rule-based parse is shown. You can reprocess once it is fixed.`
          : "AI extraction was unavailable or returned an invalid result, so the rule-based parse is shown. You can reprocess later.",
      );
    }
  } else {
    warnings.push("AI extraction is not configured, so a basic rule-based parse is shown. Some details may be missing.");
  }

  if ((sections.projects?.length ?? 0) > 0 && result.projects.length === 0) {
    warnings.push("A projects section was found but no individual projects could be identified. Check its formatting (one project title per line, followed by bullet points).");
  }

  const present = (k: SectionKey) =>
    k === "summary" ? Boolean(result.summary) : Array.isArray(result[k]) && (result[k] as unknown[]).length > 0;
  const missingSections = SECTION_KEYS.filter((k) => !present(k));

  return { parsed: result, warnings, detectedSections: detected, missingSections, diagnostics };
}

/** Compact text for interview prompts. Projects come first so they survive truncation. */
export function resumeContextForPrompt(p: ParsedResume, maxChars = 3500) {
  const parts: string[] = [];
  if (p.projects.length) {
    parts.push(
      "PROJECTS:\n" +
        p.projects
          .map((pr, i) =>
            [`[P${i + 1}] ${pr.name}`, pr.technologies.length ? `stack: ${pr.technologies.join(", ")}` : "", pr.description, ...pr.responsibilities.slice(0, 3), ...pr.achievements.slice(0, 2)]
              .filter(Boolean)
              .join(" | "),
          )
          .join("\n"),
    );
  }
  if (p.skills.length) parts.push(`SKILLS: ${p.skills.slice(0, 30).join(", ")}`);
  if (p.experience.length) {
    parts.push("EXPERIENCE:\n" + p.experience.map((e) => [e.role, e.company, [e.startDate, e.endDate].filter(Boolean).join("–"), ...e.responsibilities.slice(0, 2)].filter(Boolean).join(" | ")).join("\n"));
  }
  if (p.education.length) parts.push("EDUCATION: " + p.education.map((e) => [e.degree, e.institution].filter(Boolean).join(", ")).join("; "));
  if (p.summary) parts.push(`SUMMARY: ${p.summary}`);
  const text = parts.join("\n\n");
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}
