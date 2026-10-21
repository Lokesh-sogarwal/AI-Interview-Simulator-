import { getCurrentUser } from "@/lib/auth";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";
import { loadOwnResume, publicResume } from "@/lib/resumeStore";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });
  const { id } = await context.params;
  const doc = await loadOwnResume(db, user.id, id);
  // Someone else's resume is indistinguishable from a missing one.
  if (!doc) return Response.json({ ok: false, error: "Resume not found." }, { status: 404 });
  return Response.json({ ok: true, resume: publicResume(doc, true) });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });
  const { id } = await context.params;
  const doc = await loadOwnResume(db, user.id, id);
  if (!doc) return Response.json({ ok: false, error: "Resume not found." }, { status: 404 });
  await db.collection("resumes").deleteOne({ _id: doc._id, userId: user.id });
  return Response.json({ ok: true });
}
