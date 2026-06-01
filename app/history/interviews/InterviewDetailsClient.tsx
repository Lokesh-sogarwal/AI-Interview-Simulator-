"use client";

import { useRouter } from "next/navigation";
import PageHeader from "../../components/PageHeader";

interface InterviewDetailsClientProps {
  children: React.ReactNode;
  backLabel?: string;
}

export default function InterviewDetailsClient({
  children,
  backLabel = "Back to History",
}: InterviewDetailsClientProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <PageHeader 
        title="Interview Details" 
        subtitle="View your interview report and feedback"
        showProfile={true}
      />
      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-8 flex items-center gap-2 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
        >
          ← {backLabel}
        </button>

        {children}
      </main>
    </div>
  );
}
