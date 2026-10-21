import type { Db, Document, ObjectId } from "mongodb";

export type ContestProblem = {
  title: string;
  description: string;
  difficulty: string;
  constraints: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  topics: string[];
  /** Optional hidden test cases; never sent to the browser. */
  tests?: Array<{ input: string; output: string }>;
};

export function contestPhase(contest: Document, now = Date.now()) {
  const start = contest.startDate ? new Date(contest.startDate as string).getTime() : NaN;
  const end = contest.endDate ? new Date(contest.endDate as string).getTime() : NaN;
  if (Number.isFinite(start) && now < start) return "upcoming" as const;
  if (Number.isFinite(end) && now > end) return "ended" as const;
  return "active" as const;
}

/** Problem as shown to participants: hidden tests (and anything else) stripped. */
export function publicProblem(problem: Partial<ContestProblem>) {
  return {
    title: String(problem.title ?? ""),
    description: String(problem.description ?? ""),
    difficulty: String(problem.difficulty ?? ""),
    constraints: String(problem.constraints ?? ""),
    examples: Array.isArray(problem.examples)
      ? problem.examples.map((e) => ({
          input: String(e?.input ?? ""),
          output: String(e?.output ?? ""),
          ...(e?.explanation ? { explanation: String(e.explanation) } : {}),
        }))
      : [],
    topics: Array.isArray(problem.topics) ? problem.topics.map(String) : [],
  };
}

export function problemSummary(problem: Partial<ContestProblem>) {
  return { title: String(problem.title ?? ""), difficulty: String(problem.difficulty ?? "") };
}

/** Every case a submission is judged on: public examples plus hidden tests. */
export function judgeCases(problem: Partial<ContestProblem>) {
  const examples = Array.isArray(problem.examples) ? problem.examples : [];
  const hidden = Array.isArray(problem.tests) ? problem.tests : [];
  return [...examples, ...hidden]
    .filter((t) => t && typeof t.input === "string" && typeof t.output === "string")
    .slice(0, 20)
    .map((t) => ({ input: t.input, output: t.output }));
}

/** Contest score (0-100) = share of the contest's problems with a passing submission. */
export function scoreFromSolved(solvedCount: number, problemCount: number) {
  if (problemCount <= 0) return 0;
  return Math.round((Math.min(solvedCount, problemCount) / problemCount) * 100);
}

export async function recomputeRegistrationScore(db: Db, contest: Document & { _id: ObjectId }, userId: string) {
  const problemCount = Array.isArray(contest.problems) ? contest.problems.length : 0;
  const solved: unknown[] = await db
    .collection("contest_submissions")
    .distinct("problemIndex", { userId, contestId: contest._id, passed: true });
  const score = scoreFromSolved(solved.length, problemCount);
  const completed = problemCount > 0 && solved.length >= problemCount;
  await db.collection("contest_registrations").updateOne(
    { userId, contestId: contest._id },
    {
      $set: {
        score,
        solvedCount: solved.length,
        status: completed ? "completed" : "in_progress",
        updatedAt: new Date(),
        ...(completed ? { completedAt: new Date() } : {}),
      },
    },
  );
  return { score, solvedCount: solved.length, problemCount, completed };
}

/** Public display name for leaderboards; never exposes email addresses. */
export function displayName(user: Document | null | undefined) {
  const name = typeof user?.name === "string" ? user.name.trim() : "";
  if (name) return name.slice(0, 60);
  const email = typeof user?.email === "string" ? user.email : "";
  const local = email.split("@")[0] ?? "";
  return local ? `${local.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(4, local.length - 2)))}` : "Anonymous";
}
