/** Utility helpers — dates, HTML escaping, icons, and error messages. */
import { FRIDGE_CATS, CAB_CATS, CAT_BG, CAT_ICONS, NAME_ICON_RULES } from './constants.js';

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
export function norm(value) { return String(value).toLowerCase().replace(/[^a-z0-9]/g, ''); }
export function fmtDate(dateStr) {
  if (!dateStr) return '';
  try { return new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return dateStr; }
}
export function todayNoon() { const d = new Date(); d.setHours(12, 0, 0, 0); return d; }
export function daysRemaining(expirationDate) {
  if (!expirationDate) return 30;
  const exp = new Date(`${expirationDate}T12:00:00`);
  return Math.ceil((exp - todayNoon()) / 86400000);
}
export function expirySection(days) { if (days <= 0) return 'expired'; if (days <= 7) return 'soon'; return 'fresh'; }
export function badgeFromDays(days) { if (days <= 0) return 'eu'; if (days <= 7) return 'es'; return 'eo'; }
export function labelFromDays(days) {
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days <= 60) return `${days} days`;
  return `${Math.round(days / 30)} mo`;
}
export function catLabel(cat) { return FRIDGE_CATS[cat] || CAB_CATS[cat] || cat; }
export function pickIcon(name, cat) { for (const [re, icon] of NAME_ICON_RULES) if (re.test(name)) return icon; return CAT_ICONS[cat] || '🍽️'; }
export function formatMeta(cat, qty, purchaseDate) {
  let meta = `${catLabel(cat)} · ${qty || '—'}`;
  if (purchaseDate) meta += ` · stored ${fmtDate(purchaseDate)}`;
  return meta;
}
export function qtyFromMeta(meta) { return (meta || '').split('·').map((s) => s.trim())[1] || '—'; }
export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0].slice(0, 2) || '?').toUpperCase();
}
export function newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
export function enrichPantryItem(raw) {
  const days = daysRemaining(raw.expirationDate);
  const cat = raw.cat || 'produce';
  return { ...raw, id: raw.id || newId(), icon: raw.icon || pickIcon(raw.name, cat), bg: raw.bg || CAT_BG[cat] || '#F1EFE8', meta: formatMeta(cat, raw.qty, raw.purchaseDate), days, badge: badgeFromDays(days), label: labelFromDays(days), section: expirySection(days) };
}
export function sortByExpiry(items) { return [...items].sort((a, b) => a.days - b.days); }
export function friendlyAuthError(code) {
  const map = { 'auth/invalid-email': 'Please enter a valid email address.', 'auth/user-disabled': 'This account has been disabled.', 'auth/user-not-found': 'No account found with this email.', 'auth/wrong-password': 'Incorrect password. Try again.', 'auth/invalid-credential': 'Invalid email or password.', 'auth/email-already-in-use': 'An account with this email already exists.', 'auth/weak-password': 'Password must be at least 8 characters.', 'auth/too-many-requests': 'Too many attempts. Please wait and try again.', 'auth/network-request-failed': 'No internet connection. Check your network.', 'auth/requires-recent-login': 'Please sign in again to complete this action.', 'auth/operation-not-allowed': 'This sign-in method is not enabled.' };
  return map[code] || 'Something went wrong. Please try again.';
}

/** Map Cloud Functions httpsCallable errors to user-friendly messages. */
export function friendlyFunctionsError(err) {
  const code = err?.code || '';
  const map = {
    'functions/unauthenticated': 'Sign in again to complete this action.',
    'functions/permission-denied': 'You do not have permission for this action.',
    'functions/unavailable': 'Service temporarily unavailable. Try again shortly.',
    'functions/deadline-exceeded': 'Request timed out. Try again.',
    'functions/internal': 'Server error. Your data may still have been saved.',
    'functions/cancelled': 'Request was cancelled.',
  };
  if (map[code]) return map[code];
  if (code.startsWith('functions/')) return 'Could not reach the server. Try again.';
  return err?.message || 'Something went wrong. Please try again.';
}
