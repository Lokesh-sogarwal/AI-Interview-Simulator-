import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

interface GeneratedProblem {
  title: string;
  description: string;
  difficulty: "Easy" | "Medium" | "Hard";
  constraints: string;
  examples: Array<{
    input: string;
    output: string;
    explanation?: string;
  }>;
  topics: string[];
}

async function generateProblemsWithHuggingFace(count: number = 3): Promise<GeneratedProblem[]> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  const model = process.env.HUGGINGFACE_MODEL_QUESTION || "Qwen/Qwen2.5-1.5B-Instruct";

  if (!apiKey) {
    console.error("HUGGINGFACE_API_KEY not set");
    return getDefaultProblems(count);
  }

  try {
    const prompt = `Generate ${count} unique coding interview problems in JSON format. Each problem should have:
{
  "problems": [
    {
      "title": "Problem Name",
      "description": "Detailed problem description",
      "difficulty": "Easy|Medium|Hard",
      "constraints": "Input constraints and limits",
      "examples": [
        {
          "input": "example input",
          "output": "expected output",
          "explanation": "why this output"
        }
      ],
      "topics": ["array", "dynamic-programming", etc]
    }
  ]
}

Focus on:
- Real coding interview questions
- Clear, concise descriptions
- Practical constraints
- Varied difficulty levels
- Multiple topics (arrays, strings, graphs, DP, etc)`;

    const response = await fetch("https://api-inference.huggingface.co/models/" + model, {
      headers: { Authorization: `Bearer ${apiKey}` },
      method: "POST",
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 2000,
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      console.error("Hugging Face API error:", response.statusText);
      return getDefaultProblems(count);
    }

    const result = await response.json();
    
    // Extract the generated text
    const generatedText = Array.isArray(result) && result[0]?.generated_text 
      ? result[0].generated_text 
      : JSON.stringify(result);

    // Try to parse JSON from the response
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.problems && Array.isArray(parsed.problems)) {
        return parsed.problems.slice(0, count);
      }
    }

    return getDefaultProblems(count);
  } catch (error) {
    console.error("Error generating problems:", error);
    return getDefaultProblems(count);
  }
}

function getDefaultProblems(count: number): GeneratedProblem[] {
  const defaultProblems: GeneratedProblem[] = [
    {
      title: "Two Sum",
      description: "Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target.",
      difficulty: "Easy",
      constraints: "2 <= nums.length <= 10^4, -10^9 <= nums[i] <= 10^9, -10^9 <= target <= 10^9",
      examples: [
        {
          input: "nums = [2,7,11,15], target = 9",
          output: "[0,1]",
          explanation: "nums[0] + nums[1] == 9, so we return [0, 1]",
        },
      ],
      topics: ["Array", "Hash Table"],
    },
    {
      title: "Longest Substring Without Repeating Characters",
      description: "Given a string s, find the length of the longest substring without repeating characters.",
      difficulty: "Medium",
      constraints: "0 <= s.length <= 5 * 10^4",
      examples: [
        {
          input: 's = "abcabcbb"',
          output: "3",
          explanation: 'The answer is "abc", with the length of 3.',
        },
      ],
      topics: ["String", "Sliding Window"],
    },
    {
      title: "Merge K Sorted Lists",
      description: "You are given an array of k linked-lists lists, each linked-list is sorted in ascending order. Merge all the linked-lists into one sorted linked-list.",
      difficulty: "Hard",
      constraints: "k == lists.length, 0 <= k <= 10^4, 0 <= lists[i].length <= 500",
      examples: [
        {
          input: "lists = [[1,4,5],[1,3,4],[2,6]]",
          output: "[1,1,2,1,3,4,4,5,6]",
          explanation: "All three lists merged into one",
        },
      ],
      topics: ["Linked List", "Divide and Conquer", "Heap"],
    },
  ];

  return defaultProblems.slice(0, count);
}

export async function generateContestProblems(
  contestName: string,
  problemCount: number = 3,
): Promise<{ problems: GeneratedProblem[]; generatedAt: Date }> {
  // First try with Hugging Face
  let problems = await generateProblemsWithHuggingFace(problemCount);

  // If generation fails or returns too few problems, supplement with defaults
  if (problems.length < problemCount) {
    const defaults = getDefaultProblems(problemCount - problems.length);
    problems = [...problems, ...defaults];
  }

  return {
    problems: problems.slice(0, problemCount),
    generatedAt: new Date(),
  };
}
