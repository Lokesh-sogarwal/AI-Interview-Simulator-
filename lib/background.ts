import { after } from "next/server";

/**
 * Runs work after the response is sent (Next.js `after`). Outside a request
 * scope (scripts, tests) it simply starts the task. Errors are logged, never thrown.
 */
export function runAfterResponse(task: () => Promise<unknown>) {
  const safe = () =>
    task().catch((e) => {
      console.error("[background]", e instanceof Error ? e.message : e);
    });
  try {
    after(safe);
  } catch {
    void safe();
  }
}
