import { ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rl = rateLimit(request, {
    keyPrefix: "interviews:get",
    limit: 120,
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

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return Response.json({ ok: false, error: "Invalid interview id." }, { status: 400 });
  }

  const doc = await db.collection("interviews").findOne(
    { _id: new ObjectId(id), userId: user.id },
    {
      projection: {
        status: 1,
        scheduledFor: 1,
        role: 1,
        experience: 1,
        type: 1,
        difficulty: 1,
        company: 1,
        focusAreas: 1,
        interactionMode: 1,
        useResume: 1,
        resumeText: 1,
      },
    },
  );

  if (!doc) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  return Response.json({
    ok: true,
    interview: {
      id,
      status: String((doc as any).status ?? ""),
      scheduledFor: (doc as any).scheduledFor ? new Date((doc as any).scheduledFor).toISOString() : null,
      role: String((doc as any).role ?? ""),
      experience: String((doc as any).experience ?? ""),
      type: String((doc as any).type ?? ""),
      difficulty: String((doc as any).difficulty ?? ""),
      company: String((doc as any).company ?? ""),
      focusAreas: String((doc as any).focusAreas ?? ""),
      interactionMode: (doc as any).interactionMode === "video" ? "video" : "typing",
      useResume: (doc as any).useResume !== false,
      resumeText: (doc as any).resumeText ?? null,
    },
  });
}
