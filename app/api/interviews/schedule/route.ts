import { getCurrentUser } from "@/lib/auth";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";
import { loadOwnResume } from "@/lib/resumeStore";
import { parseDifficulty, parseInterviewType } from "@/lib/interviewFlow";

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
      { ok: false, error: dbUnavailableMessage() },
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
        resumeId?: string;
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
  const type = parseInterviewType(body?.type, "Mixed");
  const difficulty = parseDifficulty(body?.difficulty, "Adaptive");
  const company = clampString(String(body?.company || "").trim(), 80);
  const focusAreas = clampString(String(body?.focusAreas || "").trim(), 600);
  // Interviews are voice/video only; older records keep their stored "typing" mode for history.
  const interactionMode = "video" as const;
  const useResume = body?.useResume !== false;
  const resumeText = useResume ? clampString(String(body?.resumeText || "").trim(), 12000) : "";

  const ownResume = useResume && body?.resumeId ? await loadOwnResume(db, user.id, body.resumeId) : null;
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
    resumeId: ownResume ? String(ownResume._id) : null,
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
