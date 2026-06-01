import React from 'react';

interface TestCase {
  input: string;
  output: string;
  passed?: boolean;
  actual?: string;
}

interface TestCaseProps {
  testCases: TestCase[];
  isRunning: boolean;
}

export function TestCaseChecker({ testCases, isRunning }: TestCaseProps) {
  const passedCount = testCases.filter(tc => tc.passed === true).length;
  const failedCount = testCases.filter(tc => tc.passed === false).length;
  const totalCount = testCases.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      {totalCount > 0 && (
        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Test Results</div>
              <div className="text-xs text-foreground/70 mt-1">
                {passedCount}/{totalCount} tests passed
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-lg font-semibold text-green-600">{passedCount}</div>
                <div className="text-xs text-foreground/70">Passed</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-red-600">{failedCount}</div>
                <div className="text-xs text-foreground/70">Failed</div>
              </div>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="mt-4 h-2 rounded-full bg-foreground/10 overflow-hidden">
            <div
              className={`h-full transition-all ${passedCount === totalCount ? 'bg-green-600' : 'bg-orange-600'}`}
              style={{ width: `${(passedCount / totalCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Individual test cases */}
      <div className="flex flex-col gap-3">
        {testCases.map((tc, idx) => (
          <div
            key={idx}
            className={`rounded-lg border p-4 ${
              tc.passed === undefined
                ? 'border-foreground/10 bg-foreground/[0.02]'
                : tc.passed
                  ? 'border-green-600/30 bg-green-600/5'
                  : 'border-red-600/30 bg-red-600/5'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">Test Case {idx + 1}</div>
                  {tc.passed === true && (
                    <span className="text-xs px-2 py-1 rounded bg-green-600/20 text-green-600">✓ Passed</span>
                  )}
                  {tc.passed === false && (
                    <span className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-600">✗ Failed</span>
                  )}
                </div>
                
                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <span className="text-foreground/70 font-medium">Input:</span>
                    <div className="mt-1 p-2 rounded bg-foreground/5 font-mono text-foreground/80 break-words whitespace-pre-wrap">
                      {tc.input}
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-foreground/70 font-medium">Expected Output:</span>
                    <div className="mt-1 p-2 rounded bg-foreground/5 font-mono text-foreground/80 break-words whitespace-pre-wrap">
                      {tc.output}
                    </div>
                  </div>
                  
                  {tc.actual !== undefined && (
                    <div>
                      <span className="text-foreground/70 font-medium">Your Output:</span>
                      <div className="mt-1 p-2 rounded bg-foreground/5 font-mono break-words whitespace-pre-wrap"
                           style={{ color: tc.passed ? '#10b981' : '#ef4444' }}>
                        {tc.actual || '(empty output)'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!isRunning && totalCount === 0 && (
        <div className="text-center py-8 text-foreground/70 text-sm">
          Run your code to see test results
        </div>
      )}
    </div>
  );
}
