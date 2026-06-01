"use client";

import { useEffect, useState } from "react";

interface PerformanceData {
  overallPerformance: number;
  averageScore: number;
  bestScore: number;
  worstScore: number;
  totalInterviews: number;
  stats: {
    technical: number;
    clarity: number;
    confidence: number;
    depth: number;
  };
  trend: Array<{ 
    totalScore: number; 
    createdAt: string;
    date?: string;
  }>;
  insights?: {
    bestMetric: string;
    worstMetric: string;
    improvementRate: number;
  };
  dynamicMetrics?: {
    overallScore: number;
    interviewScore: number;
    interviewCount: number;
    contestScore: number;
    contestCount: number;
    contestWins: number;
    eloRating: number;
    performance: string;
    consistency: number;
    recentActivity: number;
  };
}

export default function PerformanceDashboard() {
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPerformance();
  }, []);

  const fetchPerformance = async () => {
    try {
      const res = await fetch("/api/performance");
      if (res.ok) {
        const data = await res.json();
        setPerformance(data);
      } else {
        console.error("Performance API error:", res.status);
        // Set default performance on error
        setPerformance({
          overallPerformance: 0,
          averageScore: 0,
          bestScore: 0,
          worstScore: 0,
          totalInterviews: 0,
          stats: {
            technical: 0,
            clarity: 0,
            confidence: 0,
            depth: 0,
          },
          trend: [],
          dynamicMetrics: {
            overallScore: 0,
            interviewScore: 0,
            interviewCount: 0,
            contestScore: 0,
            contestCount: 0,
            contestWins: 0,
            eloRating: 1200,
            performance: "Beginner",
            consistency: 0,
            recentActivity: 999,
          },
        });
      }
    } catch (error) {
      console.error("Failed to fetch performance:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-foreground/70">Loading performance data...</div>
      </div>
    );
  }

  if (!performance) {
    return (
      <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-6 text-center">
        <p className="text-foreground/70">No interview data available yet.</p>
        <p className="text-sm text-foreground/50">Complete an interview to see your performance metrics.</p>
      </div>
    );
  }

  const getPerformanceTierColor = (tier: string) => {
    switch (tier) {
      case "Master":
        return "text-yellow-600 dark:text-yellow-400";
      case "Expert":
        return "text-purple-600 dark:text-purple-400";
      case "Advanced":
        return "text-blue-600 dark:text-blue-400";
      case "Intermediate":
        return "text-green-600 dark:text-green-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getPerformanceBgColor = (score: number) => {
    if (score >= 80) return "bg-green-600/10";
    if (score >= 60) return "bg-yellow-600/10";
    return "bg-red-600/10";
  };

  return (
    <div className="space-y-6">
      {/* Overall Performance Card */}
      <div className={`rounded-lg border border-foreground/10 ${getPerformanceBgColor(performance.overallPerformance)} p-6`}>
        <div className="text-sm text-foreground/70">Overall Performance</div>
        <div className={`text-5xl font-bold ${getPerformanceColor(performance.overallPerformance)}`}>
          {performance.overallPerformance.toFixed(1)}%
        </div>
        <p className="mt-2 text-sm text-foreground/70">
          Based on {performance.totalInterviews} interview{performance.totalInterviews !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Performance Breakdown */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-xs text-foreground/70">Technical Skills</div>
          <div className="mt-2 text-3xl font-bold">{performance.stats.technical.toFixed(1)}</div>
          <div className="mt-1 h-1 bg-foreground/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${Math.min(performance.stats.technical, 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-xs text-foreground/70">Clarity</div>
          <div className="mt-2 text-3xl font-bold">{performance.stats.clarity.toFixed(1)}</div>
          <div className="mt-1 h-1 bg-foreground/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500"
              style={{ width: `${Math.min(performance.stats.clarity, 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-xs text-foreground/70">Confidence</div>
          <div className="mt-2 text-3xl font-bold">{performance.stats.confidence.toFixed(1)}</div>
          <div className="mt-1 h-1 bg-foreground/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500"
              style={{ width: `${Math.min(performance.stats.confidence, 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-xs text-foreground/70">Depth</div>
          <div className="mt-2 text-3xl font-bold">{performance.stats.depth.toFixed(1)}</div>
          <div className="mt-1 h-1 bg-foreground/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500"
              style={{ width: `${Math.min(performance.stats.depth, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Score Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-sm text-foreground/70">Best Score</div>
          <div className="mt-2 text-3xl font-bold text-green-600">{(performance.bestScore ?? 0).toFixed(1)}%</div>
        </div>

        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-sm text-foreground/70">Average Score</div>
          <div className="mt-2 text-3xl font-bold">{(performance.averageScore ?? 0).toFixed(1)}%</div>
        </div>

        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <div className="text-sm text-foreground/70">Worst Score</div>
          <div className="mt-2 text-3xl font-bold text-red-600">{(performance.worstScore ?? 0).toFixed(1)}%</div>
        </div>
      </div>

      {/* Performance Trend Graph */}
      {performance.trend && performance.trend.length > 0 && (
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-6">
          <h3 className="text-lg font-semibold mb-4">Performance Trend (Last 10 Interviews)</h3>
          <div className="flex items-end gap-2 h-48">
            {performance.trend.map((interview, index) => {
              const score = interview.totalScore || 0;
              const height = Math.max(20, (score / 100) * 160);
              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center"
                  title={`Score: ${score.toFixed(1)}%`}
                >
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-blue-500 to-blue-400 transition-all hover:from-blue-600 hover:to-blue-500"
                    style={{ height: `${height}px` }}
                  />
                  <span className="mt-2 text-xs text-foreground/50">
                    {new Date(interview.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 text-sm text-foreground/70">
            Trend: {performance.trend.length} interviews tracked
          </div>
        </div>
      )}

      {/* Dynamic Global Metrics */}
      {performance.dynamicMetrics && (
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-6">
          <h3 className="text-lg font-semibold mb-4">Global Performance Metrics</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {/* Overall Score */}
            <div className="rounded-lg border border-foreground/10 bg-background p-4">
              <div className="text-xs text-foreground/70">Overall Score</div>
              <div className="mt-2 text-3xl font-bold">{performance.dynamicMetrics.overallScore.toFixed(0)}</div>
              <div className="text-xs text-foreground/50 mt-1">/ 100</div>
            </div>

            {/* Performance Tier */}
            <div className="rounded-lg border border-foreground/10 bg-background p-4">
              <div className="text-xs text-foreground/70">Performance Tier</div>
              <div className={`mt-2 text-2xl font-bold ${getPerformanceTierColor(performance.dynamicMetrics.performance)}`}>
                {performance.dynamicMetrics.performance}
              </div>
              <div className="text-xs text-foreground/50 mt-1">ELO {performance.dynamicMetrics.eloRating}</div>
            </div>

            {/* Interview Score */}
            <div className="rounded-lg border border-foreground/10 bg-background p-4">
              <div className="text-xs text-foreground/70">Interview Score</div>
              <div className="mt-2 text-3xl font-bold">{performance.dynamicMetrics.interviewScore.toFixed(0)}</div>
              <div className="text-xs text-foreground/50 mt-1">{performance.dynamicMetrics.interviewCount} interviews</div>
            </div>

            {/* Contest Score */}
            <div className="rounded-lg border border-foreground/10 bg-background p-4">
              <div className="text-xs text-foreground/70">Contest Score</div>
              <div className="mt-2 text-3xl font-bold">{performance.dynamicMetrics.contestScore.toFixed(0)}</div>
              <div className="text-xs text-foreground/50 mt-1">{performance.dynamicMetrics.contestCount} contests</div>
            </div>

            {/* Consistency */}
            <div className="rounded-lg border border-foreground/10 bg-background p-4">
              <div className="text-xs text-foreground/70">Consistency</div>
              <div className="mt-2 text-3xl font-bold">{performance.dynamicMetrics.consistency.toFixed(0)}</div>
              <div className="text-xs text-foreground/50 mt-1">Score Stability</div>
            </div>
          </div>

          {/* Detailed Breakdown */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-foreground/10 bg-background p-4">
              <h4 className="text-sm font-semibold mb-3">Ranking Composition</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Interview Performance (25%)</span>
                  <span className="font-medium">{(performance.dynamicMetrics.interviewScore * 0.25).toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Contest Performance (25%)</span>
                  <span className="font-medium">{(performance.dynamicMetrics.contestScore * 0.25).toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>ELO Rating (30%)</span>
                  <span className="font-medium">{(Math.min(100, Math.max(0, (performance.dynamicMetrics.eloRating - 1200) / 8)) * 0.30).toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Consistency (10%)</span>
                  <span className="font-medium">{(performance.dynamicMetrics.consistency * 0.10).toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Recent Activity (10%)</span>
                  <span className="font-medium">{(Math.max(0, 100 - (performance.dynamicMetrics.recentActivity * 0.27)) * 0.10).toFixed(1)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-foreground/10 bg-background p-4">
              <h4 className="text-sm font-semibold mb-3">Activity Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total Interviews</span>
                  <span className="font-medium">{performance.dynamicMetrics.interviewCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Contests</span>
                  <span className="font-medium">{performance.dynamicMetrics.contestCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Contest Wins (Top 10%)</span>
                  <span className="font-medium">{performance.dynamicMetrics.contestWins}</span>
                </div>
                <div className="flex justify-between">
                  <span>Days Since Last Activity</span>
                  <span className="font-medium">{performance.dynamicMetrics.recentActivity}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Insights */}
      <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-6">
        <h3 className="text-lg font-semibold mb-4">Performance Insights</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">📊</span>
            <span>Total Interviews: <strong>{performance.totalInterviews}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">⭐</span>
            <span>Current Level: <strong>{Math.floor(performance.overallPerformance / 20) || 1}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">📈</span>
            <span>
              Best Metric: <strong>{performance.insights?.bestMetric || "N/A"}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">🎯</span>
            <span>
              Area for Improvement: <strong>{performance.insights?.worstMetric || "N/A"}</strong>
            </span>
          </div>
          {performance.insights && performance.insights.improvementRate !== 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-lg">📊</span>
              <span>
                Improvement Rate: <strong>{performance.insights.improvementRate > 0 ? "+" : ""}{performance.insights.improvementRate}%</strong>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
