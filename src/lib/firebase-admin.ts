import * as admin from "firebase-admin";

let app: admin.app.App | null = null;

function buildServiceAccountFromEnv(): admin.ServiceAccount | undefined {
  // Prefer FIREBASE_SERVICE_ACCOUNT as JSON
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw && raw.length > 0) {
    try {
      return JSON.parse(raw);
    } catch {
      // fall through to split env vars
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = privateKeyRaw
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : undefined;
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey } as admin.ServiceAccount;
  }
  return undefined;
}

if (!admin.apps.length) {
  const sa = buildServiceAccountFromEnv();
  try {
    app = admin.initializeApp(
      sa
        ? { credential: admin.credential.cert(sa) }
        : { credential: admin.credential.applicationDefault() }
    );
  } catch {
    // As a last resort, try initializing without explicit credentials to avoid build-time crashes
    app = admin.initializeApp();
  }
} else {
  app = admin.app();
}

export const adminDb = admin.firestore();
export const adminFieldValue = admin.firestore.FieldValue;
