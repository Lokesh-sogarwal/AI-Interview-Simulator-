import { describe, expect, it } from "vitest";

import { computeBudget, conversationUserPrompt, emptyConversation, type ConversationState } from "@/lib/conversation";
import { batchEvaluationUserPrompt, evaluationSystemPrompt, evaluationUserPrompt, questionSystemPrompt } from "@/lib/prompts";

const ctx = { type: "Technical" as const, role: "Backend Engineer", experience: "2-5 years", resumeContext: "R".repeat(5000) };

describe("token-lean prompts", () => {
  it("evaluation prompts carry the rubric but not the old app persona", () => {
    const system = evaluationSystemPrompt();
    expect(system).toContain("Rubric (every score 0-10)");
    expect(system).not.toMatch(/SYSTEM ROLE|PROCTORING|VIDEO CALL/);
    expect(system.length).toBeLessThan(1500);
    expect(questionSystemPrompt()).not.toMatch(/SYSTEM ROLE|PROCTORING/);
  });

  it("asks for brief output and no unused follow-up question", () => {
    const user = evaluationUserPrompt({ ...ctx, question: "Q?", answer: "A." });
    expect(evaluationSystemPrompt()).toMatch(/at most 2 short sentences/);
    expect(user).not.toContain("follow_up_question");
    expect(batchEvaluationUserPrompt({ ...ctx, items: [{ id: 1, question: "Q?", answer: "A." }] })).not.toContain("follow_up_question");
  });

  it("caps resume context per answer", () => {
    const user = evaluationUserPrompt({ ...ctx, question: "Q?", answer: "A." });
    expect(user.match(/R{100,}/)![0].length).toBe(1200);
  });

  it("sends the latest reply once and only recent turns to the interviewer", () => {
    const state: ConversationState = {
      ...emptyConversation(),
      questions: [{ id: "q1", text: "Tell me about caching.", askedAt: new Date() }],
      currentQuestionId: "q1",
      messages: [
        ...Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, role: (i % 2 ? "candidate" : "interviewer") as "candidate" | "interviewer", text: `old turn ${i}`, kind: (i % 2 ? "answer" : "follow_up") as "answer" | "follow_up", questionId: "q1", at: new Date() })),
        { id: "last", role: "candidate", text: "UNIQUE-LATEST-REPLY", kind: "answer", questionId: "q1", at: new Date() },
      ],
    };
    const prompt = conversationUserPrompt({ ...ctx, difficulty: "Medium", state, budget: computeBudget(state, 600), utterance: "UNIQUE-LATEST-REPLY" });
    expect(prompt.split("UNIQUE-LATEST-REPLY")).toHaveLength(2);
    expect(prompt).not.toContain("old turn 0");
    expect(prompt.match(/R{100,}/)![0].length).toBe(2000);
  });
});
