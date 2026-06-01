import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { generateContestProblems } from "@/app/lib/problem-generator";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is admin
  if (!user.isAdmin) {
    return Response.json(
      { ok: false, error: "Only admins can generate contests" },
      { status: 403 }
    );
  }

  const db = await getDb();
  if (!db) {
    return Response.json({ ok: false, error: "Database not available" }, { status: 500 });
  }

  try {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7); // 7 days from now

    // Generate coding problems using Hugging Face
    const { problems, generatedAt } = await generateContestProblems(
      "Today's Coding Challenge",
      3
    );

    const contest = {
      name: `Daily Coding Challenge - ${today.toLocaleDateString()}`,
      description:
        "Test your coding skills with today's challenges. Solve problems in your favorite language!",
      startDate: today,
      endDate: endDate,
      rules:
        "• Complete 3 coding problems\n• Use Python, JavaScript, C++, or Java\n• Score based on correctness and efficiency\n• Submit when all test cases pass",
      maxParticipants: 500,
      createdBy: user.id,
      createdAt: new Date(),
      status: "active",
      participantCount: 0,
      type: "coding",
      frequency: "daily",
      problems: problems,
      problemCount: problems.length,
      generatedAt: generatedAt,
    };

    const result = await db.collection("contests").insertOne(contest);

    return Response.json({
      ok: true,
      message: `Contest created for today!`,
      contestId: result.insertedId,
      contest: {
        ...contest,
        _id: result.insertedId,
      },
    });
  } catch (error: any) {
    console.error("Error generating contest:", error);
    return Response.json(
      { ok: false, error: error.message || "Failed to generate contest" },
      { status: 500 }
    );
  }
}
