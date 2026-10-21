import { describe, expect, it } from "vitest";

import { parseDifficulty, parseInterviewType, resolveEffectiveDifficulty, isClosedStatus } from "@/lib/interviewFlow";
import { normalizeEval, isNonsenseAnswer, type Evaluation } from "@/lib/evaluation";
import { averageOverallScore, turnKey } from "@/lib/interviewRecords";
import { normalizePrivateKey } from "@/lib/firebaseAdmin";
import { detectResumeKind } from "@/lib/resume";
import { computeStreak, evaluateChallenges } from "@/lib/gamification";
import { summarizePerformance, interviewScores } from "@/lib/performance";
import { contestPhase, displayName, judgeCases, publicProblem, scoreFromSolved } from "@/lib/contests";
import { buildMetrics, contestRating, interviewScore100 } from "@/app/lib/ranking-calculator";
import { toObjectId } from "@/lib/http";

describe("interview configuration parsing", () => {
  it.each(["HR", "Technical", "Mixed"] as const)("keeps the %s interview type", (type) => {
    expect(parseInterviewType(type)).toBe(type);
  });

  it("does not silently turn Mixed into HR, and rejects unknown types", () => {
    expect(parseInterviewType("Mixed", "HR")).toBe("Mixed");
    expect(parseInterviewType("Behavioral")).toBe("Mixed");
    expect(parseInterviewType(undefined, "Technical")).toBe("Technical");
  });

  it.each(["Easy", "Medium", "Hard", "Adaptive"] as const)("keeps the %s difficulty", (d) => {
    expect(parseDifficulty(d)).toBe(d);
  });

  it("rejects unknown difficulties", () => {
    expect(parseDifficulty("Extreme")).toBe("Adaptive");
  });

  it("recognises closed statuses", () => {
    expect(isClosedStatus("completed")).toBe(true);
    expect(isClosedStatus("terminated")).toBe(true);
    expect(isClosedStatus("in_progress")).toBe(false);
  });
});

describe("adaptive difficulty", () => {
  const turn = (overall: number) => ({ evaluation: { overall_score: overall } });

  it("returns fixed difficulties unchanged", () => {
    expect(resolveEffectiveDifficulty("Easy", [turn(10), turn(10)])).toBe("Easy");
    expect(resolveEffectiveDifficulty("Hard", [turn(0)])).toBe("Hard");
  });

  it("starts adaptive interviews at Medium", () => {
    expect(resolveEffectiveDifficulty("Adaptive", [])).toBe("Medium");
  });

  it("moves up after strong answers and down after weak ones", () => {
    expect(resolveEffectiveDifficulty("Adaptive", [turn(8)])).toBe("Hard");
    expect(resolveEffectiveDifficulty("Adaptive", [turn(2)])).toBe("Easy");
    expect(resolveEffectiveDifficulty("Adaptive", [turn(2), turn(9)])).toBe("Medium");
    expect(resolveEffectiveDifficulty("Adaptive", [turn(5), turn(5)])).toBe("Medium");
  });

  it("ignores turns without a usable score", () => {
    expect(resolveEffectiveDifficulty("Adaptive", [{ evaluation: null }, turn(9)])).toBe("Hard");
  });
});

describe("evaluation normalisation", () => {
  it("never produces NaN when the model returns non-numeric scores", () => {
    const e = normalizeEval({ technical_score: "n/a", clarity_score: 8, confidence_score: 8, depth_score: 8, overall_score: "high" } as unknown as Evaluation);
    for (const v of [e.technical_score, e.overall_score, e.english_fluency_score, e.project_knowledge_score]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(e.technical_score).toBe(0);
  });

  it("clamps scores into 0-10 and keeps overall aligned with the sub-scores", () => {
    const e = normalizeEval({ technical_score: 14, clarity_score: 2, confidence_score: 2, depth_score: 2, overall_score: 10 } as unknown as Evaluation);
    expect(e.technical_score).toBe(10);
    expect(e.overall_score).toBe(4);
  });

  it("flags gibberish answers", () => {
    expect(isNonsenseAnswer("hugjhkgkhyjvtfj")).toBe(true);
    expect(isNonsenseAnswer("I built a caching layer that reduced p95 latency by 40%.")).toBe(false);
  });
});

describe("interview records", () => {
  it("keys turns by question and answer", () => {
    expect(turnKey("Q", "A")).toBe(turnKey(" Q ", "A "));
    expect(turnKey("Q", "A")).not.toBe(turnKey("Q", "B"));
  });

  it("averages only real scores", () => {
    expect(averageOverallScore([])).toBeNull();
    expect(averageOverallScore([{ evaluation: { overall_score: 6 } }, { evaluation: null }, { evaluation: { overall_score: 7 } }])).toBe(6.5);
  });
});

describe("misc helpers", () => {
  it("unescapes Firebase private keys stored with literal \\n", () => {
    expect(normalizePrivateKey("a\\nb")).toBe("a\nb");
    expect(normalizePrivateKey("a\nb")).toBe("a\nb");
  });

  it("only accepts 24-char hex ObjectIds", () => {
    expect(toObjectId("507f1f77bcf86cd799439011")).not.toBeNull();
    expect(toObjectId("aaaaaaaaaaaa")).toBeNull();
    expect(toObjectId(42)).toBeNull();
  });

  it("detects resume files by content", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 ...");
    expect(detectResumeKind("cv.pdf", "application/pdf", pdf)).toBe("pdf");
    expect(detectResumeKind("renamed.docx", "", pdf)).toBe("pdf");
    expect(detectResumeKind("fake.pdf", "application/pdf", new TextEncoder().encode("PK\u0003\u0004"))).toBeNull();
    expect(detectResumeKind("cv.txt", "text/plain", new TextEncoder().encode("Jane Doe"))).toBe("text");
    expect(detectResumeKind("cv.docx", "application/vnd.openxmlformats", new TextEncoder().encode("PK"))).toBeNull();
  });
});

describe("gamification", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const day = (offset: number) => new Date(now.getTime() - offset * 86_400_000);

  it("counts consecutive days ending today or yesterday", () => {
    expect(computeStreak([day(0), day(1), day(2)], now)).toBe(3);
    expect(computeStreak([day(1), day(2)], now)).toBe(2);
    expect(computeStreak([day(0), day(2)], now)).toBe(1);
    expect(computeStreak([], now)).toBe(0);
  });

  it("only marks challenges eligible when real activity meets them", () => {
    expect(evaluateChallenges([], now).first_interview).toBe(false);
    const res = evaluateChallenges([{ completedAt: day(0), averageScore: 8.2, useResume: true }], now);
    expect(res).toMatchObject({ first_interview: true, improve_score: true, resume_save: true, streak_3: false });
    expect(evaluateChallenges([{ completedAt: day(0), averageScore: 7.9 }], now).improve_score).toBe(false);
  });
});

describe("performance summary", () => {
  it("reads live sessions (averageScore + turns) on a 0-10 scale", () => {
    const s = interviewScores({ averageScore: 6.5, turns: [{ evaluation: { technical_score: 6, clarity_score: 7, confidence_score: 8, depth_score: 5 } }] });
    expect(s).toEqual({ overall: 6.5, dims: { technical: 6, clarity: 7, confidence: 8, depth: 5 } });
  });

  it("converts legacy 0-100 totals", () => {
    expect(interviewScores({ totalScore: 70 })?.overall).toBe(7);
  });

  it("reports nulls instead of zeros when there is no data", () => {
    const s = summarizePerformance([]);
    expect(s.averageScore).toBeNull();
    expect(s.stats.technical).toBeNull();
    expect(s.insights.change).toBeNull();
  });

  it("computes trend oldest-first and the change between first and latest", () => {
    const s = summarizePerformance([
      { _id: "b", averageScore: 8, createdAt: new Date("2026-02-01") },
      { _id: "a", averageScore: 5, createdAt: new Date("2026-01-01") },
    ]);
    expect(s.trend.map((t) => t.score)).toEqual([5, 8]);
    expect(s.insights.change).toBe(3);
  });
});

describe("contests and rankings", () => {
  it("scores by share of solved problems", () => {
    expect(scoreFromSolved(0, 3)).toBe(0);
    expect(scoreFromSolved(2, 3)).toBe(67);
    expect(scoreFromSolved(5, 3)).toBe(100);
    expect(scoreFromSolved(1, 0)).toBe(0);
  });

  it("derives the contest phase from its dates", () => {
    const now = Date.parse("2026-10-21T12:00:00Z");
    expect(contestPhase({ startDate: "2026-10-22", endDate: "2026-10-23" }, now)).toBe("upcoming");
    expect(contestPhase({ startDate: "2026-10-01", endDate: "2026-10-02" }, now)).toBe("ended");
    expect(contestPhase({ startDate: "2026-10-20", endDate: "2026-10-23" }, now)).toBe("active");
  });

  it("strips hidden tests from public problems but judges on them", () => {
    const problem = {
      title: "T",
      description: "D",
      difficulty: "Easy",
      constraints: "",
      topics: [],
      examples: [{ input: "a = 1", output: "1" }],
      tests: [{ input: "a = 2", output: "2" }],
    };
    expect(publicProblem(problem)).not.toHaveProperty("tests");
    expect(judgeCases(problem)).toHaveLength(2);
  });

  it("never exposes email addresses as display names", () => {
    expect(displayName({ name: "Ada" })).toBe("Ada");
    expect(displayName({ email: "jane.doe@example.com" })).not.toContain("@");
    expect(displayName({ email: "jane.doe@example.com" })).not.toContain("jane.doe");
  });

  it("uses real live-interview scores for rankings", () => {
    expect(interviewScore100({ averageScore: 7.5 })).toBe(75);
    expect(interviewScore100({ totalScore: 60 })).toBe(60);
    expect(interviewScore100({})).toBeNull();
    const m = buildMetrics({ scores: [70, 80], count: 2, lastAt: new Date() }, { scores: [100], count: 1, wins: 1 });
    expect(m.interviewScore).toBe(75);
    expect(m.eloRating).toBe(contestRating([100], 1));
    expect(m.eloRating).toBe(1260);
  });
});
