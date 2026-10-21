import { authorize, can, roleFromDoc } from "@/lib/roles";

/**
 * User directory for administrators. Admins see only what they need (name,
 * role, join date); superadmins also see email addresses to manage roles.
 */
export async function GET(request: Request) {
  const auth = await authorize("users.list");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const page = Math.min(1000, Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1)));
  const pageSize = 25;
  const showEmail = can(auth.role, "users.viewEmail");

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = q ? { $or: [{ name: { $regex: escaped, $options: "i" } }, ...(showEmail ? [{ email: { $regex: escaped, $options: "i" } }] : [])] } : {};

  const users = auth.db.collection("users");
  const [docs, total] = await Promise.all([
    users
      .find(filter, { projection: { name: 1, email: 1, role: 1, isAdmin: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    users.countDocuments(filter),
  ]);

  return Response.json({
    ok: true,
    viewerRole: auth.role,
    canManageRoles: can(auth.role, "users.manageRoles"),
    users: docs.map((d) => ({
      id: String(d._id),
      name: String(d.name || ""),
      ...(showEmail ? { email: String(d.email || "") } : {}),
      role: roleFromDoc(d),
      createdAt: d.createdAt ?? null,
      isSelf: String(d._id) === auth.user.id,
    })),
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
