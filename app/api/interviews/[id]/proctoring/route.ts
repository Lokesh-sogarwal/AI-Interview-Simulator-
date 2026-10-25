import { getCurrentUser, isAdminInDb } from "@/lib/auth";
import { jsonError, toObjectId } from "@/lib/http";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";
import { EVENTS, SESSIONS } from "@/lib/proctoringStore";

/**
 * Authorised deletion of an interview's proctoring records (e.g. a data
 * erasure request). Administrators only, so a candidate can't erase their
 * own integrity record; every deletion is written to the audit log.
 * Interview answers, scores and the report are not touched.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);
  const db = await getDb();
  if (!db) return jsonError(dbUnavailableMessage(), 503, { code: "db_unavailable", retryable: true });
  if (!(await isAdminInDb(db, user.id))) return jsonError("Only administrators can delete proctoring records.", 403, { code: "forbidden" });

  const { id } = await context.params;
  const oid = toObjectId(id);
  if (!oid) return jsonError("Invalid interview id.", 400, { code: "invalid_interview_id" });
  const interview = await db.collection("interviews").findOne({ _id: oid }, { projection: { _id: 1 } });
  if (!interview) return jsonError("Interview not found.", 404, { code: "not_found" });

  const events = await db.collection(EVENTS).deleteMany({ interviewId: oid });
  const sessions = await db.collection(SESSIONS).deleteMany({ interviewId: oid });
  await db.collection("interviews").updateOne({ _id: oid }, { $unset: { proctoringSummary: "" } });
  await db.collection("audit_logs").insertOne({ at: new Date(), action: "proctoring.delete", actorId: user.id, interviewId: id, deletedEvents: events.deletedCount, deletedSessions: sessions.deletedCount });
  return Response.json({ ok: true, deletedEvents: events.deletedCount, deletedSessions: sessions.deletedCount });
}
