import type { InterviewType } from "@/lib/prompts";

export type Evaluation = {
  technical_score: number;
  clarity_score: number;
  confidence_score: number;
  depth_score: number;
  english_fluency_score: number;
  project_knowledge_score: number;
  overall_score: number;
  strengths: string;
  weaknesses: string;
  improvement: string;
  ideal_answer: string;
  follow_up_question: string;
};

function clamp0to10(value: number) {
  // Models occasionally return strings like "7/10" or omit fields; never let NaN leak out.
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function normalizeEval(e: Evaluation): Evaluation {
  const technical = clamp0to10(Number(e.technical_score ?? 0));
  const clarity = clamp0to10(Number(e.clarity_score ?? 0));
  const confidence = clamp0to10(Number(e.confidence_score ?? 0));
  const depth = clamp0to10(Number(e.depth_score ?? 0));
  const english = clamp0to10(
    Number(
      // If missing, approximate from clarity.
      (e as Partial<Evaluation>).english_fluency_score ?? clarity,
    ),
  );
  const project = clamp0to10(
    Number(
      // If missing, approximate from technical/depth.
      (e as Partial<Evaluation>).project_knowledge_score ?? Math.min(technical, depth),
    ),
  );
  const avg = round1((technical + clarity + confidence + depth) / 4);
  const rawOverall = Number(e.overall_score ?? avg);
  let overall = Number.isFinite(rawOverall) ? clamp0to10(rawOverall) : avg;

  // Keep overall aligned with subscores.
  if (Math.abs(overall - avg) >= 2) overall = avg;

  const strengths = typeof e.strengths === "string" ? e.strengths : "";
  const weaknesses = typeof e.weaknesses === "string" ? e.weaknesses : "";
  const improvement = typeof e.improvement === "string" ? e.improvement : "";
  const ideal_answer = typeof e.ideal_answer === "string" ? e.ideal_answer : "";
  const follow_up_question = typeof e.follow_up_question === "string" ? e.follow_up_question : "";

  return {
    technical_score: technical,
    clarity_score: clarity,
    confidence_score: confidence,
    depth_score: depth,
    english_fluency_score: english,
    project_knowledge_score: project,
    overall_score: overall,
    strengths,
    weaknesses,
    improvement,
    ideal_answer,
    follow_up_question,
  };
}

const STOPWORDS = new Set(
  [
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "as",
    "at",
    "by",
    "from",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "it",
    "this",
    "that",
    "these",
    "those",
    "i",
    "we",
    "you",
    "they",
    "he",
    "she",
    "my",
    "our",
    "your",
    "their",
    "can",
    "could",
    "should",
    "would",
    "do",
    "did",
    "done",
    "have",
    "has",
    "had",
    "will",
    "just",
    "also",
    "very",
  ].map((s) => s.toLowerCase()),
);

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+.#\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .filter((t) => !STOPWORDS.has(t));
}

export function isNonsenseAnswer(answer: string) {
  const trimmed = answer.trim();
  if (!trimmed) return true;

  // Very short "answers" rarely contain meaningful content.
  const rawWords = trimmed.split(/\s+/).filter(Boolean);
  if (trimmed.length < 6) return true;

  // Detect single-token gibberish like "hugjhkgkhyjvtfj".
  if (rawWords.length === 1) {
    const token = rawWords[0];
    const alphaOnly = token.replace(/[^a-zA-Z]/g, "");
    if (alphaOnly.length >= 10) {
      const vowels = (alphaOnly.match(/[aeiou]/gi) || []).length;
      const vowelRatio = vowels / Math.max(1, alphaOnly.length);
      if (vowelRatio < 0.22) return true;
    }
  }

  // If almost no alphabetic content, it isn't a real answer.
  const alphaChars = (trimmed.match(/[a-z]/gi) || []).length;
  const totalChars = trimmed.length;
  if (alphaChars / Math.max(1, totalChars) < 0.25) return true;

  // If it has too few meaningful tokens, treat as non-answer.
  const meaningful = tokenize(trimmed);
  if (meaningful.length < 2 && trimmed.length < 40) return true;

  return false;
}

export function strictNonsenseEvaluation(): Evaluation {
  return {
    technical_score: 0,
    clarity_score: 0,
    confidence_score: 0,
    depth_score: 0,
    english_fluency_score: 0,
    project_knowledge_score: 0,
    overall_score: 0,
    strengths: "No strengths to assess because no meaningful answer was provided.",
    weaknesses:
      "The response does not contain a coherent answer and does not address the question.",
    improvement:
      "Give a real example: describe the feature, the main challenge(s), what you did, and the outcome/impact.",
    ideal_answer:
      "A strong answer names the project, the complex feature, key constraints, specific challenges, how you overcame them, and measurable impact.",
    follow_up_question:
      "Please answer the question directly: what was the feature, what were the challenges, and what did you do to overcome them?",
  };
}

function overlapRatio(question: string, answer: string) {
  const q = tokenize(question);
  const a = tokenize(answer);
  if (q.length === 0 || a.length === 0) return 0;
  const aSet = new Set(a);
  let overlap = 0;
  for (const t of q) if (aSet.has(t)) overlap += 1;
  return overlap / Math.max(1, Math.min(q.length, 12));
}

function isTechStackDump(answer: string) {
  // Heuristic: short-ish answer with many tech keywords and separators.
  const lower = answer.toLowerCase();
  const keywords = [
    "java",
    "python",
    "c++",
    "c#",
    "javascript",
    "typescript",
    "react",
    "next",
    "node",
    "express",
    "flask",
    "django",
    "spring",
    "aws",
    "azure",
    "gcp",
    "mongodb",
    "postgres",
    "mysql",
    "redis",
    "kubernetes",
    "docker",
  ];
  const hits = keywords.reduce((acc, k) => (lower.includes(k) ? acc + 1 : acc), 0);
  const separators = (answer.match(/,|\||\//g) || []).length;
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  return hits >= 6 && separators >= 4 && words <= 80;
}

export function applyRelevanceCap(params: {
  question: string;
  answer: string;
  type: InterviewType;
  evaluation: Evaluation;
}): Evaluation {
  const { question, answer, type } = params;
  const e = params.evaluation;

  const answerTrimmed = answer.trim();
  const qTrimmed = question.trim();
  if (!qTrimmed || !answerTrimmed) return e;

  const overlap = overlapRatio(qTrimmed, answerTrimmed);
  const dump = isTechStackDump(answerTrimmed);
  const admitsUnknown = /\b(i\s+don'?t\s+know|not\s+sure|no\s+idea)\b/i.test(answerTrimmed);

  // If the answer is likely irrelevant, cap scores to avoid "wrong answer but 8/10".
  // Keep this heuristic conservative: apply only to Technical interviews.
  const shouldCap = type === "Technical" && (dump || overlap < 0.08) && !admitsUnknown;
  if (!shouldCap) return e;

  const cap = 4;
  return {
    ...e,
    technical_score: Math.min(e.technical_score, cap),
    depth_score: Math.min(e.depth_score, cap),
    overall_score: Math.min(e.overall_score, cap),
    strengths:
      e.strengths?.trim()
        ? e.strengths
        : "Some relevant intent was present, but the answer did not directly address the question.",
    weaknesses:
      e.weaknesses?.trim()
        ? e.weaknesses
        : "The answer appears misaligned with the question and lacks specific, grounded details.",
    follow_up_question:
      "Can you answer the original question directly and walk through your reasoning step by step?",
  };
}
