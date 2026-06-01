import { initializeApp, getApps } from "firebase/app";

let authInstance: any = null;

export async function initFirebaseClient() {
  if (getApps().length === 0) {
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }
  if (!authInstance) {
    // @ts-ignore - dynamic import to avoid build-time type issues when firebase isn't installed
    const firebaseAuth = await import("firebase/auth");
    const { getAuth } = firebaseAuth;
    authInstance = getAuth();
  }
  return authInstance;
}

export async function getFirebaseAuth() {
  return initFirebaseClient();
}
