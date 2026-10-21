import { ObjectId, type Db, type Document } from "mongodb";

import { getCurrentUser, type AuthUser } from "@/lib/auth";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";

/**
 * Role hierarchy and the single place where permissions are defined.
 *
 * - user:       own data only.
 * - admin:      platform content (contests) and a minimal user directory.
 * - superadmin: everything an admin can do, plus managing admin roles.
 *
 * Roles are always read from the database for every privileged request, so a
 * downgrade takes effect immediately even while an older session token is valid.
 */
export const ROLES = ["user", "admin", "superadmin"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { user: 0, admin: 1, superadmin: 2 };

export const PERMISSIONS = {
  "admin.dashboard": "admin",
  "contests.manage": "admin",
  "contests.preview": "admin",
  "users.list": "admin",
  "users.viewEmail": "superadmin",
  "users.manageRoles": "superadmin",
} as const satisfies Record<string, Role>;
export type Permission = keyof typeof PERMISSIONS;

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

/** Legacy documents only have `isAdmin`; an explicit `role` always wins. */
export function roleFromDoc(doc: Document | null | undefined): Role {
  if (!doc) return "user";
  if (isRole(doc.role)) return doc.role;
  return doc.isAdmin === true ? "admin" : "user";
}

export function hasRole(role: Role, minimum: Role) {
  return RANK[role] >= RANK[minimum];
}

export function can(role: Role, permission: Permission) {
  return hasRole(role, PERMISSIONS[permission]);
}

/** Current role from the database, or null if the account no longer exists. */
export async function getUserRole(db: Db, userId: string): Promise<Role | null> {
  if (!ObjectId.isValid(userId)) return null;
  const doc = await db.collection("users").findOne({ _id: new ObjectId(userId) }, { projection: { role: 1, isAdmin: 1 } });
  return doc ? roleFromDoc(doc) : null;
}

export type Authorized = { user: AuthUser; role: Role; db: Db };

/**
 * Authenticates the caller and checks a permission against their current
 * database role. Returns a Response (401/403/503) when the check fails.
 */
export async function authorize(permission: Permission): Promise<Authorized | Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });
  const role = await getUserRole(db, user.id);
  if (!role) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!can(role, permission)) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  return { user, role, db };
}

export async function writeAudit(db: Db, entry: { actorId: string | null; action: string; targetId?: string; details?: Record<string, unknown> }) {
  await db.collection("audit_logs").insertOne({ ...entry, at: new Date() });
}
