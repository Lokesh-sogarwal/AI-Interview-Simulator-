import { initializeApp, getApps } from "firebase/app";
import type { Auth } from "firebase/auth";

let authInstance: Auth | null = null;

export async function initFirebaseClient() {
  if (getApps().length === 0) {
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }
  if (!authInstance) {
    // Loaded lazily so pages that never use Firebase auth don't pay for it.
    const { getAuth } = await import("firebase/auth");
    authInstance = getAuth();
  }
  return authInstance;
}

export async function getFirebaseAuth() {
  return initFirebaseClient();
}
