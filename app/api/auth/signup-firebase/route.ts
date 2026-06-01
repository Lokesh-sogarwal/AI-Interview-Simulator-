import { getDb } from "@/lib/mongodb";
import { setAuthCookie, signAuthToken } from "@/lib/auth";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { idToken?: string; dob?: string } | null;
  const idToken = body?.idToken || "";
  const dob = body?.dob || "";
  if (!idToken || !dob) return Response.json({ ok: false, error: "Missing idToken or dob." }, { status: 400 });

  const admin = getFirebaseAdmin();
  try {
    const decoded = await admin.auth().verifyIdToken(idToken, true);
    const uid = decoded.uid;
    const email = decoded.email || "";
    const emailVerified = Boolean(decoded.email_verified);
    const phoneNumber = decoded.phone_number || null;

    if (!emailVerified) return Response.json({ ok: false, error: "Email must be verified." }, { status: 403 });

    // Compute age from dob
    const dobDate = new Date(dob);
    if (Number.isNaN(dobDate.getTime())) return Response.json({ ok: false, error: "Invalid dob." }, { status: 400 });
    const now = new Date();
    let age = now.getFullYear() - dobDate.getFullYear();
    const m = now.getMonth() - dobDate.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dobDate.getDate())) age -= 1;
    if (age <= 15) return Response.json({ ok: false, error: "You must be at least 16 years old." }, { status: 403 });

    const db = await getDb();
    if (!db) return Response.json({ ok: false, error: "Database not configured." }, { status: 503 });

    // Create or update local user record
    const existing = await db.collection("users").findOne({ firebaseUid: uid });
    let userId = existing ? String(existing._id) : null;
    if (!existing) {
      const nowDate = new Date();
      const res = await db.collection("users").insertOne({
        name: decoded.name || "",
        email,
        firebaseUid: uid,
        dob: dobDate.toISOString(),
        age,
        phone: phoneNumber,
        phoneVerified: Boolean(phoneNumber),
        emailVerified: true,
        createdAt: nowDate,
      });
      userId = String(res.insertedId);
    } else {
      await db.collection("users").updateOne({ _id: existing._id }, { $set: { emailVerified: true, phone: phoneNumber || existing.phone } });
      userId = String(existing._id);
    }

    const user = { id: userId, name: decoded.name || "", email };
    const token = await signAuthToken(user);
    await setAuthCookie(token);

    return Response.json({ ok: true, user });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Firebase token verify error", err);
    return Response.json({ ok: false, error: "Invalid or expired token." }, { status: 401 });
  }
}
