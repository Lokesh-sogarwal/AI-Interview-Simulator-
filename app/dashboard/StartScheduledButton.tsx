"use client";

import { Play } from "lucide-react";

import { Button } from "@/app/components/ui";
import { parseDetails, saveDetails, saveInterviewId, saveResumeText } from "@/app/lib/interviewStorage";

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

/** Loads a scheduled interview's saved configuration and opens the live session. */
export default function StartScheduledButton({ details, disabled, size = "sm" }: { details: ScheduledDetails; disabled?: boolean; size?: "sm" | "md" }) {
  return (
    <Button
      size={size}
      disabled={disabled}
      icon={<Play className="size-3.5" aria-hidden />}
      onClick={() => {
        const parsed = parseDetails(
          JSON.stringify({
            type: details.type,
            role: details.role,
            experience: details.experience,
            difficulty: details.difficulty,
            company: details.company || "",
            focusAreas: details.focusAreas || "",
            useResume: details.useResume !== false,
            interactionMode: details.interactionMode,
          }),
        );
        if (parsed) saveDetails(parsed);
        saveResumeText(details.useResume !== false ? details.resumeText ?? null : null);
        saveInterviewId(details.id);
        window.location.href = "/interview";
      }}
    >
      Start
    </Button>
  );
}
