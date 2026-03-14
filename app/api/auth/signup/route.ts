import bcrypt from "bcryptjs";

import { getDb } from "@/lib/mongodb";
import { setAuthCookie, signAuthToken } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { name?: string; email?: string; password?: string }
    | null;

  const name = body?.name?.trim() || "";
  const email = body?.email?.trim().toLowerCase() || "";
  const password = body?.password || "";

  if (!name || !email || !password) {
    return Response.json(
      { ok: false, error: "Missing name, email, or password." },
      { status: 400 },
    );
  }

  const db = await getDb();
  if (!db) {
    return Response.json(
      {
        ok: false,
        error:
          "Database is not configured. Set MONGODB_URI to enable signup/login.",
      },
      { status: 503 },
    );
  }

  const existing = await db.collection("users").findOne({ email });
  if (existing) {
    return Response.json(
      { ok: false, error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await db.collection("users").insertOne({
    name,
    email,
    passwordHash,
    createdAt: new Date(),
  });

  const user = { id: String(result.insertedId), name, email };
  const token = await signAuthToken(user);
  await setAuthCookie(token);

  return Response.json({ ok: true, user });
}
