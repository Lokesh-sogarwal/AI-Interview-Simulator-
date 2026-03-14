import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import InterviewClient from "./InterviewClient";

export default async function InterviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return <InterviewClient />;
}
