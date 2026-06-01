import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { generateContestProblems } from "@/app/lib/problem-generator";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // Check if user is admin
  if (!user.isAdmin) {
    return Response.json({ ok: false, error: "Only admins can schedule contests" }, { status: 403 });
  }

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: "Database not available" }, { status: 500 });

  try {
    const body = await request.json();
    const { 
      name, 
      description, 
      frequency = "weekly", // "weekly" or "biweekly"
      dayOfWeek = 5, // 0=Sunday, 5=Friday, 6=Saturday
      startTime = "00:00", // "HH:MM" format
      duration = 2, // hours
      maxParticipants = 1000,
      problemCount = 3,
      startDate = new Date(),
      endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
    } = body;

    if (!name) {
      return Response.json({ ok: false, error: "Missing contest name" }, { status: 400 });
    }

    const createdContests = [];
    let currentDate = new Date(startDate);
    const finalDate = new Date(endDate);
    const increment = frequency === "biweekly" ? 14 : 7; // days

    // Generate contests for the specified period
    while (currentDate <= finalDate) {
      // Find next occurrence of desired day
      const daysDifference = (dayOfWeek - currentDate.getDay() + 7) % 7;
      if (daysDifference > 0) {
        currentDate.setDate(currentDate.getDate() + daysDifference);
      }

      if (currentDate > finalDate) break;

      // Set start time
      const [hours, minutes] = startTime.split(":").map(Number);
      currentDate.setHours(hours, minutes, 0, 0);

      const contestStartDate = new Date(currentDate);
      const contestEndDate = new Date(contestStartDate);
      contestEndDate.setHours(contestEndDate.getHours() + duration);

      // Generate problems
      const { problems, generatedAt } = await generateContestProblems(name, problemCount);

      // Create contest
      const result = await db.collection("contests").insertOne({
        name: `${name} - Week ${Math.floor((currentDate.getTime() - new Date(startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1}`,
        description: description || `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} coding contest with ${problemCount} problems`,
        startDate: contestStartDate,
        endDate: contestEndDate,
        rules: `Complete all ${problemCount} coding problems. Score is based on correctness and efficiency.`,
        maxParticipants,
        createdBy: user.id,
        createdAt: new Date(),
        status: contestStartDate > new Date() ? "upcoming" : "ongoing",
        participantCount: 0,
        type: "coding",
        frequency,
        problems,
        problemCount: problems.length,
        generatedAt,
        isRecurring: true,
        recurringId: `${name}-${frequency}`,
      });

      createdContests.push({
        id: result.insertedId,
        startDate: contestStartDate,
        endDate: contestEndDate,
      });

      // Move to next contest
      currentDate.setDate(currentDate.getDate() + increment);
    }

    return Response.json({
      ok: true,
      message: `Created ${createdContests.length} contests`,
      contests: createdContests,
      frequency,
    });
  } catch (error) {
    console.error("Error scheduling contests:", error);
    return Response.json({ ok: false, error: "Failed to schedule contests" }, { status: 500 });
  }
}
