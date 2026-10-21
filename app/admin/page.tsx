import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { can, getUserRole } from "@/lib/roles";
import { getDb } from "@/lib/mongodb";
import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  const db = await getDb();
  // Non-admins never receive the admin UI; the APIs re-check on every request too.
  const role = db ? await getUserRole(db, user.id) : null;
  if (!db || !role || !can(role, "admin.dashboard")) redirect("/");

  const [contests, users, interviews] = await Promise.all([
    db.collection("contests").countDocuments(),
    db.collection("users").estimatedDocumentCount(),
    db.collection("interviews").countDocuments({ status: "completed" }),
  ]);

  return <AdminPanel counts={{ contests, users, interviews }} role={role} />;
}
