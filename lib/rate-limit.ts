type RateLimitOptions = {
  keyPrefix: string;
  limit: number;
  windowMs: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastPruneAt = 0;

function pruneExpiredBuckets(now: number) {
  // Cheap guard: prune at most once a minute, and only when map is growing.
  if (buckets.size < 5000) return;
  if (now - lastPruneAt < 60_000) return;
  lastPruneAt = now;

  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

function getClientIp(request: Request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

export function rateLimit(request: Request, opts: RateLimitOptions) {
  const now = Date.now();
  pruneExpiredBuckets(now);
  const ip = getClientIp(request);
  const key = `${opts.keyPrefix}:${ip}`;

  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true as const, remaining: opts.limit - 1, resetAt: now + opts.windowMs };
  }

  if (existing.count >= opts.limit) {
    return { ok: false as const, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { ok: true as const, remaining: Math.max(0, opts.limit - existing.count), resetAt: existing.resetAt };
}

export function rateLimitResponse(resetAt: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return Response.json(
    { ok: false, error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}
