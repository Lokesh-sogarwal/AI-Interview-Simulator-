import bcrypt from "bcryptjs";

import { getDb } from "@/lib/mongodb";
import { setAuthCookie, signAuthToken } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/validators";

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "auth:login",
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;

  const email = body?.email?.trim().toLowerCase() || "";
  const password = body?.password || "";

  if (!email || !password) {
    return Response.json(
      { ok: false, error: "Missing email or password." },
      { status: 400 },
    );
  }

  if (!isValidEmail(email) || password.length > 72) {
    return Response.json(
      { ok: false, error: "Invalid email or password." },
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

  const userDoc = await db.collection("users").findOne({ email });
  if (!userDoc) {
    return Response.json(
      { ok: false, error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const ok = await bcrypt.compare(password, String(userDoc.passwordHash || ""));
  if (!ok) {
    return Response.json(
      { ok: false, error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const user = {
    id: String(userDoc._id),
    name: String(userDoc.name || ""),
    email: String(userDoc.email || ""),
  };

  const token = await signAuthToken(user);
  await setAuthCookie(token);

  return Response.json({ ok: true, user });
}
