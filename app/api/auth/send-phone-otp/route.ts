import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/validators";

// Same response whether or not the account exists, to avoid account enumeration.
const GENERIC_OK = { ok: true, message: "If the account has a phone number, a code has been sent." };

export async function POST(request: Request) {
  const rl = rateLimit(request, { keyPrefix: "auth:send-phone-otp", limit: 6, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email || !isValidEmail(email)) return Response.json({ ok: false, error: "Enter a valid email." }, { status: 400 });

  const perAccount = rateLimit(request, { keyPrefix: "auth:send-phone-otp:acct", key: email, limit: 3, windowMs: 10 * 60 * 1000 });
  if (!perAccount.ok) return rateLimitResponse(perAccount.resetAt);

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  const user = await db.collection("users").findOne({ email });
  if (!user || !user.phone) return Response.json(GENERIC_OK);

  const otp = String(randomInt(100000, 1000000));
  const hash = await bcrypt.hash(otp, 10);
  const expires = new Date(Date.now() + 1000 * 60 * 5); // 5 minutes

  await db.collection("users").updateOne(
    { _id: user._id },
    { $set: { phoneOtpHash: hash, phoneOtpExpires: expires, phoneOtpAttempts: 0 } },
  );

  if (process.env.SMS_PROVIDER) {
    // TODO: implement SMS provider integration.
    console.error("[auth] SMS_PROVIDER is set but no SMS integration is implemented.");
  } else if (process.env.NODE_ENV !== "production") {
    // Development only: never log one-time codes in production.
    console.log(`[dev] Phone OTP for ${email}: ${otp}`);
  }

  return Response.json(GENERIC_OK);
}
