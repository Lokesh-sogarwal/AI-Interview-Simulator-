import { ObjectId } from "mongodb";
import type { AuthUser } from "@/lib/auth";
import { FakeDb } from "./fakeDb";

/** Shared mutable state read by the module mocks in each test file. */
export type TestState = {
  user: AuthUser | null;
  db: FakeDb | null;
  llm: ((params: { system: string; user: string }) => { text: string; provider: "huggingface" | "openai" } | null) | null;
};

export function newUser(overrides: Partial<AuthUser> = {}): AuthUser {
  const id = new ObjectId().toString();
  return { id, name: "Test User", email: `${id}@example.com`, isAdmin: false, ...overrides };
}

export function jsonRequest(url: string, body?: unknown, init: RequestInit = {}) {
  return new Request(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}` },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  });
}

export function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

export const goodEvaluation = {
  technical_score: 7,
  clarity_score: 7,
  confidence_score: 7,
  depth_score: 7,
  english_fluency_score: 7,
  project_knowledge_score: 6,
  overall_score: 7,
  strengths: "Clear structure.",
  weaknesses: "Could go deeper.",
  improvement: "Add metrics.",
  ideal_answer: "…",
  follow_up_question: "How did you measure impact?",
};
