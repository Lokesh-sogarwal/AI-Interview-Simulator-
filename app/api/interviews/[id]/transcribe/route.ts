import { getCurrentUser } from "@/lib/auth";
import { groqTranscribe, hasGroqKey, lastGroqFailure } from "@/lib/groq";
import { jsonError, toObjectId } from "@/lib/http";
import { isClosedStatus } from "@/lib/interviewFlow";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/** Vercel caps request bodies at 4.5 MB; a 60 s Opus answer is ~0.3-0.5 MB. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|m4a|aac)\b/;

const FAILURE_TEXT: Record<string, string> = {
  quota: "the speech service's free daily limit has been reached",
  rate_limit: "the speech service is busy",
  timeout: "the speech service took too long",
  auth: "the speech service rejected the server's key",
};

/**
 * Server-side transcription for browsers without speech recognition. The
 * candidate's recorded answer is sent here once per answer, transcribed with
 * Groq Whisper and discarded; only the returned text is saved (through the
 * normal conversation endpoint).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);

  const rl = rateLimit(request, { keyPrefix: "interview:transcribe", key: user.id, limit: 40, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const { id } = await context.params;
  const oid = toObjectId(id);
  if (!oid) return jsonError("Invalid interview id.", 400, { code: "invalid_interview_id" });

  if (!hasGroqKey()) {
    return jsonError("Speech transcription is not configured on this server. Use Chrome, Edge or Safari for live captions.", 503, { code: "stt_not_configured" });
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return jsonError("No audio was received.", 400, { code: "no_audio" });
  if (audio.size > MAX_AUDIO_BYTES) return jsonError("The recording is too large.", 413, { code: "audio_too_large" });
  if (audio.type && !AUDIO_TYPES.test(audio.type)) return jsonError("Unsupported audio format.", 415, { code: "unsupported_audio" });

  const db = await getDb();
  if (!db) return jsonError(dbUnavailableMessage(), 503, { code: "db_unavailable", retryable: true });
  const doc = await db.collection("interviews").findOne({ _id: oid, userId: user.id }, { projection: { status: 1, role: 1, "conversation.questions": 1, "conversation.currentQuestionId": 1 } });
  if (!doc) return jsonError("Interview not found.", 404, { code: "not_found" });
  if (isClosedStatus(doc.status)) return jsonError("This interview has already ended.", 409, { code: "interview_closed" });

  const ext = audio.type.includes("mp4") || audio.type.includes("m4a") ? "m4a" : audio.type.includes("ogg") ? "ogg" : audio.type.includes("wav") ? "wav" : "webm";
  // The question being answered (from the stored interview, not the client) helps with technical terms.
  const conv = doc.conversation as { questions?: Array<{ id: string; text: string }>; currentQuestionId?: string | null } | undefined;
  const question = conv?.questions?.find((q) => q.id === conv.currentQuestionId)?.text ?? "";
  const text = await groqTranscribe(audio, `answer.${ext}`, [doc.role ? `Interview for ${doc.role}.` : "", question].filter(Boolean).join(" "));
  if (text === null) {
    const reason = lastGroqFailure();
    return jsonError(
      `Your answer couldn't be transcribed${reason && FAILURE_TEXT[reason] ? ` because ${FAILURE_TEXT[reason]}` : ""}. Your recording is kept; please retry.`,
      reason === "quota" ? 503 : 502,
      { code: "transcription_failed", reason, retryable: reason !== "auth" && reason !== "quota" },
    );
  }
  return Response.json({ ok: true, text });
}
