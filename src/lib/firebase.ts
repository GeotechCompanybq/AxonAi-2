// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCnqhnQH0KJcZzPtzPOgNEwL89cTts_Vjk",
  authDomain: "axonai-2a6b6.firebaseapp.com",
  databaseURL: "https://axonai-2a6b6-default-rtdb.firebaseio.com",
  projectId: "axonai-2a6b6",
  storageBucket: "axonai-2a6b6.firebasestorage.app",
  messagingSenderId: "9310766469",
  appId: "1:9310766469:web:6eae8b0730cbda3896b0ec",
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// Ensure robust persistence across mobile browsers and redirect flows.
// Try local persistence first, fall back to session, then in-memory.
// This guards iOS Safari/private mode where storage can be restricted.
try {
  // Fire and forget; auth operations await persistence internally as needed.
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  setPersistence(auth, browserLocalPersistence).catch(async () => {
    try {
      await setPersistence(auth, browserSessionPersistence);
    } catch {
      await setPersistence(auth, inMemoryPersistence);
    }
  });
} catch {
  // Ignore; Firebase Auth will use its default if all persistences fail.
}
export default app;
