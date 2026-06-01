import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { ObjectId } from "mongodb";
import { calculateUserMetrics } from "@/app/lib/ranking-calculator";

interface InterviewReport {
  totalScore?: number;
  breakdown?: {
    technical?: number;
    clarity?: number;
    confidence?: number;
    depth?: number;
  };
  transcript?: Array<{
    evaluation?: {
      overall_score?: number;
      technical_score?: number;
      clarity_score?: number;
      confidence_score?: number;
      depth_score?: number;
    };
  }>;
  createdAt?: Date;
  role?: string;
  type?: string;
  difficulty?: string;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const db = await getDb();
    if (!db) return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });

    const interviews = db.collection("interviews");
    const userId = user.id; // Use the user.id as-is (string), not ObjectId

    console.log("Performance API - User ID:", userId);

    // Get dynamic metrics from the new leaderboard system
    let dynamicMetrics;
    try {
      dynamicMetrics = await calculateUserMetrics(user.id, db);
    } catch (error) {
      console.error("Error calculating user metrics:", error);
      dynamicMetrics = {
        interviewScore: 0,
        interviewCount: 0,
        contestScore: 0,
        contestCount: 0,
        contestWins: 0,
        eloRating: 1200,
        totalScore: 0,
        performance: "Beginner" as const,
        consistency: 0,
        recentActivity: 999,
        overallScore: 0,
      };
    }

    const userInterviews = (await (interviews.find as any)({ userId })
      .sort({ createdAt: -1 })
      .toArray()) as InterviewReport[];

    console.log("Performance API - Found interviews:", userInterviews.length);

    if (!userInterviews || userInterviews.length === 0) {
      return NextResponse.json({
        ok: true,
        overallPerformance: dynamicMetrics.overallScore,
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
          overallScore: dynamicMetrics.overallScore,
          interviewScore: dynamicMetrics.interviewScore,
          interviewCount: dynamicMetrics.interviewCount,
          contestScore: dynamicMetrics.contestScore,
          contestCount: dynamicMetrics.contestCount,
          contestWins: dynamicMetrics.contestWins,
          eloRating: dynamicMetrics.eloRating,
          performance: dynamicMetrics.performance,
          consistency: dynamicMetrics.consistency,
          recentActivity: dynamicMetrics.recentActivity,
        },
      });
    }

    // Calculate performance metrics from interview reports
    const calculateScores = (interview: InterviewReport) => {
      // Always extract from breakdown if it exists (it's generated with every report)
      if (interview.breakdown) {
        const technical = interview.breakdown.technical ?? 0;
        const clarity = interview.breakdown.clarity ?? 0;
        const confidence = interview.breakdown.confidence ?? 0;
        const depth = interview.breakdown.depth ?? 0;
        const overall = interview.totalScore ?? Math.round((technical + clarity + confidence + depth) / 4);
        
        return { overall, technical, clarity, confidence, depth };
      }

      // Fallback: calculate from transcript evaluations (for old data without breakdown)
      if (interview.transcript && Array.isArray(interview.transcript)) {
        const evaluations = interview.transcript
          .map((t: any) => t.evaluation)
          .filter(Boolean);

        if (evaluations.length > 0) {
          const avg = (scores: number[]) =>
            scores.length > 0
              ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
              : 0;

          const technical = avg(
            evaluations
              .map((e: any) => e.technical_score)
              .filter((s: any) => typeof s === "number")
          );
          const clarity = avg(
            evaluations
              .map((e: any) => e.clarity_score)
              .filter((s: any) => typeof s === "number")
          );
          const confidence = avg(
            evaluations
              .map((e: any) => e.confidence_score)
              .filter((s: any) => typeof s === "number")
          );
          const depth = avg(
            evaluations
              .map((e: any) => e.depth_score)
              .filter((s: any) => typeof s === "number")
          );
          const overall = avg(
            evaluations
              .map((e: any) => e.overall_score)
              .filter((s: any) => typeof s === "number")
          );

          return { overall, technical, clarity, confidence, depth };
        }
      }

      // Last resort: use totalScore for all metrics
      if (interview.totalScore && interview.totalScore > 0) {
        return { 
          overall: interview.totalScore, 
          technical: interview.totalScore, 
          clarity: interview.totalScore, 
          confidence: interview.totalScore, 
          depth: interview.totalScore 
        };
      }

      return { overall: 0, technical: 0, clarity: 0, confidence: 0, depth: 0 };
    };

    // Extract scores from all interviews
    const reportScores = userInterviews.map((interview: any) => calculateScores(interview));

    const scores = reportScores.map((s: any) => s.overall);
    const technicalScores = reportScores.map((s: any) => s.technical);
    const clarityScores = reportScores.map((s) => s.clarity);
    const confidenceScores = reportScores.map((s) => s.confidence);
    const depthScores = reportScores.map((s) => s.depth);

    const average = (arr: number[]) =>
      arr.length > 0
        ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
        : 0;

    const averageScore = average(scores);
    const bestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const worstScore = scores.length > 0 ? Math.min(...scores) : 0;

    // Build trend data with proper score values
    const trend = userInterviews
      .slice(0, 10)
      .reverse()
      .map((interview: any, idx: number) => ({
        totalScore: reportScores[userInterviews.length - 1 - idx]?.overall ?? 0,
        createdAt: interview.createdAt?.toISOString() ?? new Date().toISOString(),
        date: interview.createdAt
          ? new Date(interview.createdAt).toLocaleDateString()
          : "Unknown",
      }));

    // Calculate performance insights
    const metricsArray = [
      { name: "Technical", score: average(technicalScores) },
      { name: "Clarity", score: average(clarityScores) },
      { name: "Confidence", score: average(confidenceScores) },
      { name: "Depth", score: average(depthScores) },
    ];

    const bestMetric = metricsArray.reduce((prev, current) =>
      prev.score > current.score ? prev : current
    );

    const worstMetric = metricsArray.reduce((prev, current) =>
      prev.score < current.score ? prev : current
    );

    return NextResponse.json({
      ok: true,
      overallPerformance: Math.round(
        (averageScore * 0.25 + 
         (dynamicMetrics.contestScore) * 0.25 + 
         (dynamicMetrics.eloRating - 1200) / 8 * 0.30 + 
         dynamicMetrics.consistency * 0.10 + 
         (100 - (dynamicMetrics.recentActivity * 0.27)) * 0.10)
      ),
      averageScore,
      bestScore,
      worstScore,
      totalInterviews: userInterviews.length,
      stats: {
        technical: average(technicalScores),
        clarity: average(clarityScores),
        confidence: average(confidenceScores),
        depth: average(depthScores),
      },
      trend,
      insights: {
        bestMetric: bestMetric.name,
        worstMetric: worstMetric.name,
        improvementRate:
          userInterviews.length > 1
            ? Math.round(
                ((reportScores[0].overall - reportScores[userInterviews.length - 1].overall) /
                  reportScores[userInterviews.length - 1].overall) *
                  100
              )
            : 0,
      },
      dynamicMetrics: {
        overallScore: dynamicMetrics.overallScore,
        interviewScore: dynamicMetrics.interviewScore,
        interviewCount: dynamicMetrics.interviewCount,
        contestScore: dynamicMetrics.contestScore,
        contestCount: dynamicMetrics.contestCount,
        contestWins: dynamicMetrics.contestWins,
        eloRating: dynamicMetrics.eloRating,
        performance: dynamicMetrics.performance,
        consistency: dynamicMetrics.consistency,
        recentActivity: dynamicMetrics.recentActivity,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to fetch performance" },
      { status: 500 }
    );
  }
}
