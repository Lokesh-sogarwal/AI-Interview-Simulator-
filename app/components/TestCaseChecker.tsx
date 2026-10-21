import { CircleCheck, CircleX } from "lucide-react";

import { Badge, Progress, cn } from "@/app/components/ui";

export interface TestCase {
  input: string;
  output: string;
  passed?: boolean;
  actual?: string;
  error?: string;
}

/** Results for the public example cases. Pass/fail is shown with icon and text, not colour alone. */
export function TestCaseChecker({ testCases, isRunning }: { testCases: TestCase[]; isRunning: boolean }) {
  const ran = testCases.filter((t) => t.passed !== undefined);
  const passed = testCases.filter((t) => t.passed === true).length;

  return (
    <div className="grid gap-3" aria-busy={isRunning}>
      {ran.length > 0 ? (
        <Progress label={`${passed} of ${testCases.length} examples passed`} value={passed} max={testCases.length} tone={passed === testCases.length ? "success" : "warning"} showValue />
      ) : (
        <p className="text-sm text-muted">{isRunning ? "Running…" : "Run your code to check it against the examples."}</p>
      )}
      <ol className="grid gap-2.5">
        {testCases.map((tc, idx) => (
          <li
            key={idx}
            className={cn(
              "rounded-control border p-3 text-xs",
              tc.passed === undefined ? "border-border bg-surface" : tc.passed ? "border-success/30 bg-success-soft" : "border-error/30 bg-error-soft",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-text">Example {idx + 1}</span>
              {tc.passed === true ? (
                <Badge tone="success" icon={<CircleCheck className="size-3" aria-hidden />}>Passed</Badge>
              ) : tc.passed === false ? (
                <Badge tone="error" icon={<CircleX className="size-3" aria-hidden />}>Failed</Badge>
              ) : null}
            </div>
            <dl className="mt-2 grid gap-1.5 font-mono">
              <div>
                <dt className="font-sans font-medium text-muted">Input</dt>
                <dd className="break-words text-text">{tc.input}</dd>
              </div>
              <div>
                <dt className="font-sans font-medium text-muted">Expected</dt>
                <dd className="break-words text-text">{tc.output}</dd>
              </div>
              {tc.actual !== undefined || tc.error ? (
                <div>
                  <dt className="font-sans font-medium text-muted">Your output</dt>
                  <dd className="whitespace-pre-wrap break-words text-text">{tc.error ? <span className="text-error">{tc.error}</span> : tc.actual || "(empty)"}</dd>
                </div>
              ) : null}
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}
