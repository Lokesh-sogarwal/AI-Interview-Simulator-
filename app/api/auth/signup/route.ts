import bcrypt from "bcryptjs";

import { getDb, isDuplicateKeyError, dbUnavailableMessage } from "@/lib/mongodb";
import { setAuthCookie, signAuthToken } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isValidEmail, isValidPassword } from "@/lib/validators";

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "auth:signup",
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as
    | { name?: string; email?: string; password?: string; dob?: string; phone?: string }
    | null;

  const name = body?.name?.trim() || "";
  const email = body?.email?.trim().toLowerCase() || "";
  const password = body?.password || "";
  const dob = body?.dob?.trim() || "";
  const phone = body?.phone?.trim() || "";

  if (!name || !email || !password || !dob) {
    return Response.json(
      { ok: false, error: "Missing name, email, password, or date of birth." },
      { status: 400 },
    );
  }

  if (name.length > 80) {
    return Response.json({ ok: false, error: "Name is too long." }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return Response.json({ ok: false, error: "Invalid email." }, { status: 400 });
  }

  if (!isValidPassword(password)) {
    return Response.json(
      { ok: false, error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  // Validate DOB (expecting YYYY-MM-DD)
  const dobDate = new Date(dob);
  if (Number.isNaN(dobDate.getTime())) {
    return Response.json({ ok: false, error: "Invalid date of birth." }, { status: 400 });
  }

  // Compute age
  const now = new Date();
  let age = now.getFullYear() - dobDate.getFullYear();
  const m = now.getMonth() - dobDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dobDate.getDate())) {
    age -= 1;
  }

  if (age <= 15) {
    return Response.json({ ok: false, error: "You must be at least 16 years old to create an account." }, { status: 403 });
  }

  const db = await getDb();
  if (!db) {
    return Response.json(
      {
        ok: false,
        error: dbUnavailableMessage(),
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

  if (dobDate.getTime() > Date.now() || age > 120) {
    return Response.json({ ok: false, error: "Invalid date of birth." }, { status: 400 });
  }
  if (phone && !/^\+?[0-9\s-]{7,20}$/.test(phone)) {
    return Response.json({ ok: false, error: "Invalid phone number." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const nowDate = new Date();
  let result;
  try {
    result = await db.collection("users").insertOne({
      name,
      email,
      passwordHash,
      dob: dobDate.toISOString(),
      age,
      phone: phone || null,
      phoneVerified: false,
      emailVerified: false,
      createdAt: nowDate,
    });
  } catch (err) {
    // Two concurrent signups with the same email: the unique index wins.
    if (isDuplicateKeyError(err)) {
      return Response.json({ ok: false, error: "An account with this email already exists." }, { status: 409 });
    }
    throw err;
  }

  const user = { id: String(result.insertedId), name, email };
  const token = await signAuthToken(user);
  await setAuthCookie(token);

  return Response.json({ ok: true, user });
}
