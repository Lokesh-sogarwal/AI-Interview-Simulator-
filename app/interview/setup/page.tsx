import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import InterviewSetupClient from "./InterviewSetupClient";

export default async function InterviewSetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return <InterviewSetupClient />;
}
