import { getCurrentUser } from "@/lib/auth";
import { jsonError, readJsonObject, toObjectId } from "@/lib/http";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const MAX_NOTE = 1000;

/** Lets the candidate explain technical issues next to their proctoring summary (shown to reviewers). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);
  const rl = rateLimit(request, { keyPrefix: "proctoring:note", key: user.id, limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const { id } = await context.params;
  const oid = toObjectId(id);
  if (!oid) return jsonError("Invalid interview id.", 400, { code: "invalid_interview_id" });
  const body = await readJsonObject<{ note: unknown }>(request);
  if (!body || typeof body.note !== "string") return jsonError("A note is required.", 400, { code: "invalid_body" });
  // Plain text only: control characters removed, length capped (rendered as text, never HTML).
  const note = body.note.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  if (!note) return jsonError("A note is required.", 400, { code: "invalid_body" });
  if (note.length > MAX_NOTE) return jsonError(`Keep the note under ${MAX_NOTE} characters.`, 400, { code: "note_too_long" });

  const db = await getDb();
  if (!db) return jsonError(dbUnavailableMessage(), 503, { code: "db_unavailable", retryable: true });
  // Only once the summary exists (i.e. the interview finished); ownership is part of the filter.
  const res = await db.collection("interviews").updateOne(
    { _id: oid, userId: user.id, proctoringSummary: { $exists: true } },
    { $set: { "proctoringSummary.candidateNote": note, "proctoringSummary.candidateNoteAt": new Date() } },
  );
  if (res.matchedCount === 0) return jsonError("No proctoring summary for this interview.", 404, { code: "not_found" });
  return Response.json({ ok: true, note });
}
