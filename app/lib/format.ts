export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, opts);
}

export function formatDateTime(value: string | Date | null | undefined) {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

export function formatScore(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  in_progress: "In progress",
  scheduled: "Scheduled",
  terminated: "Ended early",
};

export function statusTone(status: string | undefined) {
  if (status === "completed") return "success" as const;
  if (status === "terminated") return "error" as const;
  if (status === "scheduled") return "info" as const;
  return "warning" as const;
}
