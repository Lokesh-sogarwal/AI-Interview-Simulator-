import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "interviews:schedule",
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  if (!db) {
    return Response.json(
      { ok: false, error: "Database is not configured." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        scheduledFor?: string;
        role?: string;
        experience?: string;
        type?: string;
        difficulty?: string;
        company?: string;
        focusAreas?: string;
        interactionMode?: "typing" | "video";
        useResume?: boolean;
        resumeText?: string;
      }
    | null;

  const scheduledForRaw = body?.scheduledFor ? String(body.scheduledFor) : "";
  const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw) : null;
  if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
    return Response.json(
      { ok: false, error: "Please choose a valid date and time." },
      { status: 400 },
    );
  }

  const now = Date.now();
  if (scheduledFor.getTime() < now + 5 * 60 * 1000) {
    return Response.json(
      { ok: false, error: "Scheduled time must be at least 5 minutes in the future." },
      { status: 400 },
    );
  }

  const role = clampString(String(body?.role || "Software Engineer").trim() || "Software Engineer", 120);
  const experience = clampString(String(body?.experience || "0-2 years").trim() || "0-2 years", 40);
  const type = clampString(String(body?.type || "Mixed").trim() || "Mixed", 40);
  const difficulty = clampString(String(body?.difficulty || "Adaptive").trim() || "Adaptive", 24);
  const company = clampString(String(body?.company || "").trim(), 80);
  const focusAreas = clampString(String(body?.focusAreas || "").trim(), 600);
  const interactionMode = body?.interactionMode === "video" ? "video" : "typing";
  const useResume = body?.useResume !== false;
  const resumeText = useResume ? clampString(String(body?.resumeText || "").trim(), 12000) : "";

  const reminderDueAt = new Date(Math.max(now, scheduledFor.getTime() - 15 * 60 * 1000));

  const result = await db.collection("interviews").insertOne({
    userId: user.id,
    role,
    experience,
    type,
    difficulty,
    company,
    focusAreas,
    interactionMode,
    useResume,
    resumeText: resumeText || null,
    status: "scheduled",
    scheduledFor,
    reminderDueAt,
    reminderSentAt: null,
    turns: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return Response.json({ ok: true, id: String(result.insertedId) });
}
