export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

type ResumeKind = "pdf" | "text";

/** Identifies supported resume files from their content, not just the name. */
export function detectResumeKind(name: string, type: string, head: Uint8Array): ResumeKind | null {
  const lower = name.toLowerCase();
  const isPdfMagic = head.length >= 5 && String.fromCharCode(...head.slice(0, 5)) === "%PDF-";
  if (isPdfMagic) return "pdf";
  if ((lower.endsWith(".txt") || type === "text/plain") && !head.includes(0)) return "text";
  return null;
}
