import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import ResumeCheckerClient from "./ResumeCheckerClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resume checker" };

export default async function ResumePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return <ResumeCheckerClient />;
}
