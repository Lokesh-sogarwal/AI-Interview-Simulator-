import { ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { llmText } from "@/lib/llm";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import {
  compactQuestion,
  detectLanguageHint,
  isClosedStatus,
  parseDifficulty,
  parseInterviewType,
  stageForQuestionNumber,
  statefulQuestionSystemPrompt,
  statefulQuestionUserPrompt,
} from "@/lib/interviewFlow";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";
import { loadOwnResume } from "@/lib/resumeStore";
import type { Difficulty, InterviewType } from "@/lib/prompts";

const INTRO_QUESTION = "Tell me about yourself.";

type StartInterviewBody = {
  interviewId?: string;
  type?: InterviewType;
  difficulty?: Difficulty;
  role?: string;
  experience?: string;
  company?: string;
  focusAreas?: string;
  interactionMode?: "typing" | "video";
  useResume?: boolean;
  resumeText?: string;
  resumeProfile?: unknown;
  resumeId?: string;
};

function safeObjectId(id: string) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "interview:start",
    limit: 40,
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
      { ok: false, error: dbUnavailableMessage() },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as StartInterviewBody | null;

  const type: InterviewType = parseInterviewType(body?.type, "Mixed");
  const difficulty: Difficulty = parseDifficulty(body?.difficulty, "Adaptive");
  const role = clampString(String(body?.role || "Software Engineer").trim() || "Software Engineer", 120);
  const experience = clampString(String(body?.experience || "0-2 years").trim() || "0-2 years", 40);
  const company = clampString(String(body?.company || "").trim(), 80);
  const focusAreas = clampString(String(body?.focusAreas || "").trim(), 600);
  // Interviews are voice/video only; older records keep their stored "typing" mode for history.
  const interactionMode = "video" as const;
  const useResume = body?.useResume !== false;
  const resumeText = useResume ? clampString(String(body?.resumeText || "").trim(), 12000) : "";
  const resumeProfileString = useResume && body?.resumeProfile ? clampString(JSON.stringify(body.resumeProfile), 12000) : "";

  const resumeContext = (resumeProfileString || resumeText).trim();
  // Link a stored resume only if it belongs to this user.
  const ownResume = useResume && body?.resumeId ? await loadOwnResume(db, user.id, body.resumeId) : null;
  const resumeId = ownResume ? String(ownResume._id) : null;

  const now = new Date();
  const requestedId = typeof body?.interviewId === "string" ? body.interviewId.trim() : "";
  const requestedObjectId = requestedId ? safeObjectId(requestedId) : null;

  let interviewId: string;

  if (requestedObjectId) {
    const interview = await db.collection("interviews").findOne({ _id: requestedObjectId });
    if (!interview) {
      return Response.json({ ok: false, error: "Interview not found." }, { status: 404 });
    }
    if (String(interview.userId || "") !== String(user.id)) {
      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (isClosedStatus(interview.status)) {
      return Response.json(
        { ok: false, code: "interview_closed", error: "This interview has already ended. Start a new one from setup." },
        { status: 409 },
      );
    }

    // Resuming after a refresh: keep the transcript and live state intact and
    // let the client continue with the next question.
    const existingTurns = Array.isArray(interview.turns) ? interview.turns : [];
    if (interview.status === "in_progress" && existingTurns.length > 0) {
      return Response.json({
        ok: true,
        interviewId: requestedId,
        resumed: true,
        turns: existingTurns.map((t: { question?: unknown; answer?: unknown; evaluation?: unknown; star?: unknown }) => ({
          question: String(t?.question ?? ""),
          answer: String(t?.answer ?? ""),
          evaluation: t?.evaluation ?? null,
          star: t?.star ?? undefined,
        })),
        config: {
          type: parseInterviewType(interview.type, type),
          difficulty: parseDifficulty(interview.difficulty, difficulty),
          role: String(interview.role || role),
          experience: String(interview.experience || experience),
          company: String(interview.company ?? company),
          focusAreas: String(interview.focusAreas ?? focusAreas),
        },
      });
    }

    // Enforce scheduled start time server-side as well.
    if (interview.status === "scheduled" && interview.scheduledFor) {
      const scheduledTs = new Date(interview.scheduledFor).getTime();
      if (Number.isFinite(scheduledTs) && scheduledTs > Date.now()) {
        const secondsLeft = Math.max(0, Math.ceil((scheduledTs - Date.now()) / 1000));
        return Response.json(
          {
            ok: false,
            error: "Interview is scheduled for a future time.",
            secondsLeft,
          },
          { status: 400 },
        );
      }
    }

    interviewId = requestedId;

    await db.collection("interviews").updateOne(
      { _id: requestedObjectId },
      {
        $set: {
          role,
          experience,
          type,
          difficulty,
          company,
          focusAreas,
          interactionMode,
          useResume,
          ...(resumeText ? { resumeText } : {}),
          ...(resumeId ? { resumeId } : {}),
          ...(resumeProfileString ? { resumeProfile: body?.resumeProfile } : {}),
          status: "in_progress",
          startedAt: now,
          updatedAt: now,
          liveState: {
            currentStage: "Introduction",
            askedQuestions: [INTRO_QUESTION],
            coveredTopics: [],
            candidateSkills: [],
            resumeData: resumeContext ? { context: resumeContext.slice(0, 4000) } : null,
            languageHint: "en",
            updatedAt: now,
          },
        },
      },
    );
  } else {
    const result = await db.collection("interviews").insertOne({
      userId: user.id,
      role,
      experience,
      type,
      difficulty,
      company,
      focusAreas,
      interactionMode,
      useResume,
      resumeText: resumeText || null,
      resumeId,
      resumeProfile: body?.resumeProfile ?? null,
      turns: [],
      status: "in_progress",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
      liveState: {
        currentStage: "Introduction",
        askedQuestions: [INTRO_QUESTION],
        coveredTopics: [],
        candidateSkills: [],
        resumeData: resumeContext ? { context: resumeContext.slice(0, 4000) } : null,
        languageHint: "en",
        updatedAt: now,
      },
    });

    interviewId = String(result.insertedId);
  }

  // For start, we keep the intro question consistent and immediate.
  // (We still run it through the prompt pipeline if you'd like to localize it
  // based on candidate language/resume, but keep it stable by default.)
  const stage = stageForQuestionNumber(1);
  const languageHint = detectLanguageHint(resumeContext);

  // Optional: if resume suggests Hindi/Hinglish, ask intro accordingly.
  let question = INTRO_QUESTION;
  if (languageHint !== "en") {
    const system = statefulQuestionSystemPrompt();
    const userPrompt = statefulQuestionUserPrompt({
      type,
      difficulty,
      role,
      experience,
      company,
      focusAreas,
      stage,
      questionNumber: 1,
      previousQuestions: [],
      coveredTopics: [],
      resumeContext,
      lastTurn: null,
      languageHint,
    });

    const ai = await llmText({
      system,
      user: userPrompt,
      task: "question",
      models: {
        huggingface: process.env.HUGGINGFACE_MODEL_QUESTION || process.env.HUGGINGFACE_MODEL,
        openai: process.env.OPENAI_MODEL,
      },
    });

    const generated = ai?.text ? compactQuestion(ai.text) : "";
    if (generated) question = generated;
  }

  return Response.json({
    ok: true,
    interviewId,
    stage,
    questionNumber: 1,
    question,
  });
}
