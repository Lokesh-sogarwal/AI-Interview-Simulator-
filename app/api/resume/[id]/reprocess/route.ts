import { getCurrentUser } from "@/lib/auth";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { loadOwnResume, publicResume, reprocessResume } from "@/lib/resumeStore";

/** Re-runs parsing on the stored text (e.g. after the AI provider was unavailable). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const rl = rateLimit(request, { keyPrefix: "resume:reprocess", key: user.id, limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);
  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });
  const { id } = await context.params;
  const doc = await loadOwnResume(db, user.id, id);
  if (!doc) return Response.json({ ok: false, error: "Resume not found." }, { status: 404 });
  const updated = await reprocessResume(db, doc);
  return Response.json({ ok: true, resume: publicResume(updated) });
}
