import { clearAuthCookie } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "auth:logout",
    limit: 60,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  await clearAuthCookie();
  return Response.json({ ok: true });
}
