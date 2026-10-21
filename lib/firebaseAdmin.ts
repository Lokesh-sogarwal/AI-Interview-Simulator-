import admin from "firebase-admin";

let app: admin.app.App | null = null;

/** Env files usually store the PEM key with literal "\n" sequences. */
export function normalizePrivateKey(raw: string) {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function init() {
  if (admin.apps.length) {
    app = admin.app();
    return app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || "");

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  } else {
    // Fall back to application default credentials (e.g. on GCP).
    try {
      admin.initializeApp();
    } catch (e) {
      console.error("[firebase-admin] initialization failed:", e instanceof Error ? e.message : "unknown");
    }
  }

  app = admin.app();
  return app;
}

export function getFirebaseAdmin() {
  if (!app) init();
  return admin;
}
