import crypto from "crypto";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const rl = rateLimit(request, { keyPrefix: "auth:verify-email", limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  if (!/^[a-f\d]{64}$/i.test(token)) return Response.json({ ok: false, error: "Invalid token." }, { status: 400 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const users = db.collection("users");
  // Legacy plaintext tokens issued before hashing are still honoured until they expire.
  const user = await users.findOne({ $or: [{ emailVerificationTokenHash: tokenHash }, { emailVerificationToken: token }] });
  if (!user) return Response.json({ ok: false, error: "Invalid token." }, { status: 400 });

  const expires = user.emailVerificationExpires ? new Date(user.emailVerificationExpires) : null;
  if (!expires || expires.getTime() < Date.now()) {
    return Response.json({ ok: false, error: "Token expired." }, { status: 400 });
  }

  await users.updateOne(
    { _id: user._id },
    {
      $set: { emailVerified: true },
      $unset: { emailVerificationToken: "", emailVerificationTokenHash: "", emailVerificationExpires: "" },
    },
  );

  return Response.json({ ok: true });
}
