import { useEffect, useState } from "react";

interface GameStats {
  points: number;
  streak: number;
  level: number;
  badges: string[];
  totalInterviews: number;
  bestScore: number;
}

export default function GamificationStats() {
  const [stats, setStats] = useState<GameStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/gamification/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading || !stats) {
    return <div className="text-sm text-foreground/70">Loading...</div>;
  }

  const badgeEmojis: { [key: string]: string } = {
    "First Interview": "🎖️",
    Century: "💯",
    "Ten Times": "🏆",
    Master: "👑",
  };

  return (
    <div className="space-y-4">
      {/* Points and Level */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-sm text-foreground/70">Points</div>
          <div className="text-2xl font-bold">{stats.points}</div>
        </div>
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-sm text-foreground/70">Level</div>
          <div className="text-2xl font-bold">{stats.level}</div>
        </div>
      </div>

      {/* Streak */}
      <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
        <div className="text-sm text-foreground/70">Streak</div>
        <div className="text-2xl font-bold">
          🔥 {stats.streak} {stats.streak > 0 ? "day" + (stats.streak > 1 ? "s" : "") : ""}
        </div>
      </div>

      {/* Interviews and Best Score */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-sm text-foreground/70">Interviews</div>
          <div className="text-2xl font-bold">{stats.totalInterviews}</div>
        </div>
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-sm text-foreground/70">Best Score</div>
          <div className="text-2xl font-bold">{stats.bestScore}%</div>
        </div>
      </div>

      {/* Badges */}
      {stats.badges.length > 0 && (
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-sm text-foreground/70 mb-2">Badges ({stats.badges.length})</div>
          <div className="flex flex-wrap gap-2">
            {stats.badges.map((badge) => (
              <div
                key={badge}
                className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-3 py-1 text-sm font-medium"
              >
                <span>{badgeEmojis[badge] || "🏅"}</span>
                <span>{badge}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard Link */}
      <a
        href="/leaderboard"
        className="block rounded-lg border border-foreground/15 p-4 text-center font-medium transition-opacity hover:opacity-80"
      >
        View Global Leaderboard →
      </a>
    </div>
  );
}
