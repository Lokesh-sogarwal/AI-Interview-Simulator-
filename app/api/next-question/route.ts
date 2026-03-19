import {
  questionSystemPrompt,
  questionUserPrompt,
  resumeQuestionSystemPrompt,
  resumeQuestionUserPrompt,
  type Difficulty,
  type InterviewType,
} from "@/lib/prompts";
import { llmText } from "@/lib/llm";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";

function stageForQuestionNumber(questionNumber: number) {
  if (questionNumber <= 1) return "Introduction";
  if (questionNumber <= 3) return "Resume & Projects";
  if (questionNumber <= 5) return "Technical Skills Evaluation";
  if (questionNumber <= 7) return "DSA / Problem Solving";
  if (questionNumber <= 8) return "Scenario-Based Questions";
  if (questionNumber <= 9) return "Cross-questioning";
  return "Wrap-up";
}

function fallbackQuestions(type: InterviewType) {
  if (type === "HR") {
    return [
      "Tell me about yourself and what brings you to this role.",
      "Describe a time you handled a difficult stakeholder. What did you do?",
      "Why do you want to work at our company?",
      "Tell me about a failure and what you learned from it.",
      "Describe a time you had a conflict in a team and how you resolved it.",
    ];
  }

  if (type === "Mixed") {
    return [
      "Pick one project from your resume. What was the most difficult technical decision you made, and why?",
      "How would you debug a production incident where latency suddenly spiked?",
      "Explain closures in JavaScript and a common use case.",
      "How would you design a URL shortener at a high level?",
      "Describe a time you disagreed with a teammate. How did you handle it?",
    ];
  }

  return [
    "Explain closures in JavaScript and a common use case.",
    "What is the difference between REST and GraphQL?",
    "Explain how you would optimize a slow web page.",
    "What are React Server Components and what problems do they solve?",
    "Describe how you would design a URL shortener at a high level.",
  ];
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardSimilarity(a: string, b: string) {
  const A = new Set(normalize(a).split(" ").filter(Boolean));
  const B = new Set(normalize(b).split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;

  let intersection = 0;
  for (const t of A) if (B.has(t)) intersection += 1;

  const union = A.size + B.size - intersection;
  return union ? intersection / union : 0;
}

function seemsDuplicate(question: string, previous: string[]) {
  const q = question.trim();
  if (!q) return true;

  for (const p of previous) {
    if (!p?.trim()) continue;
    if (q.toLowerCase() === p.toLowerCase()) return true;
    if (jaccardSimilarity(q, p) >= 0.86) return true;
  }
  return false;
}

function detectLanguageHint(text: string): "en" | "hi" {
  // Very small heuristic: Devanagari implies Hindi.
  if (/[\u0900-\u097F]/.test(text)) return "hi";

  const lower = text.toLowerCase();
  const hits = ["hai", "haan", "nahi", "kyun", "kya", "mera", "meri", "aap", "theek"].filter((w) =>
    new RegExp(`\\b${w}\\b`).test(lower),
  ).length;
  return hits >= 2 ? "hi" : "en";
}

function nudgeSystemPrompt() {
  return [
    "You are a professional interviewer conducting a live interview.",
    "The candidate has paused or is stuck.",
    "Give ONE short, gentle nudge to help them continue.",
    "Rules:",
    "- Do NOT ask a brand-new question or switch topics.",
    "- Do NOT mention time limits or policies.",
    "- Keep it under 18 words.",
    "- Match the candidate's language (English vs Hindi/Hinglish).",
    "Output ONLY the nudge text.",
  ].join("\n");
}

function nudgeUserPrompt(params: { question: string; partialAnswer: string; language: "en" | "hi" }) {
  return [
    `Candidate language: ${params.language}`,
    `Current question: ${params.question}`,
    `Candidate partial answer: ${params.partialAnswer}`,
    "Provide a single gentle nudge that helps them continue the same answer.",
  ].join("\n");
}

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "ai:next-question",
    limit: 60,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as
    | {
        mode?: "question" | "nudge";
        type?: InterviewType;
        difficulty?: Difficulty;
        role?: string;
        experience?: string;
        company?: string;
        focusAreas?: string;
        resumeText?: string;
        resumeProfile?: unknown;
        previousQuestions?: unknown;
        question?: string;
        partialAnswer?: string;
      }
    | null;

  const mode = body?.mode === "nudge" ? "nudge" : "question";

  const type = (body?.type || "HR") as InterviewType;
  const rawDifficulty = (body?.difficulty || "Medium") as Difficulty;
  const difficulty = rawDifficulty === "Adaptive" ? ("Medium" as Difficulty) : rawDifficulty;
  const role = clampString(body?.role?.trim() || "Software Engineer", 120);
  const experience = clampString(body?.experience?.trim() || "0-2 years", 40);
  const company = clampString(body?.company?.trim() || "", 80);
  const focusAreas = clampString(body?.focusAreas?.trim() || "", 600);
  const resumeText = clampString(body?.resumeText?.trim() || "", 12000);

  const previousQuestions = Array.isArray(body?.previousQuestions)
    ? (body?.previousQuestions as unknown[])
        .map((q) => clampString(String(q || "").trim(), 240))
        .filter(Boolean)
        .slice(0, 25)
    : [];

  if (mode === "nudge") {
    const question = clampString(String(body?.question || "").trim(), 800);
    const partialAnswer = clampString(String(body?.partialAnswer || "").trim(), 2000);
    const language = detectLanguageHint(partialAnswer);

    if (!question) {
      return Response.json({ ok: true, nudge: language === "hi" ? "Aaram se — apna approach step-by-step batayein." : "Take your time—walk me through it step by step." });
    }

    const ai = await llmText({
      system: nudgeSystemPrompt(),
      user: nudgeUserPrompt({ question, partialAnswer, language }),
      models: {
        huggingface: process.env.HUGGINGFACE_MODEL_QUESTION || process.env.HUGGINGFACE_MODEL,
        openai: process.env.OPENAI_MODEL,
      },
    });

    const nudge = ai?.text?.trim();
    if (nudge) return Response.json({ ok: true, nudge, source: ai?.provider ?? "llm" });

    return Response.json({
      ok: true,
      nudge: language === "hi" ? "Theek hai — ek example ke saath explain kijiye." : "That’s okay—try explaining with one concrete example.",
      source: "fallback",
    });
  }

  const resumeProfileString = body?.resumeProfile ? clampString(JSON.stringify(body.resumeProfile), 12000) : "";
  const resumeContext = (resumeProfileString || resumeText).trim();

  const questionNumber = Math.min(25, Math.max(1, previousQuestions.length + 1));
  const stage = stageForQuestionNumber(questionNumber);

  const system = resumeContext ? resumeQuestionSystemPrompt() : questionSystemPrompt();
  const baseUser = resumeContext
    ? resumeQuestionUserPrompt({
        parsedResume: resumeContext.slice(0, 4000),
        role,
        experience,
        difficulty,
        type,
        company,
        focusAreas,
        previousQuestions,
        stage,
        questionNumber,
      })
    : questionUserPrompt({
        type,
        difficulty,
        role,
        experience,
        company,
        focusAreas,
        previousQuestions,
        stage,
        questionNumber,
      });

  const candidates: string[] = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const user =
      attempt === 0
        ? baseUser
        : [
            baseUser,
            "",
            "Important: choose a clearly different topic and avoid any overlap with already-asked questions.",
          ].join("\n");

    const ai = await llmText({
      system,
      user,
      models: {
        huggingface: process.env.HUGGINGFACE_MODEL_QUESTION || process.env.HUGGINGFACE_MODEL,
        openai: process.env.OPENAI_MODEL,
      },
    });

    const q = ai?.text?.trim() ?? "";
    if (q) candidates.push(q);
    if (q && !seemsDuplicate(q, previousQuestions)) {
      return Response.json({ ok: true, question: q, source: ai?.provider ?? "llm" });
    }
  }

  const fallbacks = fallbackQuestions(type);
  const fallback =
    fallbacks.find((q) => !seemsDuplicate(q, previousQuestions)) ??
    candidates.find((q) => !seemsDuplicate(q, previousQuestions)) ??
    fallbacks[0];

  return Response.json({ ok: true, question: fallback, source: "fallback" });
}
