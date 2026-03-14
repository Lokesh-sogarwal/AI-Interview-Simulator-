import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export async function GET() {
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

  const result = await db.collection("interviews").insertOne({
    userId: user.id,
    role: body.role,
    type: body.type,
    difficulty: body.difficulty,
    totalScore: body.totalScore ?? null,
    breakdown: body.breakdown ?? null,
    transcript: body.transcript,
    createdAt: new Date(),
  });

  return Response.json({ ok: true, id: String(result.insertedId) });
}
