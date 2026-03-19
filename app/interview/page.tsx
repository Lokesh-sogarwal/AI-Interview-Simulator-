import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import InterviewContainer from "./InterviewContainer";

export const dynamic = "force-dynamic";

export default async function InterviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return <InterviewContainer />;
}
