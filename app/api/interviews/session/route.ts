import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validators";

function allowAnonymousInterviews() {
  return process.env.ALLOW_ANON_INTERVIEWS === "true" || process.env.NODE_ENV !== "production";
}

function getAnonId(request: Request) {
  const raw = request.headers.get("x-aisim-anon-id")?.trim() ?? "";
  if (!raw) return null;
  if (raw.length < 8 || raw.length > 128) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(raw)) return null;
  return raw;
}

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "interviews:session",
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const user = await getCurrentUser();
  const anonId = !user && allowAnonymousInterviews() ? getAnonId(request) : null;
  if (!user && !anonId) {
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
        role?: string;
        experience?: string;
        type?: string;
        difficulty?: string;
        company?: string;
        focusAreas?: string;
        interactionMode?: "typing" | "video";
        useResume?: boolean;
      }
    | null;

  const role = clampString(body?.role?.trim() || "Software Engineer", 120);
  const experience = clampString(body?.experience?.trim() || "0-2 years", 40);
  const type = clampString(body?.type?.trim() || "Mixed", 40);
  const difficulty = clampString(body?.difficulty?.trim() || "Adaptive", 24);
  const company = clampString(body?.company?.trim() || "", 80);
  const focusAreas = clampString(body?.focusAreas?.trim() || "", 600);
  const interactionMode = body?.interactionMode === "video" ? "video" : "typing";
  const useResume = body?.useResume !== false;

  const now = new Date();
  const result = await db.collection("interviews").insertOne({
    userId: user?.id ?? null,
    anonId,
    role,
    experience,
    type,
    difficulty,
    company,
    focusAreas,
    interactionMode,
    useResume,
    turns: [],
    status: "in_progress",
    createdAt: now,
    updatedAt: now,
  });

  return Response.json({ ok: true, id: String(result.insertedId) });
}
