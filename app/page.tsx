import { getCurrentUser } from "@/lib/auth";

import AuthedHome from "./home/AuthedHome";
import PublicLanding from "./home/PublicLanding";

export default async function Home() {
  const user = await getCurrentUser();
  return user ? <AuthedHome /> : <PublicLanding />;
}
