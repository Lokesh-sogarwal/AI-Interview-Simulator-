import { getCurrentUser } from "@/lib/auth";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { toObjectId } from "@/lib/http";
import { displayName } from "@/lib/contests";

const PAGE_SIZE = 10;

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  try {
    const { id } = await props.params;
    const url = new URL(request.url);
    const page = Math.min(1000, Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1)));
    const skip = (page - 1) * PAGE_SIZE;

    const contestId = toObjectId(id);
    if (!contestId) {
      return Response.json({ ok: false, error: "Invalid contest ID" }, { status: 400 });
    }

    // Rank by score, then by who reached it first.
    const registrations = await db
      .collection("contest_registrations")
      .aggregate([
        { $match: { contestId } },
        { $sort: { score: -1, updatedAt: 1, registeredAt: 1 } },
        { $skip: skip },
        { $limit: PAGE_SIZE },
        {
          $lookup: {
            from: "users",
            let: { uid: { $convert: { input: "$userId", to: "objectId", onError: null, onNull: null } } },
            pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$uid"] } } }, { $project: { name: 1, email: 1 } }],
            as: "user",
          },
        },
      ])
      .toArray();

    const total = await db.collection("contest_registrations").countDocuments({ contestId });

    const leaderboard = registrations.map((reg, index) => ({
      rank: skip + index + 1,
      userId: reg.userId,
      username: displayName(reg.user?.[0]),
      isMe: reg.userId === user.id,
      score: reg.score || 0,
      solvedCount: reg.solvedCount || 0,
      registeredAt: reg.registeredAt,
      status: reg.status,
    }));

    return Response.json({
      ok: true,
      leaderboard,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return Response.json({ ok: false, error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
