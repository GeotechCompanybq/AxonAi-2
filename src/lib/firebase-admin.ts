import * as admin from "firebase-admin";

let app: admin.app.App | null = null;

if (!admin.apps.length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : undefined;

  app = admin.initializeApp(
    sa
      ? { credential: admin.credential.cert(sa) }
      : { credential: admin.credential.applicationDefault() }
  );
} else {
  app = admin.app();
}

export const adminDb = admin.firestore();
export const adminFieldValue = admin.firestore.FieldValue;
