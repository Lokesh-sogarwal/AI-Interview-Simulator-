import { getCurrentUser } from "@/lib/auth";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

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
      { ok: false, error: dbUnavailableMessage() },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const status = url.searchParams.get("status");

  const interviews = await db
    .collection("interviews")
    .find(
      { userId: user.id, ...(status && /^[a-z_]{1,20}$/.test(status) ? { status } : {}) },
      // Keep private/internal fields (raw resume text, pending evaluations) out of list responses.
      { projection: { resumeText: 0, resumeProfile: 0, pendingEvaluations: 0, liveState: 0, anonId: 0 } },
    )
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return Response.json({ ok: true, interviews });
}

// Interviews are persisted turn-by-turn by the live session endpoints
// (/api/start-interview, /api/interviews/[id]/turn, /api/interviews/[id]/finish).
// The old bulk "save" accepted client-supplied scores, which let anyone write
// arbitrary results into rankings, so it is retired.
export async function POST() {
  return Response.json(
    {
      ok: false,
      error: "Interviews are saved automatically while you answer. Manual saving is no longer supported.",
    },
    { status: 410 },
  );
}
