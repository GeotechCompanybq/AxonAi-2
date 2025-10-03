import {
  getApps,
  getApp,
  initializeApp,
  cert,
  applicationDefault,
  type App as AdminApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

let app: AdminApp;

function buildServiceAccountFromEnv():
  | { projectId: string; clientEmail: string; privateKey: string }
  | undefined {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      return {
        projectId: parsed.projectId,
        clientEmail: parsed.clientEmail,
        privateKey: String(parsed.privateKey || "").replace(/\\n/g, "\n"),
      };
    } catch {}
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = privateKeyRaw
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : undefined;
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  return undefined;
}

if (getApps().length === 0) {
  const sa = buildServiceAccountFromEnv();
  try {
    app = sa
      ? initializeApp({ credential: cert(sa) })
      : initializeApp({ credential: applicationDefault() });
  } catch (e) {
    // Surface init errors clearly in dev
    console.error("Firebase Admin init error", e);
    throw e;
  }
} else {
  app = getApp();
}

export const adminDb = getFirestore(app);
export const adminFieldValue = FieldValue;
export const adminAuth = getAuth(app);
