import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";

export async function GET(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "mediapipe:model",
    limit: 200,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const upstream = await fetch(MODEL_URL, {
    // Best-effort caching on the server.
    cache: "force-cache",
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    return new Response("Model unavailable", { status: 503 });
  }

  const data = await upstream.arrayBuffer();
  return new Response(data, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
