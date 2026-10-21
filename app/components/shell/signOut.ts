/** Ends the session server-side, then leaves the authenticated app. */
export async function signOut() {
  const res = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error("Could not sign out. Please try again.");
  window.location.href = "/";
}
