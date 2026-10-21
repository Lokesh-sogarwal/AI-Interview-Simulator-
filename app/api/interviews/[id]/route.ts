import { ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
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
      { ok: false, error: dbUnavailableMessage() },
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

  const d = doc as Record<string, unknown>;
  return Response.json({
    ok: true,
    interview: {
      id,
      status: String(d.status ?? ""),
      scheduledFor: d.scheduledFor ? new Date(d.scheduledFor as string).toISOString() : null,
      role: String(d.role ?? ""),
      experience: String(d.experience ?? ""),
      type: String(d.type ?? ""),
      difficulty: String(d.difficulty ?? ""),
      company: String(d.company ?? ""),
      focusAreas: String(d.focusAreas ?? ""),
      interactionMode: d.interactionMode === "video" ? "video" : "typing",
      useResume: d.useResume !== false,
      resumeText: d.resumeText ?? null,
    },
  });
}
