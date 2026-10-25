/**
 * Successful re-evaluations allowed per interview (failed attempts don't count).
 * Shared by the API (enforcement) and the report page (display); client-safe.
 */
export const MAX_REEVALUATIONS = 1;
export const REEVALUATION_LIMIT_MESSAGE = "Re-evaluation limit reached. This interview cannot be re-evaluated again.";

/** Re-evaluations still available, from the server-side counter on the interview document. */
export function reevaluationsLeft(doc: { reevaluationsUsed?: unknown } | null | undefined) {
  const used = Number(doc?.reevaluationsUsed);
  return Math.max(0, MAX_REEVALUATIONS - (Number.isFinite(used) ? used : 0));
}
