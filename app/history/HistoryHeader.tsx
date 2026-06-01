"use client";

import PageHeader from "../components/PageHeader";

interface HistoryHeaderProps {
  children: React.ReactNode;
}

export default function HistoryHeader({ children }: HistoryHeaderProps) {
  return (
    <div className="min-h-screen">
      <PageHeader 
        title="History" 
        subtitle="Your interview history and performance"
        showProfile={true}
      />
      <main className="mx-auto w-full max-w-6xl px-6 pb-16">
        {children}
      </main>
    </div>
  );
}
