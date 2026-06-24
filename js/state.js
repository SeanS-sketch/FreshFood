/** Global in-memory app state synced from Firestore. */
import { enrichPantryItem } from './utils.js';
import { auth } from './firebase.js';

export const APP = document.getElementById('APP');
export let currentUser = null;
export let userDoc = null;
export let currentFridgeItems = [];
export let currentCabItems = [];
export let allFood = [];
export let shoppingList = [];
export let activeRecFilters = new Set(['all']);
export let activeAllergies = new Set();
export let customRestrictions = [];
export let selectedTiming = 2;
export let bulkSelectMode = false;
export let bulkSelectedIds = new Set();
export let fridgeSearch = '';
export let cabSearch = '';
export let fridgeSort = 'expiry';
export let cabSort = 'expiry';

let userUnsub = null;

export function setCurrentUser(user) { currentUser = user; }
export function setUserDoc(doc) { userDoc = doc; }

export function applyUserDoc(doc) {
  userDoc = doc;
  const pantry = doc?.pantry || { fridge: [], cabinet: [] };
  currentFridgeItems = (pantry.fridge || []).map(enrichPantryItem);
  currentCabItems = (pantry.cabinet || []).map(enrichPantryItem);
  shoppingList = doc?.shoppingList || [];
  allFood = [...currentFridgeItems, ...currentCabItems];
  activeAllergies = new Set(doc?.preferences?.allergies || []);
  customRestrictions = [...(doc?.preferences?.customRestrictions || [])];
  const dark = !!doc?.preferences?.dark;
  if (APP) APP.classList.toggle('dark', dark);
  const darkTog = document.getElementById('dark-tog');
  if (darkTog) darkTog.classList.toggle('on', dark);
  const darkSub = document.getElementById('dark-sub');
  if (darkSub) darkSub.textContent = dark ? 'Currently dark' : 'Currently light';
}

export function setUserUnsub(fn) {
  if (userUnsub) userUnsub();
  userUnsub = fn;
}

export function clearUserState() {
  if (userUnsub) { userUnsub(); userUnsub = null; }
  currentUser = null;
  userDoc = null;
  currentFridgeItems = [];
  currentCabItems = [];
  allFood = [];
  shoppingList = [];
  activeAllergies = new Set();
  customRestrictions = [];
  bulkSelectMode = false;
  bulkSelectedIds = new Set();
}

export function isAdmin() { return userDoc?.profile?.role === 'admin'; }

export function getProfile() {
  // Firebase Auth is the source of truth for email (Firestore profile.email can lag after a change).
  const liveUser = auth.currentUser || currentUser;
  const email = liveUser?.email || userDoc?.profile?.email || '';
  const displayName = liveUser?.displayName || userDoc?.profile?.displayName || 'User';
  return {
    email,
    displayName,
    username: displayName,
  };
}

export function toggleBulkId(id) {
  if (bulkSelectedIds.has(id)) bulkSelectedIds.delete(id);
  else bulkSelectedIds.add(id);
}

export function clearBulkSelection() {
  bulkSelectedIds = new Set();
  bulkSelectMode = false;
}
