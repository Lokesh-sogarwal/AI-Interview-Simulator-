import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { runAfterResponse } from "@/lib/background";
import {
  CONVERSATION_LIMITS,
  cleanUtterance,
  computeBudget,
  conversationSystemPrompt,
  conversationUserPrompt,
  emptyConversation,
  isUsableUtterance,
  parseConverseOutput,
  publicConversation,
  ungroundedQuotes,
  violatesBudget,
  type ConversationMessage,
  type ConversationState,
  type ConverseOutput,
} from "@/lib/conversation";
import { evaluateMany } from "@/lib/conversationEval";
import { isClosedStatus, parseDifficulty, parseInterviewType } from "@/lib/interviewFlow";
import { aiFailureDetail, llmText } from "@/lib/llm";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { interviewResumeContext } from "@/lib/resumeStore";

const LOCK_TTL_MS = 60_000;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Session time left, excluding time spent paused. */
function secondsLeft(doc: Record<string, unknown>) {
  const started = doc.conversationStartedAt ? new Date(doc.conversationStartedAt as string).getTime() : NaN;
  if (!Number.isFinite(started)) return null;
  const pausedMs = Number(doc.conversationPausedMs) || 0;
  const pausedNow = doc.conversationPausedAt ? Date.now() - new Date(doc.conversationPausedAt as string).getTime() : 0;
  return Math.max(0, Math.round(CONVERSATION_LIMITS.sessionSeconds - (Date.now() - started - pausedMs - pausedNow) / 1000));
}

function stateSummary(conv: ConversationState, doc: Record<string, unknown>) {
  return {
    status: conv.completed ? "completed" : "awaiting_candidate",
    questionNumber: conv.questions.length,
    maxMainQuestions: CONVERSATION_LIMITS.maxMainQuestions,
    secondsLeft: secondsLeft(doc),
    sessionSeconds: CONVERSATION_LIMITS.sessionSeconds,
    paused: Boolean(doc.conversationPausedAt),
  };
}

function publicMessage(m: ConversationMessage) {
  return { id: m.id, role: m.role, text: m.text, kind: m.kind, questionId: m.questionId, at: m.at };
}

/** Transcript for hydration after a refresh. Private interviewer notes are never included. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) return Response.json({ ok: false, error: "Invalid interview id." }, { status: 400 });
  const doc = await db.collection("interviews").findOne({ _id: new ObjectId(id), userId: user.id }, { projection: { conversation: 1, status: 1, conversationStartedAt: 1, conversationPausedAt: 1, conversationPausedMs: 1 } });
  if (!doc) return Response.json({ ok: false, error: "Interview not found." }, { status: 404 });
  const conv = (doc.conversation as ConversationState | undefined) ?? emptyConversation();
  return Response.json({ ok: true, interviewStatus: doc.status, ...publicConversation(conv), state: stateSummary(conv, doc) });
}

/**
 * One conversational turn. `action`:
 *  - "start": opening greeting + first question (or the current state when resuming)
 *  - "reply": the candidate's final utterance (never interim speech)
 *  - "skip":  move on to a new main question
 *
 * `requestId` makes the call idempotent: retries with the same id return the
 * same interviewer reply, and the candidate message is stored only once.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(request, { keyPrefix: "interview:conversation", key: user.id, limit: 90, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) return Response.json({ ok: false, error: "Invalid interview id." }, { status: 400 });
  const oid = new ObjectId(id);

  const body = (await request.json().catch(() => null)) as { requestId?: unknown; action?: unknown; text?: unknown } | null;
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  const action = ["start", "reply", "skip", "pause", "resume"].includes(body?.action as string) ? (body!.action as "start" | "reply" | "skip" | "pause" | "resume") : null;
  if (!REQUEST_ID_RE.test(requestId) || !action) {
    return Response.json({ ok: false, error: "requestId and a valid action (start, reply, skip, pause, resume) are required." }, { status: 400 });
  }
  const rawText = typeof body?.text === "string" ? body.text.slice(0, CONVERSATION_LIMITS.maxUtteranceChars) : "";
  if (action === "reply" && !isUsableUtterance(rawText)) {
    return Response.json({ ok: false, code: "too_short", error: "That reply was empty or too short. Please say or type your answer." }, { status: 400 });
  }

  const interviews = db.collection("interviews");
  const doc = await interviews.findOne({ _id: oid, userId: user.id });
  if (!doc) return Response.json({ ok: false, error: "Interview not found." }, { status: 404 });
  if (isClosedStatus(doc.status)) return Response.json({ ok: false, code: "interview_closed", error: "This interview has already ended." }, { status: 409 });

  let conv: ConversationState = { ...emptyConversation(), ...((doc.conversation as ConversationState | undefined) ?? {}) };

  // Pausing stops the session clock; no AI call involved.
  if (action === "pause" || action === "resume") {
    const at = new Date();
    if (action === "pause" && !doc.conversationPausedAt && doc.conversationStartedAt) {
      await interviews.updateOne({ _id: oid, userId: user.id, conversationPausedAt: { $exists: false } }, { $set: { conversationPausedAt: at } });
    } else if (action === "resume" && doc.conversationPausedAt) {
      const ms = Math.max(0, at.getTime() - new Date(doc.conversationPausedAt).getTime());
      await interviews.updateOne({ _id: oid, userId: user.id, conversationPausedAt: doc.conversationPausedAt }, { $unset: { conversationPausedAt: "" }, $inc: { conversationPausedMs: ms } });
    }
    const fresh = (await interviews.findOne({ _id: oid, userId: user.id }, { projection: { conversationStartedAt: 1, conversationPausedAt: 1, conversationPausedMs: 1 } })) ?? doc;
    return Response.json({ ok: true, ...publicConversation(conv), state: stateSummary(conv, fresh) });
  }

  // Idempotent replay: this request already produced a reply.
  const replayed = conv.messages.find((m) => m.role === "interviewer" && m.replyTo === requestId);
  if (replayed) return Response.json({ ok: true, duplicate: true, message: publicMessage(replayed), ...publicConversation(conv), state: stateSummary(conv, doc) });

  // "start" on an interview that is already under way just returns its state (refresh/resume).
  if (action === "start" && conv.messages.length > 0) {
    const last = [...conv.messages].reverse().find((m) => m.role === "interviewer");
    return Response.json({ ok: true, resumed: true, message: last ? publicMessage(last) : null, ...publicConversation(conv), state: stateSummary(conv, doc) });
  }
  if (conv.completed) return Response.json({ ok: false, code: "conversation_complete", error: "The interviewer has closed this interview. Finish it to see your report." }, { status: 409 });
  if (action !== "start" && !conv.currentQuestionId) {
    return Response.json({ ok: false, code: "not_started", error: "The interview hasn't started yet." }, { status: 409 });
  }

  // Single writer per interview: concurrent turns get 409 instead of interleaving.
  const now = new Date();
  const lock = await interviews.updateOne(
    {
      _id: oid,
      userId: user.id,
      $or: [{ conversationLock: null }, { conversationLock: { $exists: false } }, { "conversationLock.at": { $lt: new Date(now.getTime() - LOCK_TTL_MS) } }, { "conversationLock.requestId": requestId }],
    },
    { $set: { conversationLock: { requestId, at: now } } },
  );
  if (lock.matchedCount === 0) {
    return Response.json({ ok: false, code: "busy", retryable: true, error: "The interviewer is still responding to your previous message." }, { status: 409 });
  }

  try {
    // Persist the candidate's message first so it survives any AI failure.
    let candidateMsg = conv.messages.find((m) => m.role === "candidate" && m.requestId === requestId) ?? null;
    if (!candidateMsg && action !== "start") {
      candidateMsg = {
        id: randomUUID(),
        role: "candidate",
        text: action === "skip" ? "(Skipped this question)" : rawText.trim(),
        cleanText: action === "skip" ? undefined : cleanUtterance(rawText),
        kind: action === "skip" ? "skip" : "answer",
        questionId: conv.currentQuestionId!,
        at: now,
        requestId,
      };
      await interviews.updateOne({ _id: oid, userId: user.id }, { $push: { "conversation.messages": candidateMsg } as never, $set: { updatedAt: now, status: "in_progress" } });
      conv = { ...conv, messages: [...conv.messages, candidateMsg] };
    }

    const isOpening = action === "start";
    const startedAt = doc.conversationStartedAt ? doc : { ...doc, conversationStartedAt: now };
    const budget = computeBudget(conv, isOpening ? CONVERSATION_LIMITS.sessionSeconds : secondsLeft(startedAt));
    const resume = await interviewResumeContext(db, doc);
    const promptInput = {
      type: parseInterviewType(doc.type, "Mixed"),
      difficulty: parseDifficulty(doc.difficulty, "Adaptive"),
      role: String(doc.role || "Software Engineer"),
      experience: String(doc.experience || ""),
      company: String(doc.company || ""),
      focusAreas: String(doc.focusAreas || ""),
      resumeContext: resume.context,
      state: conv,
      budget,
      utterance: isOpening ? null : candidateMsg?.kind === "skip" ? "" : candidateMsg?.cleanText ?? candidateMsg?.text ?? "",
      skipped: candidateMsg?.kind === "skip",
    };

    const candidateTexts = conv.messages.filter((m) => m.role === "candidate" && m.kind === "answer").map((m) => m.text);
    let out: ConverseOutput | null = null;
    let provider: string | null = null;
    let correction = "";
    for (let attempt = 0; attempt < 2 && !out; attempt += 1) {
      const ai = await llmText({
        system: conversationSystemPrompt(),
        user: conversationUserPrompt(promptInput) + correction,
        maxTokens: 500,
        temperature: 0.5,
        models: { huggingface: process.env.HUGGINGFACE_MODEL_CONVERSATION || process.env.HUGGINGFACE_MODEL_QUESTION || process.env.HUGGINGFACE_MODEL, openai: process.env.OPENAI_MODEL },
      }).catch(() => null);
      if (!ai) break; // provider unavailable: no point retrying immediately
      const parsed = parseConverseOutput(ai.text);
      if (!parsed) {
        correction = "\n\nYour previous reply was not valid JSON in the required shape. Reply with the JSON object only.";
        continue;
      }
      if (violatesBudget(parsed, budget, isOpening)) {
        correction = `\n\nYour previous responseType "${parsed.responseType}" is not allowed right now. Follow the budget rules.`;
        continue;
      }
      const bad = ungroundedQuotes(parsed.responseText, candidateTexts);
      if (bad.length) {
        correction = `\n\nDo not attribute words to the candidate that they did not say (e.g. "${bad[0]}"). Paraphrase only what is in the transcript.`;
        continue;
      }
      out = parsed;
      provider = ai.provider;
    }

    if (!out && isOpening) {
      // Deterministic, honest opening so the session can begin; later turns need the AI.
      out = {
        responseText: `Hi, thanks for joining. This is a ${promptInput.type === "Mixed" ? "mixed technical and behavioural" : promptInput.type === "HR" ? "behavioural" : "technical"} interview for the ${promptInput.role} role. Let's start: could you tell me about yourself and what you've been working on recently?`,
        responseType: "next_question",
        nextAction: "next_question",
        completionStatus: "in_progress",
      };
      provider = "fallback";
    }
    if (!out) {
      const detail = aiFailureDetail();
      return Response.json(
        {
          ok: false,
          code: "ai_unavailable",
          reason: detail.reason,
          retryable: true,
          candidateMessageSaved: Boolean(candidateMsg),
          error: `The interviewer couldn't respond${detail.text ? ` because ${detail.text}` : " just now"}. Your answer is saved; please retry.`,
        },
        { status: 503 },
      );
    }

    const closingQuestionId = conv.currentQuestionId;
    let questionId = conv.currentQuestionId ?? "";
    const questions = [...conv.questions];
    if (out.responseType === "next_question") {
      if (closingQuestionId) {
        const idx = questions.findIndex((q) => q.id === closingQuestionId);
        if (idx >= 0) questions[idx] = { ...questions[idx], closedAt: now };
      }
      questionId = randomUUID();
      const project = out.projectIndex && resume.parsed ? resume.parsed.projects[out.projectIndex - 1] : undefined;
      questions.push({
        id: questionId,
        text: out.responseText,
        askedAt: now,
        closedAt: null,
        projectRef: project ? { resumeId: resume.resumeId ?? undefined, projectIndex: out.projectIndex! - 1, projectName: project.name } : null,
      });
    } else if (out.responseType === "closing" && closingQuestionId) {
      const idx = questions.findIndex((q) => q.id === closingQuestionId);
      if (idx >= 0) questions[idx] = { ...questions[idx], closedAt: now };
    }

    const reply: ConversationMessage = { id: randomUUID(), role: "interviewer", text: out.responseText, kind: out.responseType, questionId, at: new Date(), replyTo: requestId };
    conv = {
      messages: [...conv.messages, reply],
      questions,
      notes: out.evaluationNotes && closingQuestionId ? [...conv.notes, { questionId: closingQuestionId, note: out.evaluationNotes, at: now }] : conv.notes,
      currentQuestionId: out.responseType === "closing" ? null : questionId,
      completed: out.responseType === "closing",
    };

    await interviews.updateOne(
      { _id: oid, userId: user.id, "conversationLock.requestId": requestId },
      {
        $set: {
          conversation: conv,
          updatedAt: new Date(),
          status: "in_progress",
          lastConversationProvider: provider,
          ...(doc.conversationStartedAt ? {} : { conversationStartedAt: now }),
        },
      },
    );

    // Score the question that just closed without delaying the reply.
    const justClosed = out.responseType === "next_question" || out.responseType === "closing" ? closingQuestionId : null;
    if (justClosed) {
      const snapshot = { ...doc, conversation: conv, _id: oid };
      runAfterResponse(() => evaluateMany(db, snapshot, user.id, [justClosed], resume.context));
    }

    const docForState = doc.conversationStartedAt ? doc : { ...doc, conversationStartedAt: now };
    return Response.json({ ok: true, message: publicMessage(reply), fallback: provider === "fallback", ...publicConversation(conv), state: stateSummary(conv, docForState) });
  } finally {
    await interviews.updateOne({ _id: oid, "conversationLock.requestId": requestId }, { $unset: { conversationLock: "" } });
  }
}
