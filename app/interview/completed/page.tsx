import { CircleCheck } from "lucide-react";

import { ButtonLink, Card, PageContainer } from "@/app/components/ui";

export const metadata = { title: "Interview complete" };

export default function InterviewCompletedPage() {
  return (
    <PageContainer width="narrow">
      <Card className="grid justify-items-center gap-4 p-8 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success" aria-hidden>
          <CircleCheck className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">Interview complete</h1>
          <p className="mt-1.5 text-sm text-muted">Your answers and feedback are saved. Open your history to review the full report.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ButtonLink href="/history">Go to history</ButtonLink>
          <ButtonLink href="/interview/setup" variant="secondary">
            Start another interview
          </ButtonLink>
        </div>
      </Card>
    </PageContainer>
  );
}
