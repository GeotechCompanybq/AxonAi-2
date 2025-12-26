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

let cachedApp: AdminApp | null | undefined;
let cachedAuth: ReturnType<typeof getAuth> | null | undefined;
let cachedDb: ReturnType<typeof getFirestore> | null | undefined;

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

function initAppOnce(): AdminApp | null {
  if (cachedApp !== undefined) return cachedApp;
  try {
    if (getApps().length > 0) {
      cachedApp = getApp();
      return cachedApp;
    }
    const sa = buildServiceAccountFromEnv();
    cachedApp = sa
      ? initializeApp({ credential: cert(sa) })
      : initializeApp({ credential: applicationDefault() });
    return cachedApp;
  } catch (e) {
    // Never crash the whole Next.js process at module import time.
    // In prod this commonly happens when Firebase env vars aren't configured.
    console.error("Firebase Admin init error", e);
    cachedApp = null;
    return null;
  }
}

export const adminFieldValue = FieldValue;

export function getAdminDb() {
  if (cachedDb !== undefined) return cachedDb;
  const app = initAppOnce();
  cachedDb = app ? getFirestore(app) : null;
  return cachedDb;
}

export function getAdminAuth() {
  if (cachedAuth !== undefined) return cachedAuth;
  const app = initAppOnce();
  cachedAuth = app ? getAuth(app) : null;
  return cachedAuth;
}

// Backwards-compatible named exports used across the codebase.
// These are lazy and will only throw when actually used without Firebase config.
export const adminDb = new Proxy({} as any, {
  get(_target, prop) {
    const db = getAdminDb();
    if (!db) throw new Error("Firebase admin not configured");
    return (db as any)[prop];
  },
}) as ReturnType<typeof getFirestore>;

export const adminAuth = new Proxy({} as any, {
  get(_target, prop) {
    const auth = getAdminAuth();
    if (!auth) throw new Error("Firebase admin not configured");
    return (auth as any)[prop];
  },
}) as ReturnType<typeof getAuth>;
