import crypto from "crypto";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/validators";

// Same response whether or not the account exists, to avoid account enumeration.
const GENERIC_OK = { ok: true, message: "If an account exists for this email, a verification link has been sent." };

export async function POST(request: Request) {
  const rl = rateLimit(request, { keyPrefix: "auth:send-email-verification", limit: 6, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email || !isValidEmail(email)) return Response.json({ ok: false, error: "Enter a valid email." }, { status: 400 });

  const perAccount = rateLimit(request, { keyPrefix: "auth:send-email-verification:acct", key: email, limit: 3, windowMs: 10 * 60 * 1000 });
  if (!perAccount.ok) return rateLimitResponse(perAccount.resetAt);

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  const user = await db.collection("users").findOne({ email });
  if (!user || user.emailVerified) return Response.json(GENERIC_OK);

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

  // Only a hash is stored so a database leak does not expose usable links.
  await db.collection("users").updateOne(
    { _id: user._id },
    { $set: { emailVerificationTokenHash: tokenHash, emailVerificationExpires: expires }, $unset: { emailVerificationToken: "" } },
  );

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/verify-email?token=${token}`;

  if (process.env.EMAIL_PROVIDER) {
    // TODO: integrate with an email provider.
    console.error("[auth] EMAIL_PROVIDER is set but no email integration is implemented.");
  } else if (process.env.NODE_ENV !== "production") {
    // Development only: never log verification links in production.
    console.log(`[dev] Email verification for ${email}: ${verifyUrl}`);
  }

  return Response.json(GENERIC_OK);
}
