import { getDb } from "@/lib/mongodb";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  if (!token) return Response.json({ ok: false, error: "Missing token." }, { status: 400 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: "Database not configured." }, { status: 503 });

  const user = await db.collection("users").findOne({ emailVerificationToken: token });
  if (!user) return Response.json({ ok: false, error: "Invalid token." }, { status: 400 });

  const expires = user.emailVerificationExpires ? new Date(user.emailVerificationExpires) : null;
  if (!expires || expires.getTime() < Date.now()) {
    return Response.json({ ok: false, error: "Token expired." }, { status: 400 });
  }

  await db.collection("users").updateOne({ _id: user._id }, { $set: { emailVerified: true }, $unset: { emailVerificationToken: "", emailVerificationExpires: "" } });

  return Response.json({ ok: true });
}
