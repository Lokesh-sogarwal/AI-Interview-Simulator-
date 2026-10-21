import { ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";
import { findPendingEvaluation, noAnswerEvaluation, turnKey } from "@/lib/interviewRecords";
import { isClosedStatus } from "@/lib/interviewFlow";

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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rl = rateLimit(request, {
    keyPrefix: "interviews:turn",
    limit: 120,
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

  const body = (await request.json().catch(() => null)) as
    | {
        question?: string;
        answer?: string;
        star?: unknown;
        askedAt?: string;
        answeredAt?: string;
      }
    | null;

  const question = clampString(String(body?.question ?? "").trim(), 800);
  // An empty answer is valid: it records a question that timed out unanswered.
  const answer = clampString(String(body?.answer ?? "").trim(), 4000);
  if (!question) {
    return Response.json({ ok: false, error: "Missing question." }, { status: 400 });
  }

  const interviews = db.collection("interviews");
  const ownerFilter = { _id: new ObjectId(id), ...(user ? { userId: user.id } : { anonId }) };
  const doc = await interviews.findOne(ownerFilter, {
    projection: { status: 1, pendingEvaluations: 1, "turns.question": 1, "turns.answer": 1 },
  });

  if (!doc) {
    return Response.json({ ok: false, error: "Interview not found." }, { status: 404 });
  }
  if (isClosedStatus(doc.status)) {
    return Response.json({ ok: false, error: "This interview has already ended." }, { status: 409 });
  }

  // Double submits (retries, double clicks, timer + click races) are idempotent.
  const alreadySaved = (Array.isArray(doc.turns) ? doc.turns : []).some(
    (t: { question?: unknown; answer?: unknown }) => t?.question === question && t?.answer === answer,
  );
  if (alreadySaved) {
    return Response.json({ ok: true, duplicate: true });
  }

  // Scores are only ever taken from evaluations the server produced itself.
  const evaluation = answer ? findPendingEvaluation(doc, turnKey(question, answer)) : noAnswerEvaluation();

  const now = new Date();
  const askedAt = body?.askedAt ? new Date(body.askedAt) : undefined;
  const answeredAt = body?.answeredAt ? new Date(body.answeredAt) : undefined;

  const update = await interviews.updateOne(
    {
      ...ownerFilter,
      status: { $nin: ["completed", "terminated"] },
      turns: { $not: { $elemMatch: { question, answer } } },
    },
    {
      $push: {
        turns: {
          question,
          answer,
          evaluation,
          star: body?.star ?? null,
          askedAt: askedAt && !Number.isNaN(askedAt.getTime()) ? askedAt : null,
          answeredAt: answeredAt && !Number.isNaN(answeredAt.getTime()) ? answeredAt : now,
        },
      },
      $set: { updatedAt: now, status: "in_progress" },
    } as never,
  );

  if (update.matchedCount === 0) {
    // Lost a race with a concurrent identical submit.
    return Response.json({ ok: true, duplicate: true });
  }

  return Response.json({ ok: true, evaluated: Boolean(evaluation) });
}
