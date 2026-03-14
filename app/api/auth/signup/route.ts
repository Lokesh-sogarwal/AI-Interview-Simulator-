import bcrypt from "bcryptjs";

import { getDb } from "@/lib/mongodb";
import { setAuthCookie, signAuthToken } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isValidEmail, isValidPassword } from "@/lib/validators";

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "auth:signup",
    limit: 5,
    windowMs: 30 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

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

  if (name.length > 80) {
    return Response.json(
      { ok: false, error: "Name is too long." },
      { status: 400 },
    );
  }

  if (!isValidEmail(email)) {
    return Response.json({ ok: false, error: "Invalid email." }, { status: 400 });
  }

  if (!isValidPassword(password)) {
    return Response.json(
      { ok: false, error: "Password must be 8-72 characters." },
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
