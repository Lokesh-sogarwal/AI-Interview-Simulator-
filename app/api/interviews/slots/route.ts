import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

function buildSlots() {
  const slots: string[] = [];
  for (let hour = 9; hour <= 17; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === 17 && minute > 30) continue;
      const hh = String(hour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}

export async function GET(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "interviews:slots",
    limit: 120,
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

  const url = new URL(request.url);
  const date = (url.searchParams.get("date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json(
      { ok: false, error: "Missing or invalid date (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  const baseSlots = buildSlots();

  // Reserve slots that already have scheduled interviews.
  const start = new Date(`${date}T00:00:00.000`);
  const end = new Date(`${date}T23:59:59.999`);

  const docs = await db
    .collection("interviews")
    .find({ userId: user.id, status: "scheduled", scheduledFor: { $gte: start, $lte: end } })
    .project({ scheduledFor: 1 })
    .toArray();

  const reserved = new Set(
    docs
      .map((d: any) => (d?.scheduledFor ? new Date(d.scheduledFor) : null))
      .filter((d): d is Date => Boolean(d) && Number.isFinite((d as Date).getTime()))
      .map((d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`),
  );

  const now = Date.now();
  const minFuture = now + 5 * 60 * 1000;
  const available = baseSlots.filter((t) => {
    if (reserved.has(t)) return false;
    const dt = new Date(`${date}T${t}`);
    return Number.isFinite(dt.getTime()) && dt.getTime() >= minFuture;
  });

  return Response.json({ ok: true, date, slots: available });
}
