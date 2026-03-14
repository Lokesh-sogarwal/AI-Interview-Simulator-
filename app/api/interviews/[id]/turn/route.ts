import { ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

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
  const user = await getCurrentUser();
  const anonId = !user && allowAnonymousInterviews() ? getAnonId(request) : null;
  if (!user && !anonId) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  if (!db) {
    return Response.json(
      { ok: false, error: "Database is not configured." },
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
        evaluation?: unknown;
        star?: unknown;
        askedAt?: string;
        answeredAt?: string;
      }
    | null;

  const question = body?.question?.trim() || "";
  const answer = body?.answer?.trim() || "";
  if (!question || !answer) {
    return Response.json(
      { ok: false, error: "Missing question or answer." },
      { status: 400 },
    );
  }

  const now = new Date();
  const askedAt = body?.askedAt ? new Date(body.askedAt) : undefined;
  const answeredAt = body?.answeredAt ? new Date(body.answeredAt) : undefined;

  const interviews = db.collection<any>("interviews");
  const update = await interviews.updateOne(
    {
      _id: new ObjectId(id),
      ...(user ? { userId: user.id } : { anonId }),
    },
    {
      $push: {
        turns: {
          question,
          answer,
          evaluation: body?.evaluation ?? null,
          star: body?.star ?? null,
          askedAt: askedAt && !Number.isNaN(askedAt.getTime()) ? askedAt : null,
          answeredAt: answeredAt && !Number.isNaN(answeredAt.getTime()) ? answeredAt : now,
        },
      },
      $set: { updatedAt: now },
    } as any,
  );

  if (update.matchedCount === 0) {
    return Response.json({ ok: false, error: "Interview not found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
