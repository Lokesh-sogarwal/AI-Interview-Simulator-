import { ObjectId } from "mongodb";

export function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

/**
 * Parses a JSON request body. Returns `null` for a missing, malformed or
 * non-object body so routes can answer 400 instead of throwing a 500.
 */
export async function readJsonObject<T extends object = Record<string, unknown>>(
  request: Request,
): Promise<Partial<T> | null> {
  const parsed = await request.json().catch(() => null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Partial<T>;
}

export function toObjectId(id: unknown): ObjectId | null {
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  // ObjectId.isValid accepts any 12-byte string; require the 24-char hex form.
  if (!/^[a-f\d]{24}$/i.test(trimmed)) return null;
  return new ObjectId(trimmed);
}

export function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}
