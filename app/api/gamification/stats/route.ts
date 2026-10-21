import { NextResponse } from "next/server";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { computeGamificationStats } from "@/lib/gamification";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const db = await getDb();
    if (!db) return NextResponse.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

    const stats = await computeGamificationStats(db, user.id);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    console.error("[gamification/stats]", err);
    return NextResponse.json({ ok: false, error: "Failed to fetch stats" }, { status: 500 });
  }
}

/**
 * Previously awarded points for any client-chosen action (and always failed on
 * MongoDB driver v6+). Points are now derived from recorded activity, so this
 * simply returns the recomputed stats and accepts no client-supplied values.
 */
export async function POST() {
  return GET();
}
