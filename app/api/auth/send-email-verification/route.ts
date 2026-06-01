import crypto from "crypto";
import { getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rl = rateLimit(request, { keyPrefix: "auth:send-email-verification", limit: 6, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() || "";
  if (!email) return Response.json({ ok: false, error: "Missing email." }, { status: 400 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: "Database not configured." }, { status: 503 });

  const user = await db.collection("users").findOne({ email });
  if (!user) return Response.json({ ok: false, error: "User not found." }, { status: 404 });

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

  await db.collection("users").updateOne({ _id: user._id }, { $set: { emailVerificationToken: token, emailVerificationExpires: expires } });

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/verify-email?token=${token}`;

  if (process.env.EMAIL_PROVIDER) {
    // TODO: integrate with an email provider
  } else {
    // Dev fallback: log the verification link
    // eslint-disable-next-line no-console
    console.log(`Email verification for ${email}: ${verifyUrl}`);
  }

  return Response.json({ ok: true });
}
