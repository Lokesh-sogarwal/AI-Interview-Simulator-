import { ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { llmText } from "@/lib/llm";
import { getDb } from "@/lib/mongodb";
import {
  compactQuestion,
  detectLanguageHint,
  extractTopicKeywords,
  looksLikeRepeat,
  stageForQuestionNumber,
  statefulQuestionSystemPrompt,
  statefulQuestionUserPrompt,
} from "@/lib/interviewFlow";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";
import type { Difficulty, InterviewType } from "@/lib/prompts";

type NextQuestionBody = {
  interviewId?: string;
  // Optional overrides; normally we load these from the interview doc.
  type?: InterviewType;
  difficulty?: Difficulty;
  role?: string;
  experience?: string;
  company?: string;
  focusAreas?: string;
  useResume?: boolean;
  resumeText?: string;
  resumeProfile?: unknown;
};

function safeObjectId(id: string) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

function uniqStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = (v || "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function fallbackQuestions(type: InterviewType) {
  if (type === "HR") {
    return [
      "What’s a recent challenge you faced at work, and how did you handle it?",
      "Tell me about a time you influenced a decision without authority.",
      "Describe a conflict in a team and how you resolved it.",
      "What do you look for in a manager or team culture?",
    ];
  }

  if (type === "Mixed") {
    return [
      "Pick a recent project. What trade-off did you make, and why?",
      "Explain how you’d debug a production issue with limited information.",
      "How would you design a rate limiter for an API?",
      "Describe a time you disagreed with a teammate. What happened?",
    ];
  }

  return [
    "Explain the difference between horizontal and vertical scaling with an example.",
    "How would you design an API rate limiter?",
    "Walk me through how you’d debug a memory leak in a Node.js service.",
    "What’s the difference between optimistic and pessimistic locking?",
  ];
}

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "interview:next_question",
    limit: 60,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  if (!db) {
    return Response.json(
      { ok: false, error: "Database is not configured." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as NextQuestionBody | null;
  const idRaw = typeof body?.interviewId === "string" ? body.interviewId.trim() : "";
  const oid = idRaw ? safeObjectId(idRaw) : null;
  if (!oid) {
    return Response.json({ ok: false, error: "Missing interviewId." }, { status: 400 });
  }

  const interview = await db.collection("interviews").findOne({ _id: oid });
  if (!interview) {
    return Response.json({ ok: false, error: "Interview not found." }, { status: 404 });
  }
  if (String(interview.userId || "") !== String(user.id)) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const type = (body?.type || interview.type || "HR") as InterviewType;
  const rawDifficulty = (body?.difficulty || interview.difficulty || "Medium") as Difficulty;
  const difficulty = rawDifficulty === "Adaptive" ? ("Medium" as Difficulty) : rawDifficulty;
  const role = clampString(String(body?.role || interview.role || "Software Engineer").trim() || "Software Engineer", 120);
  const experience = clampString(String(body?.experience || interview.experience || "0-2 years").trim() || "0-2 years", 40);
  const company = clampString(String(body?.company || interview.company || "").trim(), 80);
  const focusAreas = clampString(String(body?.focusAreas || interview.focusAreas || "").trim(), 600);
  const useResume = (body?.useResume ?? interview.useResume) !== false;

  const resumeText = useResume ? clampString(String(body?.resumeText || interview.resumeText || "").trim(), 12000) : "";
  const resumeProfileString = useResume && (body?.resumeProfile || interview.resumeProfile)
    ? clampString(JSON.stringify(body?.resumeProfile || interview.resumeProfile), 12000)
    : "";
  const resumeContext = (resumeProfileString || resumeText).trim();

  const turns = Array.isArray(interview.turns) ? (interview.turns as Array<{ question?: string; answer?: string }>) : [];
  const turnQuestions = turns.map((t) => String(t?.question || "")).filter(Boolean);
  const liveAsked = Array.isArray(interview.liveState?.askedQuestions)
    ? (interview.liveState.askedQuestions as string[])
    : [];

  const previousQuestions = uniqStrings([...liveAsked, ...turnQuestions]).slice(0, 30);
  const nextQuestionNumber = Math.min(30, Math.max(1, previousQuestions.length + 1));
  const stage = stageForQuestionNumber(nextQuestionNumber);

  const lastTurn = turns.length
    ? {
        question: String(turns[turns.length - 1]?.question || "").trim(),
        answer: String(turns[turns.length - 1]?.answer || "").trim(),
      }
    : null;

  const previousTopics = Array.isArray(interview.liveState?.coveredTopics)
    ? (interview.liveState.coveredTopics as string[]).map((s) => String(s || "")).filter(Boolean)
    : [];
  const newTopics = lastTurn?.answer ? extractTopicKeywords(lastTurn.answer) : [];
  const coveredTopics = uniqStrings([...previousTopics, ...newTopics]).slice(0, 30);

  const languageHint = detectLanguageHint(lastTurn?.answer || "");

  const system = statefulQuestionSystemPrompt();
  const userPromptBase = statefulQuestionUserPrompt({
    type,
    difficulty,
    role,
    experience,
    company,
    focusAreas,
    stage,
    questionNumber: nextQuestionNumber,
    previousQuestions,
    coveredTopics,
    resumeContext,
    lastTurn,
    languageHint,
  });

  let question = "";
  let provider: string = "fallback";

  // Try a couple times if we generate repeats.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const extra = attempt === 0 ? "" : `\n\nDo NOT ask anything similar to: ${question || "(none)"}`;
    const ai = await llmText({
      system,
      user: `${userPromptBase}${extra}`,
      models: {
        huggingface: process.env.HUGGINGFACE_MODEL_QUESTION || process.env.HUGGINGFACE_MODEL,
        openai: process.env.OPENAI_MODEL,
      },
    });

    const candidate = ai?.text ? compactQuestion(ai.text) : "";
    if (!candidate) continue;
    if (looksLikeRepeat(candidate, previousQuestions)) {
      question = candidate;
      provider = ai?.provider || provider;
      continue;
    }

    question = candidate;
    provider = ai?.provider || provider;
    break;
  }

  if (!question || looksLikeRepeat(question, previousQuestions)) {
    const candidates = fallbackQuestions(type);
    question = candidates[Math.floor(Math.random() * candidates.length)];
    provider = "fallback";
  }

  const now = new Date();
  await db.collection("interviews").updateOne(
    { _id: oid },
    {
      $set: {
        updatedAt: now,
        "liveState.currentStage": stage,
        "liveState.languageHint": languageHint,
        "liveState.coveredTopics": coveredTopics,
        "liveState.updatedAt": now,
      },
      $addToSet: {
        "liveState.askedQuestions": question,
      },
    },
  );

  return Response.json({
    ok: true,
    interviewId: idRaw,
    stage,
    questionNumber: nextQuestionNumber,
    question,
    source: provider,
  });
}
