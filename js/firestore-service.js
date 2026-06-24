/** Firestore read/write layer for user documents and admin collections. */
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  serverTimestamp, writeBatch, collection, getDocs, query, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';
import { defaultUserDoc } from './constants.js';
import { applyUserDoc, setUserUnsub } from './state.js';

/** Firestore path for a user's root document. */
function userRef(uid) { return doc(db, 'users', uid); }

/** Strip computed display fields before saving pantry items. */
export function serializePantryItem(item) {
  return {
    id: item.id,
    name: item.name,
    cat: item.cat,
    qty: item.qty || qtyFromItem(item),
    purchaseDate: item.purchaseDate || null,
    expirationDate: item.expirationDate,
    favorite: !!item.favorite,
    location: item.location,
  };
}

function qtyFromItem(item) {
  if (item.qty) return item.qty;
  const parts = (item.meta || '').split('·').map((s) => s.trim());
  return parts[1] || '—';
}

/** Create initial user document after signup. */
export async function createUserDocument(uid, email, displayName) {
  const data = defaultUserDoc(email, displayName);
  await setDoc(userRef(uid), data);
  return data;
}

/** Update lastLogin timestamp on successful sign-in. */
export async function touchLastLogin(uid) {
  await updateDoc(userRef(uid), { 'profile.lastLogin': new Date().toISOString() });
}

/** Realtime listener — keeps UI in sync with Firestore. */
export function subscribeUserDoc(uid, onChange, onError) {
  const unsub = onSnapshot(userRef(uid), (snap) => {
    if (!snap.exists()) {
      onError?.({ code: 'missing-document', message: 'User profile not found.' });
      return;
    }
    const data = snap.data();
    applyUserDoc(data);
    onChange?.(data);
  }, (err) => {
    onError?.(err);
  });
  setUserUnsub(unsub);
  return unsub;
}

/** Merge partial updates into user document. */
export async function updateUserDoc(uid, partial) {
  await updateDoc(userRef(uid), partial);
}

/** Save entire pantry (fridge + cabinet) arrays. */
export async function savePantry(uid, fridge, cabinet) {
  await updateDoc(userRef(uid), {
    pantry: {
      fridge: fridge.map(serializePantryItem),
      cabinet: cabinet.map(serializePantryItem),
    },
  });
}

/** Save shopping list array. */
export async function saveShoppingList(uid, list) {
  await updateDoc(userRef(uid), { shoppingList: list });
}

/** Save preferences block (dark mode, allergies, notifications). */
export async function savePreferences(uid, preferences) {
  await updateDoc(userRef(uid), { preferences });
}

/** Save privacy/settings toggles. */
export async function saveSettings(uid, settings) {
  await updateDoc(userRef(uid), { settings });
}

/** Update profile display name. */
export async function saveProfile(uid, profileFields) {
  const patch = {};
  Object.entries(profileFields).forEach(([k, v]) => { patch[`profile.${k}`] = v; });
  await updateDoc(userRef(uid), patch);
}

/** Delete user Firestore doc (called before Auth account deletion). */
export async function deleteUserDocument(uid) {
  await deleteDoc(userRef(uid));
}

/** Batch delete user data and support tickets owned by user. */
export async function purgeUserData(uid) {
  const batch = writeBatch(db);
  batch.delete(userRef(uid));
  await batch.commit();
}

/** Submit support request — stored for admin + triggers Cloud Function email. */
export async function submitSupportRequest(uid, email, displayName, message) {
  const ref = doc(collection(db, 'supportRequests'));
  await setDoc(ref, {
    uid, email, displayName, message,
    status: 'open',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Submit user feedback for admin dashboard. */
export async function submitFeedback(uid, email, rating, message) {
  const ref = doc(collection(db, 'feedback'));
  await setDoc(ref, {
    uid, email, rating, message,
    createdAt: serverTimestamp(),
  });
}

/** Admin: fetch aggregate stats (requires admin role in rules). */
export async function fetchAdminStats() {
  const usersSnap = await getDocs(collection(db, 'users'));
  const supportSnap = await getDocs(query(collection(db, 'supportRequests'), orderBy('createdAt', 'desc'), limit(50)));
  const feedbackSnap = await getDocs(query(collection(db, 'feedback'), orderBy('createdAt', 'desc'), limit(50)));
  let totalPantryItems = 0;
  usersSnap.forEach((d) => {
    const p = d.data().pantry || {};
    totalPantryItems += (p.fridge?.length || 0) + (p.cabinet?.length || 0);
  });
  return {
    totalUsers: usersSnap.size,
    totalPantryItems,
    supportRequests: supportSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    feedback: feedbackSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

/** Admin: update support ticket status. */
export async function updateSupportStatus(requestId, status) {
  await updateDoc(doc(db, 'supportRequests', requestId), { status, updatedAt: serverTimestamp() });
}

/** Ensure user doc exists and sync profile.email from Auth when it has changed. */
export async function ensureUserDoc(uid, email, displayName) {
  const snap = await getDoc(userRef(uid));
  if (snap.exists()) {
    const data = snap.data();
    // Keep Firestore profile.email aligned with Auth after verifyBeforeUpdateEmail + re-login.
    if (email && data.profile?.email !== email) {
      await updateDoc(userRef(uid), {
        'profile.email': email,
        ...(displayName && !data.profile?.displayName ? { 'profile.displayName': displayName } : {}),
      });
      data.profile = { ...data.profile, email };
    }
    return data;
  }
  const data = defaultUserDoc(email, displayName);
  await setDoc(userRef(uid), data);
  return data;
}
