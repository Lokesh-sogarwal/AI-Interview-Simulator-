import { redirect } from "next/navigation";

// Kept for existing links; the canonical report lives under /history.
export default async function DashboardInterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/history/interviews/${encodeURIComponent(id)}`);
}
