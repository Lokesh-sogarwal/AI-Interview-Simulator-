import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import InterviewReportView from "../InterviewReportView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Interview report" };

export default async function InterviewDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  const { id } = await params;
  return <InterviewReportView id={id} />;
}
