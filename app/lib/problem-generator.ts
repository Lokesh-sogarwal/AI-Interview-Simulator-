import { llmText } from "@/lib/llm";
import { safeJsonParse } from "@/lib/openai";
import { parseExampleInput } from "@/lib/codeRunner";
import type { ContestProblem } from "@/lib/contests";

type GeneratedProblem = ContestProblem;

const DIFFICULTIES = new Set(["Easy", "Medium", "Hard"]);

/** Keeps only well-formed problems whose examples can actually be judged. */
function sanitizeProblems(raw: unknown): GeneratedProblem[] {
  const list = (raw as { problems?: unknown })?.problems;
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => {
      const problem = p as Partial<GeneratedProblem>;
      const examples = Array.isArray(problem.examples)
        ? problem.examples
            .filter((e) => typeof e?.input === "string" && typeof e?.output === "string")
            .map((e) => ({ input: e.input.trim(), output: e.output.trim(), ...(e.explanation ? { explanation: String(e.explanation) } : {}) }))
            .filter((e) => parseExampleInput(e.input))
        : [];
      return {
        title: String(problem.title ?? "").trim().slice(0, 120),
        description: String(problem.description ?? "").trim().slice(0, 4000),
        difficulty: DIFFICULTIES.has(String(problem.difficulty)) ? String(problem.difficulty) : "Medium",
        constraints: String(problem.constraints ?? "").trim().slice(0, 1000),
        examples,
        topics: Array.isArray(problem.topics) ? problem.topics.map(String).slice(0, 6) : [],
      };
    })
    .filter((p) => p.title && p.description && p.examples.length > 0);
}

async function generateProblemsWithAI(count: number): Promise<GeneratedProblem[]> {
  const prompt = `Generate ${count} unique coding interview problems in JSON format:
{
  "problems": [
    {
      "title": "Problem Name",
      "description": "Detailed problem description",
      "difficulty": "Easy|Medium|Hard",
      "constraints": "Input constraints and limits",
      "examples": [
        { "input": "nums = [2,7,11,15], target = 9", "output": "[0,1]", "explanation": "why this output" }
      ],
      "topics": ["Array", "Hash Table"]
    }
  ]
}

Rules:
- Every example input MUST be written as comma-separated \`name = JSON value\` pairs (strings in double quotes).
- Every example output MUST be a JSON value (number, string in double quotes, boolean, or array).
- Give at least two examples per problem.
- Real coding interview questions, clear descriptions, varied difficulty and topics.`;

  const ai = await llmText({
    system: "You write coding interview problems. Return ONLY valid JSON.",
    user: prompt,
    models: {
      huggingface: process.env.HUGGINGFACE_MODEL_QUESTION || process.env.HUGGINGFACE_MODEL,
      openai: process.env.OPENAI_MODEL,
    },
  });
  if (!ai) return [];
  return sanitizeProblems(safeJsonParse(ai.text)).slice(0, count);
}

/** Curated, verified problems used when AI generation is unavailable. */
function getDefaultProblems(count: number): GeneratedProblem[] {
  const defaultProblems: GeneratedProblem[] = [
    {
      title: "Two Sum",
      description:
        "Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target. Each input has exactly one solution and you may not use the same element twice. Return the indices in ascending order.",
      difficulty: "Easy",
      constraints: "2 <= nums.length <= 10^4, -10^9 <= nums[i] <= 10^9, -10^9 <= target <= 10^9",
      examples: [
        { input: "nums = [2,7,11,15], target = 9", output: "[0,1]", explanation: "nums[0] + nums[1] == 9, so we return [0, 1]" },
        { input: "nums = [3,2,4], target = 6", output: "[1,2]" },
      ],
      topics: ["Array", "Hash Table"],
    },
    {
      title: "Longest Substring Without Repeating Characters",
      description: "Given a string s, find the length of the longest substring without repeating characters.",
      difficulty: "Medium",
      constraints: "0 <= s.length <= 5 * 10^4",
      examples: [
        { input: 's = "abcabcbb"', output: "3", explanation: 'The answer is "abc", with the length of 3.' },
        { input: 's = "bbbbb"', output: "1" },
      ],
      topics: ["String", "Sliding Window"],
    },
    {
      title: "Merge K Sorted Lists",
      description:
        "You are given k sorted arrays (each representing a sorted linked list). Merge them into one sorted array and return it.",
      difficulty: "Hard",
      constraints: "k == lists.length, 0 <= k <= 10^4, 0 <= lists[i].length <= 500",
      examples: [
        { input: "lists = [[1,4,5],[1,3,4],[2,6]]", output: "[1,1,2,3,4,4,5,6]", explanation: "All three lists merged into one" },
        { input: "lists = []", output: "[]" },
      ],
      topics: ["Linked List", "Divide and Conquer", "Heap"],
    },
  ];

  return defaultProblems.slice(0, count);
}

export async function generateContestProblems(
  contestName: string,
  problemCount: number = 3,
): Promise<{ problems: GeneratedProblem[]; generatedAt: Date; source: "ai" | "curated" | "mixed" }> {
  const generated = await generateProblemsWithAI(problemCount);
  const problems =
    generated.length < problemCount ? [...generated, ...getDefaultProblems(problemCount - generated.length)] : generated;

  return {
    problems: problems.slice(0, problemCount),
    generatedAt: new Date(),
    source: generated.length === 0 ? "curated" : generated.length < problemCount ? "mixed" : "ai",
  };
}
