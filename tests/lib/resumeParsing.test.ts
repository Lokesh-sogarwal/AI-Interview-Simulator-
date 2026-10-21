import { describe, expect, it, vi } from "vitest";

import { coerceParsedResume, detectSections, isGrounded, normalizeResumeText, parseResume, parseResumeDeterministic, resumeContextForPrompt } from "@/lib/resumeParsing";

// Synthetic resume (no real person).
const RESUME = `Alex Rivera
alex.rivera@example.com | +1 555 010 2030 | github.com/alexr
Summary
Backend-leaning engineer who enjoys reliable APIs.
Technical Skills
Languages: TypeScript, Python, Go
Frameworks: React, Next.js, Node.js, Express
Personal Projects
AI Interview Simulator | Next.js, MongoDB | Jan 2024 – Mar 2024
• Built a mock interview platform with AI-generated questions
• Implemented JWT auth and per-user ownership checks for every
interview record and API route.
• Reduced evaluation latency by 40%
github.com/alexr/interview-sim
Expense Tracker
React Native, Firebase
• Offline-first spending tracker with background sync
Live Demo GitHub Repo
Weather CLI
• Small Go tool that caches forecasts locally
Experience
Software Engineer – Acme Corp Jun 2022 – Present
• Built REST APIs in Node.js serving 2M requests/day
Education
B.Tech – Computer Science, State University 2018 – 2022 GPA: 8.6/10
Certifications
AWS Certified Cloud Practitioner`;

describe("section detection", () => {
  it.each(["Projects", "PROJECTS", "Personal Projects", "Academic Projects", "Key Projects", "Selected Projects", "Projects:", "Side Projects"])(
    "recognises the heading %s",
    (heading) => {
      const { sections } = detectSections(`Name\n${heading}\nThing One\n• did a thing\nEducation\nSchool`);
      expect(sections.projects?.[0]).toBe("Thing One");
    },
  );

  it("does not stop the projects section at a 'Technical Skills'-like heading it doesn't know", () => {
    const { sections } = detectSections("Projects\nApp\n• Built it\nTechnical Skills\nGo");
    expect(sections.projects).toEqual(["App", "• Built it"]);
    expect(sections.skills).toEqual(["Go"]);
  });
});

describe("deterministic project extraction", () => {
  const parsed = parseResumeDeterministic(RESUME);

  it("finds every project and keeps titles, stack, bullets, links and dates", () => {
    expect(parsed.projects.map((p) => p.name)).toEqual(["AI Interview Simulator", "Expense Tracker", "Weather CLI"]);
    const sim = parsed.projects[0];
    expect(sim).toMatchObject({ startDate: "Jan 2024", endDate: "Mar 2024", links: ["github.com/alexr/interview-sim"] });
    expect(sim.technologies).toEqual(expect.arrayContaining(["Next.js", "MongoDB", "JWT"]));
    // Wrapped bullet is joined back together rather than becoming a "project".
    expect(sim.responsibilities[1]).toBe("Implemented JWT auth and per-user ownership checks for every interview record and API route.");
    expect(sim.achievements).toEqual(["Reduced evaluation latency by 40%"]);
    expect(parsed.projects[1].technologies).toEqual(expect.arrayContaining(["React Native", "Firebase"]));
  });

  it("handles projects with no dates and doesn't invent descriptions", () => {
    const weather = parsed.projects[2];
    expect(weather.startDate).toBeUndefined();
    expect(weather.endDate).toBeUndefined();
    expect(weather.description).toBe("");
    expect(weather.technologies).toEqual(["Go"]);
  });

  it("parses the other sections", () => {
    expect(parsed).toMatchObject({ name: "Alex Rivera", email: "alex.rivera@example.com" });
    expect(parsed.skills).toEqual(expect.arrayContaining(["TypeScript", "Go", "Express"]));
    expect(parsed.experience[0]).toMatchObject({ role: "Software Engineer", company: "Acme Corp", startDate: "Jun 2022", endDate: "Present" });
    expect(parsed.education[0]).toMatchObject({ degree: "B.Tech", fieldOfStudy: "Computer Science", institution: "State University", startDate: "2018", endDate: "2022", grade: "8.6/10" });
    expect(parsed.certifications).toEqual(["AWS Certified Cloud Practitioner"]);
  });

  it("handles projects split across pages (page markers and repeated header)", () => {
    const split = RESUME.replace("Expense Tracker\n", "-- 1 of 2 --\nAlex Rivera\nPage 2 of 2\nExpense Tracker\n");
    expect(parseResumeDeterministic(split).projects.map((p) => p.name)).toEqual(["AI Interview Simulator", "Expense Tracker", "Weather CLI"]);
  });

  it("recovers sections from single-line extracted text", () => {
    const flat = normalizeResumeText("Sam Lee Skills React, Node PROJECTS Chat App • Realtime chat with WebSockets • Deployed on Vercel EDUCATION State College 2020 - 2024 ".repeat(1));
    const p = parseResumeDeterministic(flat);
    expect(p.projects.map((x) => x.name)).toEqual(["Chat App"]);
  });

  it("returns an empty list (not an error) for resumes without projects", () => {
    expect(parseResumeDeterministic("Pat Doe\nExperience\nEngineer – Co 2020 – 2021\n• Did things").projects).toEqual([]);
  });
});

describe("AI stage", () => {
  const aiResult = {
    name: "Alex Rivera",
    skills: ["TypeScript", "Kubernetes"],
    projects: [
      { name: "AI Interview Simulator", description: "Mock interviews", technologies: ["Next.js", "Rust"], responsibilities: [], achievements: [], links: [] },
      { name: "Quantum Blockchain Platform", description: "Invented", technologies: [], responsibilities: [], achievements: [], links: [] },
    ],
    experience: [{ company: "Acme Corp", role: "Software Engineer", responsibilities: [], achievements: [], technologies: [] }],
    education: [],
  };

  it("drops ungrounded items, restores projects the AI missed, and warns", async () => {
    const llm = vi.fn(async () => JSON.stringify(aiResult));
    const out = await parseResume(RESUME, llm);
    const names = out.parsed.projects.map((p) => p.name);
    expect(names).toContain("AI Interview Simulator");
    expect(names).toContain("Expense Tracker");
    expect(names).toContain("Weather CLI");
    expect(names).not.toContain("Quantum Blockchain Platform");
    // Technologies not mentioned anywhere in the resume are removed.
    expect(out.parsed.projects[0].technologies).not.toContain("Rust");
    expect(out.parsed.skills).not.toContain("Kubernetes");
    expect(out.parsed.sourceMetadata.source).toBe("ai+rules");
    expect(out.warnings.join(" ")).toMatch(/recovered/);
    expect(out.warnings.join(" ")).toMatch(/discarded/);
    // One extraction call plus one bounded projects repair call.
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it("asks a targeted repair when the projects field is missing", async () => {
    const llm = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ ...aiResult, projects: undefined }))
      .mockResolvedValueOnce(JSON.stringify({ projects: [{ name: "AI Interview Simulator" }, { name: "Expense Tracker" }, { name: "Weather CLI" }] }));
    const out = await parseResume(RESUME, llm);
    expect(llm.mock.calls[1][0].user).toContain("Extract ONLY the projects");
    expect(out.parsed.projects).toHaveLength(3);
    expect(out.diagnostics.projectRepair).toBe(true);
  });

  it("falls back to rules with a visible warning on malformed JSON or provider failure", async () => {
    for (const llm of [vi.fn(async () => '{"projects": [ {"name": "AI Inter'), vi.fn(async () => null)]) {
      const out = await parseResume(RESUME, llm, new Date(), () => "the AI provider account has run out of credits");
      expect(out.parsed.sourceMetadata.source).toBe("rules");
      expect(out.parsed.projects).toHaveLength(3);
      expect(out.warnings[0]).toMatch(/run out of credits/);
    }
  });

  it("validates the schema strictly", () => {
    expect(coerceParsedResume("text")).toBeNull();
    expect(coerceParsedResume([])).toBeNull();
    const c = coerceParsedResume({ projects: [{ name: 5 }, { name: "Ok", technologies: "React" }], skills: "React" });
    expect(c?.projects).toEqual([expect.objectContaining({ name: "Ok", technologies: [] })]);
    expect(c?.skills).toEqual([]);
  });

  it("checks grounding against the source text", () => {
    expect(isGrounded("AI Interview Simulator", RESUME)).toBe(true);
    expect(isGrounded("Quantum Blockchain Platform", RESUME)).toBe(false);
  });
});

describe("prompt context", () => {
  it("puts projects first so they survive truncation", () => {
    const ctx = resumeContextForPrompt(parseResumeDeterministic(RESUME), 200);
    expect(ctx.startsWith("PROJECTS:\n[P1] AI Interview Simulator")).toBe(true);
    expect(ctx.length).toBeLessThanOrEqual(200);
  });
});
