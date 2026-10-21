import { ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { evaluateMany, questionsNeedingEvaluation } from "@/lib/conversationEval";
import { averageOverallScore } from "@/lib/interviewRecords";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { interviewResumeContext } from "@/lib/resumeStore";

/**
 * Retries evaluations that failed earlier (AI provider unavailable) using the
 * saved transcript, then refreshes the stored average. The candidate never
 * has to repeat the interview.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const rl = rateLimit(request, { keyPrefix: "interviews:evaluate-pending", key: user.id, limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);
  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) return Response.json({ ok: false, error: "Invalid interview id." }, { status: 400 });
  const filter = { _id: new ObjectId(id), userId: user.id };
  const interviews = db.collection("interviews");
  const doc = await interviews.findOne(filter);
  if (!doc) return Response.json({ ok: false, error: "Interview not found." }, { status: 404 });

  const pending = questionsNeedingEvaluation(doc, doc.status !== "in_progress");
  if (pending.length) {
    const resume = await interviewResumeContext(db, doc);
    await evaluateMany(db, doc as typeof doc & { _id: ObjectId }, user.id, pending, resume.context);
  }
  const fresh = await interviews.findOne(filter, { projection: { turns: 1, status: 1 } });
  const turns = Array.isArray(fresh?.turns) ? fresh.turns : [];
  const remaining = turns.filter((t: { evaluationPending?: boolean }) => t?.evaluationPending).length;
  const averageScore = averageOverallScore(turns);
  if (fresh && (fresh.status === "completed" || fresh.status === "terminated")) {
    await interviews.updateOne(filter, { $set: { averageScore, unevaluatedCount: remaining, updatedAt: new Date() } });
  }
  return Response.json({ ok: remaining === 0, averageScore, pendingEvaluations: remaining, ...(remaining ? { error: "Some answers still couldn't be evaluated. Please try again later.", retryable: true } : {}) }, { status: remaining ? 503 : 200 });
}
