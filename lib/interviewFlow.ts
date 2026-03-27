import type { Difficulty, InterviewType } from "@/lib/prompts";

export type InterviewStage =
  | "Introduction"
  | "Resume & Projects"
  | "Technical Skills Evaluation"
  | "DSA / Problem Solving"
  | "Scenario-Based Questions"
  | "Cross-questioning"
  | "Wrap-up";

export type LanguageHint = "en" | "hi" | "hinglish";

export function stageForQuestionNumber(questionNumber: number): InterviewStage {
  // Designed for a ~10 minute interview at ~60s/question (~10 questions).
  if (questionNumber <= 1) return "Introduction";
  if (questionNumber <= 3) return "Resume & Projects";
  if (questionNumber <= 5) return "Technical Skills Evaluation";
  if (questionNumber <= 7) return "DSA / Problem Solving";
  if (questionNumber <= 8) return "Scenario-Based Questions";
  if (questionNumber <= 9) return "Cross-questioning";
  return "Wrap-up";
}

export function detectLanguageHint(text: string): LanguageHint {
  const t = (text || "").trim();
  if (!t) return "en";

  // Devanagari range.
  if (/[\u0900-\u097F]/.test(t)) return "hi";

  const lower = t.toLowerCase();
  const hindiMarkers = [
    "kya",
    "kaise",
    "kyun",
    "nahi",
    "haan",
    "haanji",
    "matlab",
    "mera",
    "meri",
    "hum",
    "aap",
    "tum",
    "bhai",
    "achha",
    "theek",
  ];
  const markerHits = hindiMarkers.reduce((acc, m) => acc + (lower.includes(m) ? 1 : 0), 0);
  if (markerHits >= 2) return "hinglish";
  return "en";
}

function normalizeForSimilarity(text: string) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(tokens: string[]) {
  const grams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    grams.push(`${tokens[i]}_${tokens[i + 1]}`);
  }
  return grams;
}

export function similarityScore(a: string, b: string): number {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = na.split(" ").filter(Boolean);
  const tb = nb.split(" ").filter(Boolean);
  const ga = new Set(bigrams(ta));
  const gb = new Set(bigrams(tb));
  if (ga.size === 0 || gb.size === 0) return 0;

  let intersection = 0;
  for (const g of ga) if (gb.has(g)) intersection += 1;
  const union = ga.size + gb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function looksLikeRepeat(candidate: string, previous: string[], threshold = 0.82): boolean {
  const c = candidate.trim();
  if (!c) return false;
  for (const p of previous) {
    if (similarityScore(c, p) >= threshold) return true;
  }
  return false;
}

export function compactQuestion(text: string) {
  const t = (text || "")
    .replace(/^\s*(question\s*[:\-])\s*/i, "")
    .replace(/^\s*["'“”‘’]+|["'“”‘’]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 240 ? `${t.slice(0, 237).trim()}…` : t;
}

export function extractTopicKeywords(text: string): string[] {
  const t = (text || "").toLowerCase();
  const tokens = t
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "i",
    "we",
    "you",
    "they",
    "he",
    "she",
    "it",
    "my",
    "our",
    "your",
    "their",
    "this",
    "that",
    "these",
    "those",
    "as",
    "at",
    "from",
    "by",
    "but",
    "so",
    "if",
    "then",
    "because",
    "about",
    "into",
    "over",
    "under",
    "also",
    "just",
    "like",
  ]);

  const keywords: string[] = [];
  for (const token of tokens) {
    if (token.length < 4) continue;
    if (stop.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    if (!keywords.includes(token)) keywords.push(token);
    if (keywords.length >= 10) break;
  }
  return keywords;
}

export function statefulQuestionSystemPrompt(): string {
  return [
    "You are a highly professional interviewer conducting a realistic interview.",
    "Ask ONE question at a time and wait for the candidate response.",
    "Never repeat a question or ask the same intent again.",
    "IMPORTANT: If any instruction conflicts, follow the most recent instruction in the user prompt.",
    "Output must be ONLY the question text (no lists, no prefixes).",
  ].join("\n");
}

export function statefulQuestionUserPrompt(params: {
  type: InterviewType;
  difficulty: Difficulty;
  role: string;
  experience: string;
  company?: string;
  focusAreas?: string;
  stage: InterviewStage;
  questionNumber: number;
  previousQuestions: string[];
  coveredTopics: string[];
  resumeContext?: string;
  lastTurn?: { question: string; answer: string } | null;
  languageHint: LanguageHint;
}): string {
  const languageLine =
    params.languageHint === "hi"
      ? "Candidate language: Hindi. Ask the next question in Hindi."
      : params.languageHint === "hinglish"
        ? "Candidate language: Hinglish. Ask the next question in Hinglish (mostly English with some Hindi words), natural and respectful."
        : "Candidate language: English. Ask the next question in English.";

  const resumeLine = params.resumeContext?.trim()
    ? `Resume context (use for grounded, specific questions): ${params.resumeContext.trim().slice(0, 2500)}`
    : "";

  const lastTurnLine = params.lastTurn?.question?.trim()
    ? [
        `Most recent Q: ${params.lastTurn.question.replace(/\s+/g, " ").trim()}`,
        `Most recent A: ${params.lastTurn.answer.replace(/\s+/g, " ").trim().slice(0, 900)}`,
      ].join("\n")
    : "";

  return [
    "Generate the next interview question.",
    languageLine,
    `Question Number (1-based): ${params.questionNumber}`,
    `Current Stage (strict): ${params.stage}`,
    `Interview Type: ${params.type}`,
    `Difficulty: ${params.difficulty}`,
    `Job Role: ${params.role}`,
    `Experience Level: ${params.experience}`,
    params.company?.trim() ? `Target Company: ${params.company.trim()}` : "",
    params.focusAreas?.trim() ? `Focus Areas: ${params.focusAreas.trim()}` : "",
    params.coveredTopics.length ? `Already covered topics (avoid repeating): ${params.coveredTopics.slice(0, 16).join(", ")}` : "",
    params.previousQuestions.length
      ? `Already asked (avoid repeats): ${params.previousQuestions
          .slice(-10)
          .map((q) => q.replace(/\s+/g, " ").trim())
          .join(" | ")}`
      : "",
    resumeLine,
    lastTurnLine,
    "Requirements:",
    "- Ask ONLY ONE question.",
    "- Do NOT repeat or rephrase an already-asked question.",
    "- Only ask 'Tell me about yourself' if stage is Introduction.",
    "- Be human: brief acknowledgement is OK, but do not add extra sentences beyond the question.",
    "Return only the question text.",
  ]
    .filter(Boolean)
    .join("\n");
}
