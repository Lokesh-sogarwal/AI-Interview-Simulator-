"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "../components/PageHeader";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  email: string;
  metrics: {
    interviewScore: number;
    interviewCount: number;
    contestScore: number;
    contestCount: number;
    contestWins: number;
    eloRating: number;
    totalScore: number;
    performance: string;
    consistency: number;
    recentActivity: number;
    overallScore: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UserStats {
  rating: number;
  contestsCompleted: number;
  totalScore: number;
  rank: number;
  username: string;
  email: string;
}

export default function GlobalLeaderboardPage() {
  const [activeTab, setActiveTab] = useState<"global" | "personal">("global");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });
  const [userRank, setUserRank] = useState<number | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = async (page: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/leaderboard/global?page=${page}&limit=50`);
      const data = await res.json();

      if (data.ok) {
        setLeaderboard(data.leaderboard);
        setPagination(data.pagination);
        setUserRank(data.userRank);
        setError(null);
      } else {
        setError(data.error || "Failed to load leaderboard");
      }
    } catch (err) {
      setError("Failed to load leaderboard");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPersonalStats = async () => {
    try {
      const res = await fetch("/api/users/stats");
      const data = await res.json();
      if (data.ok) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };

  useEffect(() => {
    fetchLeaderboard(1);
    fetchPersonalStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <PageHeader 
        title="Leaderboard & Ratings" 
        subtitle="Track your performance and see how you rank"
        showProfile={true}
      />

      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex gap-2 mb-8 border-b border-foreground/10">
          <button
            onClick={() => setActiveTab("personal")}
            className={`px-4 py-3 font-medium text-sm transition-colors ${
              activeTab === "personal"
                ? "text-foreground border-b-2 border-foreground"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Your Ratings
          </button>
          <button
            onClick={() => setActiveTab("global")}
            className={`px-4 py-3 font-medium text-sm transition-colors ${
              activeTab === "global"
                ? "text-foreground border-b-2 border-foreground"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Global Leaderboard
          </button>
        </div>

        {/* Personal Stats Tab */}
        {activeTab === "personal" && (
          <div>
            {!stats ? (
              <p className="text-center text-foreground/70">Failed to load stats</p>
            ) : (
              <>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
                  <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-6">
                    <div className="text-sm text-foreground/70">Your Rating</div>
                    <div className="mt-3 text-3xl font-bold text-blue-600">{stats.rating}</div>
                    <div className="mt-2 text-xs text-foreground/60">
                      {stats.rating >= 1500 ? "Master" : stats.rating >= 1300 ? "Expert" : stats.rating >= 1100 ? "Intermediate" : "Beginner"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-6">
                    <div className="text-sm text-foreground/70">Contests Completed</div>
                    <div className="mt-3 text-3xl font-bold">{stats.contestsCompleted}</div>
                    <div className="mt-2 text-xs text-foreground/60">Total contests</div>
                  </div>

                  <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-6">
                    <div className="text-sm text-foreground/70">Global Rank</div>
                    <div className="mt-3 text-3xl font-bold">#{stats.rank}</div>
                    <div className="mt-2 text-xs text-foreground/60">Among all users</div>
                  </div>

                  <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-6">
                    <div className="text-sm text-foreground/70">Average Score</div>
                    <div className="mt-3 text-3xl font-bold">{(stats.totalScore / Math.max(1, stats.contestsCompleted)).toFixed(1)}</div>
                    <div className="mt-2 text-xs text-foreground/60">Per contest</div>
                  </div>
                </div>

                <div className="rounded-3xl border border-foreground/10 bg-background p-6 md:p-8 mb-8">
                  <h2 className="text-xl font-semibold">Rating Breakdown</h2>

                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span>Base Rating</span>
                        <span className="font-medium">1200</span>
                      </div>
                      <div className="h-2 rounded-full bg-foreground/10">
                        <div className="h-full w-1/2 rounded-full bg-blue-600" />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span>Score Bonus</span>
                        <span className="font-medium">+{Math.max(0, stats.totalScore - 1200)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-foreground/10">
                        <div className="h-full w-1/3 rounded-full bg-green-600" />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span>Ranking Bonus</span>
                        <span className="font-medium">+{Math.max(0, stats.rating - stats.totalScore)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-foreground/10">
                        <div className="h-full w-1/4 rounded-full bg-purple-600" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 text-sm text-foreground/70">
                    <p>
                      <span className="font-medium">How Ratings Work:</span> Your rating is calculated based on your contest scores, ranking, and performance.
                      Win contests and improve your ranking to increase your rating!
                    </p>
                  </div>
                </div>

                <div>
                  <Link
                    href="/contests"
                    className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background hover:opacity-90"
                  >
                    Join a Contest
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {/* Global Leaderboard Tab */}
        {activeTab === "global" && (
          <div>
            <div className="mb-8">
              {userRank && (
                <div className="inline-flex items-center gap-2 rounded-full bg-foreground/10 px-4 py-2">
                  <span className="text-sm font-semibold">Your Rank:</span>
                  <span className="text-lg font-bold">#{userRank}</span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-foreground/10 mb-8">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-foreground/10 bg-foreground/5">
                    <th className="px-4 py-3 text-left text-sm font-semibold">Rank</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">User</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold">Overall Score</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold">Interview</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold">Contest</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold">ELO Rating</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold">Consistency</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold">Performance</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, index) => (
                    <tr
                      key={index}
                      className={`border-b border-foreground/10 ${
                        userRank === entry.rank ? "bg-foreground/5" : ""
                      } hover:bg-foreground/[0.02] transition-colors`}
                    >
                      <td className="px-4 py-3">
                        <span className="text-lg font-bold">
                          {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                            {entry.userName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-medium">{entry.userName}</span>
                            <div className="text-xs text-foreground/50">{entry.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/20 text-sm font-semibold">
                          {entry.metrics.overallScore}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-medium">{entry.metrics.interviewScore}</span>
                        <div className="text-xs text-foreground/60">{entry.metrics.interviewCount} interviews</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-medium">{entry.metrics.contestScore}</span>
                        <div className="text-xs text-foreground/60">{entry.metrics.contestCount} contests</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-medium">⭐ {entry.metrics.eloRating}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <div className="w-12 h-2 bg-foreground/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${Math.min(100, entry.metrics.consistency)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium">{Math.round(entry.metrics.consistency)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-600">
                          {entry.metrics.performance}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2 mb-8">
                <button
                  onClick={() => fetchLeaderboard(Math.max(1, pagination.page - 1))}
                  disabled={pagination.page === 1}
                  className="px-4 py-2 rounded-lg border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  ← Previous
                </button>

                <div className="flex gap-1">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .slice(
                      Math.max(0, pagination.page - 3),
                      Math.min(pagination.totalPages, pagination.page + 2)
                    )
                    .map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => fetchLeaderboard(pageNum)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium ${
                          pageNum === pagination.page
                            ? "bg-foreground text-background"
                            : "border border-foreground/15 hover:bg-foreground/5"
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                </div>

                <button
                  onClick={() => fetchLeaderboard(Math.min(pagination.totalPages, pagination.page + 1))}
                  disabled={pagination.page === pagination.totalPages}
                  className="px-4 py-2 rounded-lg border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Next →
                </button>
              </div>
            )}

            {/* Info Section */}
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">📊 Ranking Factors</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex gap-3">
                  <span className="text-2xl">🎯</span>
                  <div>
                    <div className="font-medium">Interview Performance (25%)</div>
                    <div className="text-sm text-foreground/70">Average score from all completed interviews</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">💻</span>
                  <div>
                    <div className="font-medium">Contest Performance (25%)</div>
                    <div className="text-sm text-foreground/70">Score and ranking in technical contests</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">⭐</span>
                  <div>
                    <div className="font-medium">ELO Rating (30%)</div>
                    <div className="text-sm text-foreground/70">Normalized from 1200 (base) to 2000+</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">📈</span>
                  <div>
                    <div className="font-medium">Consistency (10%)</div>
                    <div className="text-sm text-foreground/70">Score stability across performances</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">🔥</span>
                  <div>
                    <div className="font-medium">Recent Activity (10%)</div>
                    <div className="text-sm text-foreground/70">Days since last interview or contest</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">🏆 Performance Levels</h2>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="flex gap-3">
                  <span className="text-2xl">🥇</span>
                  <div>
                    <div className="font-medium">Master</div>
                    <div className="text-sm text-foreground/70">1500+ ELO Rating</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">🟣</span>
                  <div>
                    <div className="font-medium">Expert</div>
                    <div className="text-sm text-foreground/70">1400-1500 ELO Rating</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">🔵</span>
                  <div>
                    <div className="font-medium">Advanced</div>
                    <div className="text-sm text-foreground/70">1300-1400 ELO Rating</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">🟢</span>
                  <div>
                    <div className="font-medium">Intermediate</div>
                    <div className="text-sm text-foreground/70">1200-1300 ELO Rating</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">⚪</span>
                  <div>
                    <div className="font-medium">Beginner</div>
                    <div className="text-sm text-foreground/70">Below 1200 ELO Rating</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center">
              <Link href="/contests" className="inline-flex items-center gap-2 text-sm text-blue-500 hover:text-blue-600">
                ← Back to Contests
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
