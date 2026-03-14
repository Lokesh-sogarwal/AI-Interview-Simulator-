import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import FeedbackClient from "./FeedbackClient";

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return <FeedbackClient />;
}
