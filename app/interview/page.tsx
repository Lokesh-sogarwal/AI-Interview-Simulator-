import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import ConversationInterview from "./ConversationInterview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live interview" };

export default async function InterviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return <ConversationInterview />;
}
