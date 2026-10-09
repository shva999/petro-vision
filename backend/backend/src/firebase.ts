import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getMessaging } from "firebase-admin/messaging";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

const firebaseApp = serviceAccountJson
  ? getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) })
  : undefined;

export const firebase = firebaseApp
  ? {
      auth: getAuth(firebaseApp),
      firestore: getFirestore(firebaseApp),
      storage: getStorage(firebaseApp),
      messaging: getMessaging(firebaseApp)
    }
  : undefined;