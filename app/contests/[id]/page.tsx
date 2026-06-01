"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ContestDetail {
  _id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  rules: string;
  isRegistered: boolean;
  participantCount: number;
  problems?: Array<{
    title: string;
    description: string;
    difficulty: string;
    constraints: string;
    examples: Array<{
      input: string;
      output: string;
      explanation?: string;
    }>;
    topics: string[];
  }>;
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  rating: number;
  status: string;
}

export default function ContestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string>("");
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const [contestRes, leaderboardRes] = await Promise.all([
          fetch(`/api/contests/${id}/register`),
          fetch(`/api/contests/${id}/leaderboard?page=${page}`),
        ]);

        if (contestRes.ok) {
          const data = await contestRes.json();
          if (data.ok) setContest(data.contest);
        }

        if (leaderboardRes.ok) {
          const data = await leaderboardRes.json();
          if (data.ok) {
            setLeaderboard(data.leaderboard);
            setTotalPages(data.totalPages);
          }
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, page]);

  if (loading || !contest) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-foreground/70">Loading...</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const startDate = new Date(contest.startDate);
  const endDate = new Date(contest.endDate);
  const isActive = now >= startDate && now <= endDate && contest.isRegistered;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/contests" className="text-sm underline underline-offset-4 hover:opacity-90">
          Back to contests
        </Link>
        {isActive && (
          <Link
            href={`/interview/setup?contest=${id}`}
            className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background hover:opacity-90"
          >
            Take Contest
          </Link>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="rounded-3xl border border-foreground/10 bg-background p-6 md:p-8">
          <h1 className="text-3xl font-semibold">{contest.name}</h1>
          <p className="mt-2 text-foreground/70">{contest.description}</p>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
              <div className="text-xs text-foreground/60">Starts</div>
              <div className="mt-2 text-sm font-medium">{new Date(contest.startDate).toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
              <div className="text-xs text-foreground/60">Ends</div>
              <div className="mt-2 text-sm font-medium">{new Date(contest.endDate).toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
              <div className="text-xs text-foreground/60">Participants</div>
              <div className="mt-2 text-sm font-medium">{contest.participantCount}</div>
            </div>
            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
              <div className="text-xs text-foreground/60">Your Status</div>
              <div className="mt-2 text-sm font-medium">{contest.isRegistered ? "Registered" : "Not Registered"}</div>
            </div>
          </div>

          {contest.rules && (
            <div className="mt-6 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-6">
              <h2 className="font-semibold">Contest Rules</h2>
              <p className="mt-2 text-sm text-foreground/70 whitespace-pre-wrap">{contest.rules}</p>
            </div>
          )}

          {contest.problems && contest.problems.length > 0 && (
            <div className="mt-6 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-6">
              <h2 className="font-semibold mb-4">Problems ({contest.problems.length})</h2>
              <div className="space-y-3">
                {contest.problems.map((problem: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-4 rounded-lg border border-foreground/10 bg-background hover:bg-foreground/[0.02] transition">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{idx + 1}. {problem.title}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-foreground/70">
                        <span className={`px-2 py-1 rounded ${
                          problem.difficulty === 'Easy' ? 'bg-green-600/20 text-green-600' :
                          problem.difficulty === 'Medium' ? 'bg-yellow-600/20 text-yellow-600' :
                          'bg-red-600/20 text-red-600'
                        }`}>
                          {problem.difficulty}
                        </span>
                        {problem.topics && problem.topics.length > 0 && (
                          <span>{problem.topics.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    {isActive && (
                      <Link
                        href={`/contests/challenge?contestId=${id}&problemIndex=${idx}`}
                        className="ml-4 inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        Solve
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-3xl border border-foreground/10 bg-background p-6 md:p-8">
          <h2 className="text-2xl font-semibold">Leaderboard</h2>

          {leaderboard.length === 0 ? (
            <div className="mt-4 text-center text-sm text-foreground/70">No participants yet</div>
          ) : (
            <>
              <div className="mt-4 overflow-hidden rounded-xl border border-foreground/10 bg-background">
                <table className="w-full text-left text-sm">
                  <thead className="bg-foreground/[0.03] text-foreground/80">
                    <tr>
                      <th className="px-4 py-3 font-medium">Rank</th>
                      <th className="px-4 py-3 font-medium">Username</th>
                      <th className="px-4 py-3 font-medium">Score</th>
                      <th className="px-4 py-3 font-medium">Rating</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry) => (
                      <tr key={entry.rank} className="border-t border-foreground/10 hover:bg-foreground/[0.03]">
                        <td className="px-4 py-3 font-medium">#{entry.rank}</td>
                        <td className="px-4 py-3">{entry.username}</td>
                        <td className="px-4 py-3">{entry.score.toFixed(1)}</td>
                        <td className="px-4 py-3 font-semibold text-blue-600">{entry.rating}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-medium ${
                              entry.status === "completed"
                                ? "bg-green-500/20 text-green-600"
                                : "bg-yellow-500/20 text-yellow-600"
                            }`}
                          >
                            {entry.status === "completed" ? "Completed" : "In Progress"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-foreground/70">Page {page} of {totalPages}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page <= 1}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-foreground/10 px-3 text-sm disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page >= totalPages}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-foreground/10 px-3 text-sm disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
