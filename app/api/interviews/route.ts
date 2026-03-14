import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";

export async function GET(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "interviews:list",
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

  const interviews = await db
    .collection("interviews")
    .find({ userId: user.id })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  return Response.json({ ok: true, interviews });
}

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "interviews:create",
    limit: 20,
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

  const body = (await request.json().catch(() => null)) as
    | {
        role?: string;
        type?: string;
        difficulty?: string;
        totalScore?: number;
        breakdown?: {
          technical?: number;
          clarity?: number;
          confidence?: number;
          depth?: number;
        };
        transcript?: Array<{
          question: string;
          answer: string;
          evaluation: unknown;
          star?: unknown;
        }>;
      }
    | null;

  if (!body?.role || !body?.type || !body?.difficulty || !body?.transcript) {
    return Response.json(
      { ok: false, error: "Missing required interview fields." },
      { status: 400 },
    );
  }

  const transcript = Array.isArray(body.transcript) ? body.transcript.slice(0, 50) : [];
  if (transcript.length === 0) {
    return Response.json(
      { ok: false, error: "Transcript must be a non-empty array." },
      { status: 400 },
    );
  }

  const result = await db.collection("interviews").insertOne({
    userId: user.id,
    role: clampString(String(body.role).trim(), 120),
    type: clampString(String(body.type).trim(), 40),
    difficulty: clampString(String(body.difficulty).trim(), 24),
    totalScore: body.totalScore ?? null,
    breakdown: body.breakdown ?? null,
    transcript: transcript.map((t) => ({
      question: clampString(String(t.question || "").trim(), 800),
      answer: clampString(String(t.answer || "").trim(), 4000),
      evaluation: t.evaluation ?? null,
      star: t.star ?? null,
    })),
    createdAt: new Date(),
  });

  return Response.json({ ok: true, id: String(result.insertedId) });
}
