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
      "Tell me about yourself and what brings you to this role.",
      "Pick one project from your resume. What was the most difficult technical decision you made, and why?",
      "Describe a time you disagreed with a teammate. How did you handle it?",
      "Explain closures in JavaScript and a common use case.",
      "How would you design a URL shortener at a high level?",
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

function stageForQuestionNumber(questionNumber: number) {
  // Designed for a ~10 minute interview at ~60s/question (~10 questions).
  // Q1 is the introduction (handled client-side). This function is for subsequent questions.
  if (questionNumber <= 1) return "Introduction";
  if (questionNumber <= 3) return "Resume & Projects";
  if (questionNumber <= 5) return "Technical Skills Evaluation";
  if (questionNumber <= 7) return "DSA / Problem Solving";
  if (questionNumber <= 8) return "Scenario-Based Questions";
  if (questionNumber <= 9) return "Cross-questioning";
  return "Wrap-up";
}

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "ai:question",
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as
    | {
        type?: InterviewType;
        difficulty?: Difficulty;
        role?: string;
        experience?: string;
        company?: string;
        focusAreas?: string;
        resumeText?: string;
        resumeProfile?: unknown;
        previousQuestions?: unknown;
      }
    | null;

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

  const resumeProfileString = body?.resumeProfile
    ? clampString(JSON.stringify(body.resumeProfile), 12000)
    : "";

  const resumeContext = (resumeProfileString || resumeText).trim();

  // Client asks the introduction question; this endpoint generates subsequent questions.
  // previousQuestions contains already-asked questions.
  const questionNumber = Math.min(25, Math.max(1, previousQuestions.length + 1));
  const stage = stageForQuestionNumber(questionNumber);

  const system = resumeContext ? resumeQuestionSystemPrompt() : questionSystemPrompt();
  const user = resumeContext
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
    : questionUserPrompt({ type, difficulty, role, experience, company, focusAreas, previousQuestions, stage, questionNumber });

  const aiQuestion = await llmText({
    system,
    user,
    models: {
      huggingface: process.env.HUGGINGFACE_MODEL_QUESTION || process.env.HUGGINGFACE_MODEL,
      openai: process.env.OPENAI_MODEL,
    },
  });
  if (aiQuestion) {
    return Response.json({ ok: true, question: aiQuestion.text, source: aiQuestion.provider });
  }

  const candidates = fallbackQuestions(type);
  const question = candidates[Math.floor(Math.random() * candidates.length)];
  return Response.json({ ok: true, question, source: "fallback" });
}
