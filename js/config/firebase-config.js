/**
 * Firebase project configuration for FreshFood.
 * Replace placeholder values with your Firebase Console → Project settings → Web app config.
 * These client keys are safe to expose; security is enforced by Firestore Rules and Auth.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyDA0Ry1csIZPnYJkpL_RhKGk-MdAWhf_ys",
  authDomain: "freshfood-68ff4.firebaseapp.com",
  projectId: "freshfood-68ff4",
  storageBucket: "freshfood-68ff4.firebasestorage.app",
  messagingSenderId: "200451475553",
  appId: "1:200451475553:web:eacab47e3abe8f2a5dc220"
};

/** Cloud Functions region — must match deployed functions. */
export const functionsRegion = 'us-central1';

/** Support inbox — used by Cloud Functions only; not for client-side email. */
export const supportEmail = 'freshfood.support@gmail.com';
