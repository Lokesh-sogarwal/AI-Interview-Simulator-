"use client";

type ScheduledDetails = {
  id: string;
  type: string;
  role: string;
  experience: string;
  difficulty: string;
  company?: string;
  focusAreas?: string;
  interactionMode?: "typing" | "video";
  useResume?: boolean;
  resumeText?: string | null;
};

const DETAILS_KEY = "aisim_interview_details";
const RESUME_KEY = "aisim_resume_text";
const INTERVIEW_ID_KEY = "aisim_interview_id";

export default function StartScheduledButton({ details }: { details: ScheduledDetails }) {
  return (
    <button
      type="button"
      onClick={() => {
        try {
          window.localStorage.setItem(
            DETAILS_KEY,
            JSON.stringify({
              type: details.type,
              role: details.role,
              experience: details.experience,
              difficulty: details.difficulty,
              company: details.company || "",
              focusAreas: details.focusAreas || "",
              useResume: details.useResume !== false,
              interactionMode: details.interactionMode === "video" ? "video" : "typing",
            }),
          );

          if (details.useResume !== false && details.resumeText && details.resumeText.trim()) {
            window.localStorage.setItem(RESUME_KEY, details.resumeText);
          } else {
            window.localStorage.removeItem(RESUME_KEY);
          }

          window.localStorage.setItem(INTERVIEW_ID_KEY, details.id);
        } catch {
          // Ignore storage errors; still try to navigate.
        }

        window.location.href = "/interview";
      }}
      className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
    >
      Start
    </button>
  );
}
