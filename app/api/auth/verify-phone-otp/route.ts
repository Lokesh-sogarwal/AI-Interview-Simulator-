import bcrypt from "bcryptjs";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const MAX_OTP_ATTEMPTS = 5;

export async function POST(request: Request) {
  const rl = rateLimit(request, { keyPrefix: "auth:verify-phone-otp", limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as { email?: string; otp?: string } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const otp = String(body?.otp ?? "").trim();
  if (!email || !otp) return Response.json({ ok: false, error: "Missing email or otp." }, { status: 400 });
  if (!/^\d{6}$/.test(otp)) return Response.json({ ok: false, error: "Invalid OTP." }, { status: 400 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  const users = db.collection("users");
  const user = await users.findOne({ email });
  if (!user || !user.phoneOtpHash || !user.phoneOtpExpires) {
    return Response.json({ ok: false, error: "Invalid or expired OTP." }, { status: 400 });
  }

  const expires = new Date(user.phoneOtpExpires);
  if (expires.getTime() < Date.now() || Number(user.phoneOtpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
    await users.updateOne({ _id: user._id }, { $unset: { phoneOtpHash: "", phoneOtpExpires: "", phoneOtpAttempts: "" } });
    return Response.json({ ok: false, error: "Invalid or expired OTP. Request a new code." }, { status: 400 });
  }

  const ok = await bcrypt.compare(otp, String(user.phoneOtpHash));
  if (!ok) {
    // Per-account attempt cap so a 6-digit code cannot be brute-forced from many IPs.
    await users.updateOne({ _id: user._id }, { $inc: { phoneOtpAttempts: 1 } });
    return Response.json({ ok: false, error: "Invalid or expired OTP." }, { status: 400 });
  }

  await users.updateOne(
    { _id: user._id },
    { $set: { phoneVerified: true }, $unset: { phoneOtpHash: "", phoneOtpExpires: "", phoneOtpAttempts: "" } },
  );

  return Response.json({ ok: true });
}
