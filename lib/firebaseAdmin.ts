import admin from "firebase-admin";

let app: admin.app.App | null = null;

function init() {
  if (admin.apps.length) {
    app = admin.app();
    return app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";

  if (privateKey && privateKey.includes('\\n')) {
    // already contains newlines
  } else if (privateKey) {
    // replace escaped newlines
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      } as any),
    });
  } else {
    // fallback to default credentials (e.g., GCP environment)
    try {
      admin.initializeApp();
    } catch (e) {
      // ignore
    }
  }

  app = admin.app();
  return app;
}

export function getFirebaseAdmin() {
  if (!app) init();
  return admin;
}
