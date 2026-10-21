import { describe, expect, it } from "vitest";

import {
  CONVERSATION_LIMITS,
  answerBlock,
  cleanUtterance,
  computeBudget,
  emptyConversation,
  isUsableUtterance,
  parseConverseOutput,
  publicConversation,
  ungroundedQuotes,
  violatesBudget,
  type ConversationState,
} from "@/lib/conversation";
import { canSubmit, initialLiveState, liveReducer, mergeRecognition, type LiveState } from "@/lib/conversationState";

const json = (o: unknown) => JSON.stringify(o);

describe("utterance handling", () => {
  it("cleans stutters and whitespace without changing meaning", () => {
    expect(cleanUtterance("I  used the the   Next.js  app")).toBe("I used the Next.js app");
  });

  it("rejects empty or symbol-only utterances", () => {
    expect(isUsableUtterance("")).toBe(false);
    expect(isUsableUtterance(" . ")).toBe(false);
    expect(isUsableUtterance("ok")).toBe(true);
  });
});

describe("structured interviewer output", () => {
  it("accepts valid output and derives the next action from the type", () => {
    const out = parseConverseOutput(json({ responseText: "Why MongoDB for sessions?", responseType: "follow_up", nextAction: "next_question", evaluationNotes: "Mentions stack only." }));
    expect(out).toMatchObject({ responseType: "follow_up", nextAction: "await_answer", completionStatus: "in_progress" });
  });

  it("rejects malformed, empty, unknown-type and score-leaking output", () => {
    expect(parseConverseOutput("Sure! Here's my next question")).toBeNull();
    expect(parseConverseOutput(json({ responseText: "", responseType: "follow_up" }))).toBeNull();
    expect(parseConverseOutput(json({ responseText: "Hi", responseType: "lecture" }))).toBeNull();
    expect(parseConverseOutput(json({ responseText: "Nice, I'd score that 7/10. Next?", responseType: "next_question" }))).toBeNull();
    expect(parseConverseOutput(json({ responseText: '{"nested": true}', responseType: "follow_up" }))).toBeNull();
  });

  it("accepts common field-name variants used by free models", () => {
    const out = parseConverseOutput(json({ response: "Why MongoDB for sessions?", responseType: "follow_up" }));
    expect(out?.responseText).toBe("Why MongoDB for sessions?");
    expect(parseConverseOutput(json({ reply: "Thanks, that's all.", type: "closing" }))?.completionStatus).toBe("complete");
  });

  it("extracts JSON wrapped in prose", () => {
    expect(parseConverseOutput(`Here you go: ${json({ responseText: "Thanks. Next one?", responseType: "closing" })}`)?.completionStatus).toBe("complete");
  });

  it("flags quotes the candidate never said", () => {
    const said = ["I stored the sessions against the user ID."];
    expect(ungroundedQuotes('You said "stored the sessions against the user ID" — how?', said)).toEqual([]);
    expect(ungroundedQuotes('You said "I used Redis for caching" — why?', said)).toEqual(["I used Redis for caching"]);
  });
});

function stateWith(followUps: number, mainQuestions: number): ConversationState {
  const s = emptyConversation();
  for (let i = 0; i < mainQuestions; i += 1) s.questions.push({ id: `q${i}`, text: `Q${i}`, askedAt: new Date() });
  s.currentQuestionId = mainQuestions ? `q${mainQuestions - 1}` : null;
  for (let i = 0; i < followUps; i += 1) {
    s.messages.push({ id: `m${i}`, role: "interviewer", text: "f", kind: "follow_up", questionId: s.currentQuestionId!, at: new Date() });
  }
  return s;
}

describe("turn budget", () => {
  it("forces moving on after the follow-up limit", () => {
    const b = computeBudget(stateWith(CONVERSATION_LIMITS.maxFollowUpsPerQuestion, 2), 600);
    expect(b.mustMoveOn).toBe(true);
    expect(violatesBudget({ responseText: "x", responseType: "follow_up", nextAction: "await_answer", completionStatus: "in_progress" }, b, false)).toBe(true);
    expect(violatesBudget({ responseText: "x", responseType: "next_question", nextAction: "next_question", completionStatus: "in_progress" }, b, false)).toBe(false);
  });

  it("forces closing when time is nearly up", () => {
    const b = computeBudget(stateWith(0, 2), 30);
    expect(b.mustClose).toBe(true);
    expect(violatesBudget({ responseText: "x", responseType: "next_question", nextAction: "next_question", completionStatus: "in_progress" }, b, false)).toBe(true);
  });

  it("does not allow a new main question past the limit", () => {
    const b = computeBudget(stateWith(0, CONVERSATION_LIMITS.maxMainQuestions), 600);
    expect(violatesBudget({ responseText: "x", responseType: "next_question", nextAction: "next_question", completionStatus: "in_progress" }, b, false)).toBe(true);
  });

  it("requires the opening to ask a question", () => {
    const b = computeBudget(emptyConversation(), 900);
    expect(violatesBudget({ responseText: "Hi", responseType: "acknowledgment", nextAction: "await_answer", completionStatus: "in_progress" }, b, true)).toBe(true);
  });
});

describe("answer blocks and privacy", () => {
  it("joins the main answer and follow-up answers for evaluation", () => {
    const s = stateWith(0, 1);
    s.messages.push(
      { id: "a", role: "interviewer", text: "Q0", kind: "next_question", questionId: "q0", at: new Date() },
      { id: "b", role: "candidate", text: "Next.js and MongoDB.", kind: "answer", questionId: "q0", at: new Date() },
      { id: "c", role: "interviewer", text: "Why MongoDB?", kind: "follow_up", questionId: "q0", at: new Date() },
      { id: "d", role: "candidate", text: "Flexible schema.", kind: "answer", questionId: "q0", at: new Date() },
    );
    const block = answerBlock(s, "q0");
    expect(block.answer).toContain("Next.js and MongoDB.");
    expect(block.answer).toContain("Flexible schema.");
    expect(block.exchange).toContain("Interviewer: Why MongoDB?");
  });

  it("never exposes private notes or request ids", () => {
    const s = stateWith(0, 1);
    s.notes.push({ questionId: "q0", note: "weak on auth", at: new Date() });
    s.messages.push({ id: "x", role: "candidate", text: "hi", cleanText: "hi", kind: "answer", questionId: "q0", at: new Date(), requestId: "req12345" });
    const pub = publicConversation(s);
    expect(JSON.stringify(pub)).not.toContain("weak on auth");
    expect(JSON.stringify(pub)).not.toContain("req12345");
  });
});

describe("client conversation state machine", () => {
  const turn = { requestId: "r1aaaaaaa", action: "reply" as const, text: "hello there" };
  const awaiting: LiveState = { ...initialLiveState, status: "awaiting_candidate" };

  it("allows exactly one request in flight", () => {
    const s1 = liveReducer(awaiting, { type: "SUBMIT", turn });
    expect(s1.status).toBe("processing");
    expect(canSubmit(s1)).toBe(false);
    const s2 = liveReducer(s1, { type: "SUBMIT", turn: { ...turn, requestId: "r2bbbbbbb" } });
    expect(s2.pending?.requestId).toBe("r1aaaaaaa");
  });

  it("keeps the pending turn on failure and retries with the same request id", () => {
    const failed = liveReducer(liveReducer(awaiting, { type: "SUBMIT", turn }), { type: "REQUEST_FAILED", message: "x", retryable: true });
    expect(failed.status).toBe("error");
    expect(failed.pending?.text).toBe("hello there");
    const retried = liveReducer(failed, { type: "RETRY" });
    expect(retried.status).toBe("processing");
    expect(retried.pending?.requestId).toBe("r1aaaaaaa");
  });

  it("does not retry non-retryable failures", () => {
    const failed = liveReducer(liveReducer(awaiting, { type: "SUBMIT", turn }), { type: "REQUEST_FAILED", message: "too short", retryable: false });
    expect(liveReducer(failed, { type: "RETRY" }).status).toBe("error");
    expect(liveReducer(failed, { type: "DISCARD_PENDING" }).status).toBe("awaiting_candidate");
  });

  it("moves from speaking to listening, supports interruption and pausing", () => {
    const speaking = liveReducer(liveReducer(awaiting, { type: "SUBMIT", turn }), { type: "AI_REPLIED", speak: true, completed: false, voice: true });
    expect(speaking.status).toBe("ai_speaking");
    expect(canSubmit(speaking)).toBe(false);
    expect(liveReducer(speaking, { type: "INTERRUPT", voice: true }).status).toBe("listening");
    expect(liveReducer(speaking, { type: "SPEECH_ENDED", voice: false }).status).toBe("awaiting_candidate");
    const paused = liveReducer(awaiting, { type: "PAUSE" });
    expect(paused.status).toBe("paused");
    expect(canSubmit(paused)).toBe(false);
    expect(liveReducer(paused, { type: "RESUME", voice: false }).status).toBe("awaiting_candidate");
  });

  it("cannot pause while a request is in flight", () => {
    const processing = liveReducer(awaiting, { type: "SUBMIT", turn });
    expect(liveReducer(processing, { type: "PAUSE" }).status).toBe("processing");
  });
});

describe("speech recognition merging", () => {
  it("never treats interim results as final", () => {
    const results = [
      { isFinal: true, 0: { transcript: "I used Next.js" } },
      { isFinal: false, 0: { transcript: "and Mongo" } },
    ];
    expect(mergeRecognition("", results, 0)).toEqual({ finalText: "I used Next.js", interim: "and Mongo" });
  });

  it("only reads new results from resultIndex", () => {
    const results = [{ isFinal: true, 0: { transcript: "old" } }, { isFinal: true, 0: { transcript: "new" } }];
    expect(mergeRecognition("old", results, 1).finalText).toBe("old new");
  });
});
