import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import FeedbackClient from "./FeedbackClient";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return <FeedbackClient />;
}
