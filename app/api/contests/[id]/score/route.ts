import { getCurrentUser } from "@/lib/auth";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { toObjectId } from "@/lib/http";
import { recomputeRegistrationScore } from "@/lib/contests";

/**
 * Recomputes the caller's contest score from their server-judged submissions.
 * Scores sent by the client are ignored: they used to be trusted, which let
 * anyone post an arbitrary score.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  try {
    const { id } = await props.params;
    const contestId = toObjectId(id);
    if (!contestId) {
      return Response.json({ ok: false, error: "Invalid contest ID" }, { status: 400 });
    }

    const [contest, registration] = await Promise.all([
      db.collection("contests").findOne({ _id: contestId }),
      db.collection("contest_registrations").findOne({ userId: user.id, contestId }),
    ]);
    if (!contest) return Response.json({ ok: false, error: "Contest not found" }, { status: 404 });
    if (!registration) return Response.json({ ok: false, error: "Registration not found" }, { status: 404 });

    const result = await recomputeRegistrationScore(db, contest as typeof contest & { _id: typeof contestId }, user.id);
    const rank =
      (await db.collection("contest_registrations").countDocuments({ contestId, score: { $gt: result.score } })) + 1;

    return Response.json({ ok: true, ...result, rank, message: "Score recalculated from your submissions" });
  } catch (error) {
    console.error("Error recording contest score:", error);
    return Response.json({ ok: false, error: "Failed to record score" }, { status: 500 });
  }
}
