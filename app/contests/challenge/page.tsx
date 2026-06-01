'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CodeEditor } from '@/app/components/CodeEditor';
import { TestCaseChecker } from '@/app/components/TestCaseChecker';

interface Problem {
  title: string;
  description: string;
  difficulty: string;
  constraints: string;
  examples: Array<{
    input: string;
    output: string;
    explanation?: string;
  }>;
  topics: string[];
}

interface TestCase {
  input: string;
  output: string;
  passed?: boolean;
  actual?: string;
}

const LANGUAGE_TEMPLATES: Record<string, string> = {
  python: `def twoSum(nums, target):
    """
    Given an array of integers nums and an integer target,
    return the indices of the two numbers that add up to target.
    
    Args:
        nums: List[int] - array of integers
        target: int - target sum
    
    Returns:
        List[int] - indices of the two numbers
    
    Example:
        Input: nums = [2,7,11,15], target = 9
        Output: [0,1]
        Explanation: nums[0] + nums[1] == 9
    """
    # Write your solution here
    pass`,

  javascript: `/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
var twoSum = function(nums, target) {
    /**
     * Given an array of integers nums and an integer target,
     * return the indices of the two numbers that add up to target.
     * 
     * Example:
     *   Input: nums = [2,7,11,15], target = 9
     *   Output: [0,1]
     *   Explanation: nums[0] + nums[1] == 9
     */
    // Write your solution here
};`,

  cpp: `class Solution {
public:
    /**
     * Given an array of integers nums and an integer target,
     * return the indices of the two numbers that add up to target.
     * 
     * Example:
     *   Input: nums = [2,7,11,15], target = 9
     *   Output: [0,1]
     *   Explanation: nums[0] + nums[1] == 9
     */
    vector<int> twoSum(vector<int>& nums, int target) {
        // Write your solution here
        return {};
    }
};`,

  java: `class Solution {
    /**
     * Given an array of integers nums and an integer target,
     * return the indices of the two numbers that add up to target.
     * 
     * Example:
     *   Input: nums = [2,7,11,15], target = 9
     *   Output: [0,1]
     *   Explanation: nums[0] + nums[1] == 9
     */
    public int[] twoSum(int[] nums, int target) {
        // Write your solution here
        return new int[]{};
    }
}`,
};

export default function ContestChallenge() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contestId = searchParams.get('contestId');
  const problemIndex = parseInt(searchParams.get('problemIndex') || '0', 10);

  const [problem, setProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState(LANGUAGE_TEMPLATES['python']);
  const [language, setLanguage] = useState('python');
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch contest details and problem
  useEffect(() => {
    if (!contestId) {
      router.push('/contests');
      return;
    }

    const fetchProblem = async () => {
      try {
        const res = await fetch(`/api/contests/${contestId}/problems?index=${problemIndex}`);
        const data = await res.json();

        if (data.ok && data.problem) {
          setProblem(data.problem);
          // Initialize test cases from examples
          setTestCases(
            data.problem.examples.map((ex: { input: string; output: string }) => ({
              input: ex.input,
              output: ex.output,
            }))
          );
        } else {
          setError(data.error || 'Failed to load problem');
        }
      } catch (err) {
        console.error('Error loading problem:', err);
        setError('Failed to load problem');
      } finally {
        setLoading(false);
      }
    };

    fetchProblem();
  }, [contestId, problemIndex, router]);

  const handleRunCode = async () => {
    if (!code.trim()) {
      setError('Please write some code first');
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const results = await Promise.all(
        testCases.map(async (tc) => {
          const res = await fetch('/api/code-execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              language,
              input: tc.input,
              timeout: 5000,
            }),
          });

          const data = await res.json();

          if (data.ok) {
            const actual = data.output || '';
            const expected = tc.output.trim();
            const passed = actual === expected;

            return {
              ...tc,
              actual,
              passed,
            };
          } else {
            return {
              ...tc,
              actual: `Error: ${data.error}`,
              passed: false,
            };
          }
        })
      );

      setTestCases(results);
    } catch (err) {
      console.error('Error running code:', err);
      setError('Failed to execute code');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!code.trim()) {
      setError('Please write some code first');
      return;
    }

    const allPassed = testCases.length > 0 && testCases.every(tc => tc.passed === true);
    if (!allPassed) {
      setError('Please pass all test cases before submitting');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/contests/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contestId,
          problemIndex,
          code,
          language,
          passed: true,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setError('✓ Solution submitted successfully!');
        // Optionally redirect or show next problem
        setTimeout(() => {
          router.back();
        }, 2000);
      } else {
        setError(data.error || 'Failed to submit solution');
      }
    } catch (err) {
      console.error('Error submitting solution:', err);
      setError('Failed to submit solution');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-7xl">
          <p className="text-center text-foreground/70">Loading problem...</p>
        </div>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="text-foreground/70">{error || 'Problem not found'}</p>
            <button
              onClick={() => router.push(`/contests/${contestId}`)}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90"
            >
              Back to Contest
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Header */}
      <header className="border-b border-foreground/10 bg-foreground/[0.02]">
        <div className="max-w-full flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-foreground/70 hover:text-foreground transition-colors"
              title="Back"
            >
              ←
            </button>
            <div>
              <h1 className="text-xl font-semibold">{problem.title}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  problem.difficulty === 'Easy' ? 'bg-green-500/20 text-green-600' :
                  problem.difficulty === 'Medium' ? 'bg-yellow-500/20 text-yellow-600' :
                  'bg-red-500/20 text-red-600'
                }`}>
                  {problem.difficulty}
                </span>
                <span className="text-xs text-foreground/60">
                  {problem.topics.join(', ')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Problem Description (Scrollable) */}
        <div className="w-full lg:w-1/2 border-r border-foreground/10 overflow-y-auto bg-foreground/[0.01]">
          <div className="p-6 space-y-6">
            {/* Description */}
            <section>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <span className="text-lg">📝</span>
                Description
              </h2>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {problem.description}
              </p>
            </section>

            {/* Constraints */}
            <section>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                Constraints
              </h2>
              <ul className="text-sm text-foreground/70 space-y-1 font-mono whitespace-pre-wrap">
                {problem.constraints}
              </ul>
            </section>

            {/* Examples */}
            <section>
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <span className="text-lg">📋</span>
                Examples
              </h2>
              <div className="space-y-4">
                {problem.examples.map((example, idx) => (
                  <div key={idx} className="bg-foreground/[0.03] rounded-lg p-4 border border-foreground/5">
                    <div className="text-xs font-medium text-foreground/60 mb-2">
                      Example {idx + 1}
                    </div>
                    
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="text-foreground/70 font-medium block mb-1">Input:</span>
                        <pre className="bg-background rounded px-3 py-2 border border-foreground/10 text-xs font-mono text-foreground/80 overflow-x-auto">
                          {example.input}
                        </pre>
                      </div>
                      
                      <div>
                        <span className="text-foreground/70 font-medium block mb-1">Output:</span>
                        <pre className="bg-background rounded px-3 py-2 border border-foreground/10 text-xs font-mono text-foreground/80 overflow-x-auto">
                          {example.output}
                        </pre>
                      </div>
                      
                      {example.explanation && (
                        <div>
                          <span className="text-foreground/70 font-medium block mb-1">Explanation:</span>
                          <p className="text-foreground/70 text-xs leading-relaxed">
                            {example.explanation}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Right Panel - Code Editor (Flex column) */}
        <div className="hidden lg:flex w-1/2 flex-col bg-foreground/[0.005]">
          {/* Code Header with Language Selector */}
          <div className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground/70">
                Code
              </label>
              <div className="flex items-center gap-3">
                <select
                  value={language}
                  onChange={(e) => {
                    const newLang = e.target.value;
                    setLanguage(newLang);
                    setCode(LANGUAGE_TEMPLATES[newLang] || '');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-background border border-foreground/15 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="cpp">C++</option>
                  <option value="java">Java</option>
                </select>
              </div>
            </div>
          </div>

          {/* Code Editor */}
          <div className="flex-1 overflow-hidden">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-full p-4 bg-background text-foreground font-mono text-sm resize-none border-0 focus:outline-none"
              placeholder="Write your code here..."
              spellCheck="false"
            />
          </div>

          {/* Control Buttons */}
          <div className="border-t border-foreground/10 bg-foreground/[0.02] px-6 py-4 flex gap-3">
            <button
              onClick={handleRunCode}
              disabled={isRunning}
              className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span>▶</span>
              {isRunning ? 'Running...' : 'Run Code'}
            </button>
            {testCases.length > 0 && testCases.every(tc => tc.passed === true) && (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-green-600 text-white font-medium text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span>✓</span>
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Panel - Test Cases (Mobile & Desktop) */}
      <div className="border-t border-foreground/10 bg-foreground/[0.01]">
        <div className="max-w-full">
          {/* Test Cases Header */}
          <div className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <span className="text-lg">🧪</span>
              Test Results
              {testCases.length > 0 && (
                <span className="ml-auto text-xs text-foreground/60">
                  {testCases.filter(tc => tc.passed).length} / {testCases.length} passed
                </span>
              )}
            </h3>
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-6 py-3 border-b border-foreground/10">
              <div className={`rounded-lg border p-3 text-sm ${
                error.includes('✓') 
                  ? 'border-green-600/30 bg-green-600/5 text-green-600' 
                  : 'border-red-600/30 bg-red-600/5 text-red-600'
              }`}>
                {error}
              </div>
            </div>
          )}

          {/* Test Cases List */}
          <div className="max-h-80 overflow-y-auto">
            {testCases.length === 0 ? (
              <div className="px-6 py-8 text-center text-foreground/50 text-sm">
                Click "Run Code" to test your solution
              </div>
            ) : (
              <div className="divide-y divide-foreground/10">
                {testCases.map((tc, idx) => (
                  <div key={idx} className="px-6 py-4 hover:bg-foreground/[0.03] transition-colors">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">Test Case {idx + 1}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          tc.passed === true
                            ? 'bg-green-500/20 text-green-600'
                            : tc.passed === false
                            ? 'bg-red-500/20 text-red-600'
                            : 'bg-foreground/10 text-foreground/60'
                        }`}>
                          {tc.passed === true ? '✓ Passed' : tc.passed === false ? '✗ Failed' : 'Not Run'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-foreground/60 font-medium mb-1">Input:</div>
                        <pre className="bg-background rounded px-2 py-1 border border-foreground/10 text-foreground/80 font-mono overflow-x-auto max-h-20">
                          {tc.input}
                        </pre>
                      </div>
                      <div>
                        <div className="text-foreground/60 font-medium mb-1">Output:</div>
                        <pre className="bg-background rounded px-2 py-1 border border-foreground/10 text-foreground/80 font-mono overflow-x-auto max-h-20">
                          {tc.output}
                        </pre>
                      </div>
                    </div>

                    {tc.actual !== undefined && (
                      <div className="mt-3">
                        <div className={`text-foreground/60 font-medium mb-1 ${
                          tc.passed === false ? 'text-red-600' : ''
                        }`}>
                          Your Output:
                        </div>
                        <pre className={`rounded px-2 py-1 border font-mono text-xs overflow-x-auto max-h-20 ${
                          tc.passed === true
                            ? 'bg-background border-green-500/30 text-green-600'
                            : 'bg-background border-red-500/30 text-red-600'
                        }`}>
                          {tc.actual || '(empty output)'}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Code Editor & Submit Buttons */}
        <div className="lg:hidden border-t border-foreground/10 bg-foreground/[0.02] px-6 py-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground/70 block mb-2">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => {
                const newLang = e.target.value;
                setLanguage(newLang);
                setCode(LANGUAGE_TEMPLATES[newLang] || '');
              }}
              className="w-full px-3 py-2 rounded-lg bg-background border border-foreground/15 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
            </select>
          </div>
          
          <div className="rounded-lg border border-foreground/10 bg-background overflow-hidden" style={{ maxHeight: '300px' }}>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-full p-3 bg-background text-foreground font-mono text-xs resize-none border-0 focus:outline-none"
              placeholder="Write your code here..."
              spellCheck="false"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRunCode}
              disabled={isRunning}
              className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span>▶</span>
              {isRunning ? 'Running...' : 'Run'}
            </button>
            {testCases.length > 0 && testCases.every(tc => tc.passed === true) && (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-green-600 text-white font-medium text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span>✓</span>
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
