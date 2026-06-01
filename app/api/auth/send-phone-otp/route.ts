import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rl = rateLimit(request, { keyPrefix: "auth:send-phone-otp", limit: 6, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() || "";
  if (!email) return Response.json({ ok: false, error: "Missing email." }, { status: 400 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: "Database not configured." }, { status: 503 });

  const user = await db.collection("users").findOne({ email });
  if (!user || !user.phone) return Response.json({ ok: false, error: "User or phone not found." }, { status: 404 });

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hash = await bcrypt.hash(otp, 10);
  const expires = new Date(Date.now() + 1000 * 60 * 5); // 5 minutes

  await db.collection("users").updateOne(
    { _id: user._id },
    { $set: { phoneOtpHash: hash, phoneOtpExpires: expires } },
  );

  // Send via SMS provider if configured; fallback to server log
  if (process.env.SMS_PROVIDER) {
    // Integrate provider here
    // TODO: implement SMS provider integration
  } else {
    // Dev fallback
    // eslint-disable-next-line no-console
    console.log(`Phone OTP for ${user.phone}: ${otp}`);
  }

  return Response.json({ ok: true });
}
