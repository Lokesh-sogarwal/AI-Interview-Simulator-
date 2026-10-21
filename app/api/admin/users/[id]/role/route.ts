import { ObjectId } from "mongodb";

import { readJsonObject, toObjectId } from "@/lib/http";
import { authorize, isRole, roleFromDoc, writeAudit } from "@/lib/roles";

/** Superadmin-only: change another user's role. Every change is audit-logged. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize("users.manageRoles");
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const targetId = toObjectId(id);
  if (!targetId) return Response.json({ ok: false, error: "Invalid user id." }, { status: 400 });

  const body = await readJsonObject<{ role: string }>(request);
  if (!body || !isRole(body.role)) {
    return Response.json({ ok: false, error: "role must be one of user, admin, superadmin." }, { status: 400 });
  }
  const nextRole = body.role;

  if (id === auth.user.id) {
    return Response.json({ ok: false, error: "You cannot change your own role." }, { status: 403 });
  }

  const users = auth.db.collection("users");
  const target = await users.findOne({ _id: targetId }, { projection: { role: 1, isAdmin: 1 } });
  if (!target) return Response.json({ ok: false, error: "User not found." }, { status: 404 });

  const previousRole = roleFromDoc(target);
  if (previousRole === nextRole) return Response.json({ ok: true, role: nextRole, unchanged: true });

  if (previousRole === "superadmin") {
    const superadmins = await users.countDocuments({ role: "superadmin" });
    if (superadmins <= 1) {
      return Response.json({ ok: false, error: "The last superadmin cannot be demoted." }, { status: 409 });
    }
  }

  // Compare-and-set on the previous role so concurrent edits can't clobber each other.
  const now = new Date();
  const result = await users.updateOne(
    { _id: new ObjectId(id), ...(target.role === undefined ? { role: { $exists: false } } : { role: target.role }) },
    { $set: { role: nextRole, isAdmin: nextRole !== "user", roleUpdatedAt: now, roleUpdatedBy: auth.user.id } },
  );
  if (result.matchedCount === 0) {
    return Response.json({ ok: false, error: "The user's role changed meanwhile. Reload and try again." }, { status: 409 });
  }

  await writeAudit(auth.db, {
    actorId: auth.user.id,
    action: "user.role_changed",
    targetId: id,
    details: { from: previousRole, to: nextRole },
  });

  return Response.json({ ok: true, role: nextRole, previousRole });
}
