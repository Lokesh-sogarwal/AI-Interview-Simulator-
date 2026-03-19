"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import SignOutButton from "../dashboard/SignOutButton";

export default function AuthedHome() {
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">(
        "idle",
    );
    const [statusMessage, setStatusMessage] = useState<string>("");

    const accept = useMemo(() => ".pdf,.doc,.docx", []);

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!resumeFile) {
            setStatus("error");
            setStatusMessage("Please select a resume file to continue.");
            return;
        }

        try {
            setStatus("uploading");
            setStatusMessage("Submitting your resume…");

            const formData = new FormData();
            formData.set("resume", resumeFile);

            const response = await fetch("/api/resume", {
                method: "POST",
                body: formData,
            });

            const payload = (await response.json()) as
                | {
                    ok: true;
                    filename: string;
                    size: number;
                    type: string;
                    resumeText: string | null;
                }
                | { ok: false; error: string };

            if (!response.ok || payload.ok === false) {
                const errorMessage =
                    "error" in payload && payload.error
                        ? payload.error
                        : "Upload failed. Please try again.";

                setStatus("error");
                setStatusMessage(errorMessage);
                return;
            }

            if (payload.resumeText && payload.resumeText.trim()) {
                localStorage.setItem("aisim_resume_text", payload.resumeText);
            } else {
                localStorage.removeItem("aisim_resume_text");
            }

            setStatus("success");
            setStatusMessage(`Resume received: ${payload.filename}. Redirecting…`);
            window.location.href = "/interview/setup";
        } catch {
            setStatus("error");
            setStatusMessage("Something went wrong. Please try again.");
        }
    }

    return (
        <div className="min-h-dvh bg-background text-foreground">
            <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
                <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
                        <span className="text-sm font-semibold">AI</span>
                    </div>
                    <div className="leading-tight">
                        <div className="text-base font-semibold tracking-tight">Interview Simulator</div>
                        <div className="text-xs text-foreground/70">Your workspace</div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <a
                        href="/dashboard"
                        className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
                    >
                        Dashboard
                    </a>
                    <SignOutButton />
                </div>
            </header>

            <main className="mx-auto w-full max-w-6xl px-6 pb-14">
                <section className="relative grid gap-10 py-10 md:grid-cols-2 md:items-center">
                    <div className="pointer-events-none absolute inset-x-0 -top-6 h-[420px] aisim-hero-glow" />

                    <div className="flex flex-col gap-5">
                        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-foreground/15 px-3 py-1 text-xs text-foreground/80">
                            <span className="font-medium text-foreground">AI HR Interview</span>
                            <span className="text-foreground/50">·</span>
                            <span>Instant feedback</span>
                        </div>

                        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
                            Upload your resume and start practicing.
                        </h1>
                        <p className="text-pretty text-base leading-7 text-foreground/75">
                            Submit your resume to tailor questions. Complete the interview and save results to your dashboard.
                        </p>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            {/* <a
                                href="#upload"
                                className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90"
                            >
                                Submit Resume
                            </a> */}
                            <a
                                href="/interview/setup"
                                className="inline-flex h-11 items-center justify-center rounded-full border border-foreground/15 px-5 text-sm font-medium transition-opacity hover:opacity-90"
                            >
                                Start interview
                            </a>
                        </div>

                        <div className="grid gap-3 pt-2 sm:grid-cols-3">
                            <div className="rounded-2xl border border-foreground/10 bg-background p-4">
                                <div className="text-sm font-medium">Personalized</div>
                                <div className="text-sm text-foreground/70">Based on your resume</div>
                            </div>
                            <div className="rounded-2xl border border-foreground/10 bg-background p-4">
                                <div className="text-sm font-medium">HR-style</div>
                                <div className="text-sm text-foreground/70">Realistic screening</div>
                            </div>
                            <div className="rounded-2xl border border-foreground/10 bg-background p-4">
                                <div className="text-sm font-medium">Feedback</div>
                                <div className="text-sm text-foreground/70">Clear improvements</div>
                            </div>
                        </div>
                    </div>

                    <div className="aisim-3d-scene">
                        <div className="relative">
                            <div className="absolute -left-4 top-10 hidden w-[92%] rounded-3xl border border-foreground/10 bg-foreground/[0.02] p-6 md:block"
                                style={{ transform: "rotateX(10deg) rotateY(-12deg) translateZ(-30px)" }}
                            />
                            <div className="absolute -right-3 top-28 hidden w-[88%] rounded-3xl border border-foreground/10 bg-foreground/[0.02] p-6 md:block"
                                style={{ transform: "rotateX(10deg) rotateY(14deg) translateZ(-50px)" }}
                            />

                            <div
                                className="relative rounded-3xl border border-foreground/10 bg-background p-6 aisim-3d-card aisim-float"
                                style={{ transform: "rotateX(6deg) rotateY(-8deg)" }}
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <div className="text-sm font-medium">How it works</div>
                                        <div className="text-sm text-foreground/70">Three simple steps</div>
                                    </div>
                                    <Image src="/window.svg" alt="" width={28} height={28} className="opacity-80" />
                                </div>

                                <div className="mt-6 grid gap-4">
                                    <div className="flex gap-4 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 transition-transform duration-300 hover:-translate-y-0.5">
                                        <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-sm font-semibold text-background">
                                            1
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium">Submit your resume</div>
                                            <div className="text-sm text-foreground/70">We use it to tailor the interview.</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 transition-transform duration-300 hover:-translate-y-0.5">
                                        <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-sm font-semibold text-background">
                                            2
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium">Take the AI interview</div>
                                            <div className="text-sm text-foreground/70">Answer HR-style questions.</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 transition-transform duration-300 hover:-translate-y-0.5">
                                        <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-sm font-semibold text-background">
                                            3
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium">Get feedback</div>
                                            <div className="text-sm text-foreground/70">Save results to your dashboard.</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="upload" className="rounded-3xl border border-foreground/10 bg-background p-6 md:p-8">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-2xl font-semibold tracking-tight">Submit your resume</h2>
                        <p className="text-sm leading-6 text-foreground/70">
                            Upload your resume to tailor questions. After upload, you’ll be redirected to the interview.
                        </p>
                    </div>

                   {/* <form onSubmit={onSubmit} className="mt-6 grid gap-4">
                        <label className="block cursor-pointer rounded-2xl border border-dashed border-foreground/25 p-5 transition-opacity hover:opacity-95">
                            <input
                                type="file"
                                className="sr-only"
                                accept={accept}
                                onChange={(e) => {
                                    const nextFile = e.target.files?.[0] ?? null;
                                    setResumeFile(nextFile);
                                    setStatus("idle");
                                    setStatusMessage("");
                                }}
                            />

                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <div className="text-sm font-medium">Choose a file</div>
                                    <div className="text-sm text-foreground/70">
                                        {resumeFile ? resumeFile.name : "PDF, DOC, or DOCX"}
                                    </div>
                                </div>
                                <div className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium">
                                    Browse
                                </div>
                            </div>
                        </label>

                         <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                            <button
                                type="submit"
                                disabled={status === "uploading"}
                                className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
                            >
                                {status === "uploading" ? "Submitting…" : "Submit resume"}
                            </button>

                            <div
                                className={
                                    status === "error"
                                        ? "text-sm text-foreground"
                                        : "text-sm text-foreground/70"
                                }
                                aria-live="polite"
                            >
                                {statusMessage || "Your resume text is used to tailor questions."}
                            </div>
                        </div> 
                    </form>*/}
                </section>
            </main>
        </div>
    );
}
