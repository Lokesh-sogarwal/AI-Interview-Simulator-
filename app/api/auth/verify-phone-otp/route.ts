import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rl = rateLimit(request, { keyPrefix: "auth:verify-phone-otp", limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = (await request.json().catch(() => null)) as { email?: string; otp?: string } | null;
  const email = body?.email?.trim().toLowerCase() || "";
  const otp = body?.otp?.trim() || "";
  if (!email || !otp) return Response.json({ ok: false, error: "Missing email or otp." }, { status: 400 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: "Database not configured." }, { status: 503 });

  const user = await db.collection("users").findOne({ email });
  if (!user || !user.phoneOtpHash || !user.phoneOtpExpires) return Response.json({ ok: false, error: "No OTP pending." }, { status: 400 });

  const expires = new Date(user.phoneOtpExpires);
  if (expires.getTime() < Date.now()) {
    return Response.json({ ok: false, error: "OTP expired." }, { status: 400 });
  }

  const ok = await bcrypt.compare(otp, String(user.phoneOtpHash));
  if (!ok) return Response.json({ ok: false, error: "Invalid OTP." }, { status: 400 });

  await db.collection("users").updateOne({ _id: user._id }, { $set: { phoneVerified: true }, $unset: { phoneOtpHash: "", phoneOtpExpires: "" } });

  return Response.json({ ok: true });
}
