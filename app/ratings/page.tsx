"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface UserStats {
  rating: number;
  contestsCompleted: number;
  totalScore: number;
  rank: number;
  username: string;
  email: string;
}

export default function RatingsPage() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/users/stats");
        const data = await res.json();
        if (data.ok) {
          setStats(data.stats);
        }
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-foreground/70">Loading...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-foreground/70">Failed to load stats</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div>
          <h1 className="text-2xl font-semibold">Your Ratings</h1>
          <p className="mt-1 text-sm text-foreground/70">Contest performance and rating</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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

        <div className="mt-8 rounded-3xl border border-foreground/10 bg-background p-6 md:p-8">
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

        <div className="mt-8">
          <Link
            href="/contests"
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background hover:opacity-90"
          >
            Join a Contest
          </Link>
        </div>
      </main>
    </div>
  );
}
