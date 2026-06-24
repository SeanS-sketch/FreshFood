/**
 * Firebase initialization — Auth, Firestore, Functions, and Storage.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  connectFirestoreEmulator,
  enableIndexedDbPersistence,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getFunctions, connectFunctionsEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { firebaseConfig, functionsRegion } from './config/firebase-config.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, functionsRegion);
export const storage = getStorage(app);

export async function setAuthPersistence(rememberMe) {
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
}

export async function enableOfflinePersistence() {
  try {
    await enableIndexedDbPersistence(db);
  } catch (err) {
    console.warn('Firestore offline persistence unavailable:', err?.message);
  }
}

export function connectEmulatorsIfDev() {
  if (!location.search.includes('emulators=1')) return;
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
