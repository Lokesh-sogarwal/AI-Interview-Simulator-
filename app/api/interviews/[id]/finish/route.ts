import { ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { averageOverallScore } from "@/lib/interviewRecords";
import { isClosedStatus } from "@/lib/interviewFlow";
import { evaluateMany, questionsNeedingEvaluation } from "@/lib/conversationEval";
import { interviewResumeContext } from "@/lib/resumeStore";
import { endSessions, storeSummary } from "@/lib/proctoringStore";

function allowAnonymousInterviews() {
  return process.env.ALLOW_ANON_INTERVIEWS === "true" || process.env.NODE_ENV !== "production";
}

function getAnonId(request: Request) {
  const raw = request.headers.get("x-aisim-anon-id")?.trim() ?? "";
  if (!raw) return null;
  if (raw.length < 8 || raw.length > 128) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(raw)) return null;
  return raw;
}

const ENDED_REASONS = new Set(["manual_end", "max_questions", "time_limit"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rl = rateLimit(request, {
    keyPrefix: "interviews:finish",
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const user = await getCurrentUser();
  const anonId = !user && allowAnonymousInterviews() ? getAnonId(request) : null;
  if (!user && !anonId) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  if (!db) {
    return Response.json(
      { ok: false, error: dbUnavailableMessage() },
      { status: 503 },
    );
  }

  const { id } = await context.params;
  if (!id || !ObjectId.isValid(id)) {
    return Response.json({ ok: false, error: "Invalid interview id." }, { status: 400 });
  }

  // Any proctoring numbers sent by the browser are ignored: the integrity summary is
  // computed from server-validated events below.
  const body = (await request.json().catch(() => null)) as { endedReason?: string } | null;

  const interviews = db.collection("interviews");
  const ownerFilter = { _id: new ObjectId(id), ...(user ? { userId: user.id } : { anonId }) };
  let doc = await interviews.findOne(ownerFilter);
  if (!doc) {
    return Response.json({ ok: false, error: "Interview not found." }, { status: 404 });
  }

  // Repeated finish requests must not overwrite the original completion.
  if (isClosedStatus(doc.status)) {
    return Response.json({ ok: true, alreadyFinished: true, status: doc.status, averageScore: doc.averageScore ?? null });
  }

  // Conversational interviews: score every question from the saved transcript
  // (including the one still open) before computing the final result.
  if (user && doc.conversation) {
    const pending = questionsNeedingEvaluation(doc, true);
    if (pending.length) {
      const resume = await interviewResumeContext(db, doc);
      await evaluateMany(db, doc as typeof doc & { _id: ObjectId }, user.id, pending, resume.context);
      doc = (await interviews.findOne(ownerFilter)) ?? doc;
    }
  }

  const now = new Date();
  const rawReason = typeof body?.endedReason === "string" ? body.endedReason.trim() : "";
  // Proctoring never ends an interview by itself (older clients sent "proctor_violations").
  const endedReason = ENDED_REASONS.has(rawReason) ? rawReason : "manual_end";
  const status = "completed";
  // The score is derived from the stored, server-evaluated turns only.
  const turns = Array.isArray(doc.turns) ? doc.turns : [];
  const averageScore = averageOverallScore(turns);
  const pendingEvaluations = turns.filter((t: { evaluationPending?: boolean }) => t?.evaluationPending).length;

  const update = await interviews.updateOne(
    { ...ownerFilter, status: { $nin: ["completed", "terminated"] } },
    {
      $set: {
        status,
        completedAt: now,
        updatedAt: now,
        averageScore,
        // Count of answers still awaiting evaluation (distinct from the pendingEvaluations cache unset below).
        unevaluatedCount: pendingEvaluations,
        endedReason,
        ...(doc.conversation ? { "conversation.completed": true, "conversation.currentQuestionId": null } : {}),
      },
      $unset: { pendingEvaluations: "" },
    },
  );

  if (update.matchedCount === 0) {
    return Response.json({ ok: true, alreadyFinished: true });
  }

  // Close proctoring sessions and store the integrity summary, kept separate from the scores above.
  // A failure here must not undo the completed interview; the summary can be rebuilt from the events.
  let proctoring: { status: string; reviewStatus: string } | null = null;
  if (user) {
    try {
      const owner = { interviewId: new ObjectId(id), userId: user.id };
      await endSessions(db, owner, endedReason);
      const summary = await storeSummary(db, owner);
      proctoring = { status: summary.status, reviewStatus: summary.reviewStatus };
    } catch (e) {
      console.error("[finish] proctoring summary not stored:", e instanceof Error ? e.name : "unknown");
    }
  }

  return Response.json({ ok: true, status, averageScore, pendingEvaluations, proctoring });
}
