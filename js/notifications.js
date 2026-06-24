/**
 * In-app notification preferences and expiry reminder logic.
 * Reads/writes userDoc.preferences.notifications via Firestore.
 * Includes registerPushToken stub for future Firebase Cloud Messaging.
 */
import {
  allFood,
  currentUser,
  userDoc,
} from './state.js';
import { TIMING_CHOICES, EXPIRY } from './constants.js';
import { escapeHTML } from './utils.js';
import { showToast } from './ui.js';
import { savePreferences } from './firestore-service.js';

/** Default notification prefs when none exist on the user document. */
function getNotificationPrefs() {
  return userDoc?.preferences?.notifications || {
    enabled: false,
    expiryReminders: true,
    recipeSuggestions: true,
    shoppingList: false,
    daysBefore: 3,
    quietHours: true,
    pushToken: null,
  };
}

/** Selected timing index (maps to TIMING_CHOICES / daysBefore). */
let selectedTimingIndex = 2;

/** Sync timing UI index from stored daysBefore preference. */
function syncTimingFromPrefs() {
  const days = getNotificationPrefs().daysBefore ?? 3;
  const map = { 1: 0, 2: 1, 3: 2, 5: 3, 7: 4 };
  selectedTimingIndex = map[days] ?? 2;
}

/** Persist notification preferences block to Firestore. */
async function persistNotifications(patch) {
  if (!currentUser) return;
  const next = { ...getNotificationPrefs(), ...patch };
  await savePreferences(currentUser.uid, {
    ...userDoc?.preferences,
    notifications: next,
  });
}

/** User opted in — reveal settings panel and render timing choices. */
export async function allowAlerts() {
  const body = document.getElementById('alerts-body');
  if (body) body.style.display = 'block';

  syncTimingFromPrefs();
  renderTimingOptions();

  try {
    await persistNotifications({ enabled: true });
    renderInAppNotifications();
  } catch (err) {
    showToast(err.message || 'Could not save notification preference.', 'error');
  }
}

/** User declined notifications — hide prompt and persist disabled state. */
export async function denyAlerts() {
  const prompt = document.querySelector('#s-alerts > div:nth-child(2) > div');
  if (prompt) {
    prompt.innerHTML = '<p style="font-size:13px;color:var(--txt2);text-align:center;padding:8px 0">Notifications are off. Enable them anytime in device settings.</p>';
  }
  const body = document.getElementById('alerts-body');
  if (body) body.style.display = 'none';

  try {
    await persistNotifications({ enabled: false });
  } catch (err) {
    showToast(err.message || 'Could not save notification preference.', 'error');
  }
}

/** Map timing choice index to daysBefore value stored in Firestore. */
const TIMING_DAYS = [1, 2, 3, 5, 7];

/** Render radio-style timing options in #timing-opts. */
function renderTimingOptions() {
  const container = document.getElementById('timing-opts');
  if (!container) return;
  container.innerHTML = TIMING_CHOICES.map((label, i) => {
    const selected = i === selectedTimingIndex;
    return `<div onclick="pickTiming(this,${i})" style="background:var(--bg0);border:0.5px solid ${selected ? '#185FA5' : 'var(--bdr)'};border-radius:9px;padding:10px 13px;display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;cursor:pointer"><span style="font-size:14px;color:var(--txt)">${label}</span><div style="width:17px;height:17px;border-radius:50%;border:2px solid ${selected ? '#185FA5' : 'var(--bdr)'};background:${selected ? '#185FA5' : 'transparent'};display:flex;align-items:center;justify-content:center">${selected ? '<div style="width:7px;height:7px;border-radius:50%;background:#fff"></div>' : ''}</div></div>`;
  }).join('');
}

/** User picked how far in advance to remind before expiry. */
export async function pickTiming(el, index) {
  selectedTimingIndex = index;
  renderTimingOptions();
  try {
    await persistNotifications({ daysBefore: TIMING_DAYS[index] ?? 3 });
    checkExpiryNotifications();
  } catch (err) {
    showToast(err.message || 'Could not save timing preference.', 'error');
  }
}

/** Render in-app notification list inside #in-app-notifications (or alerts screen). */
export function renderInAppNotifications() {
  const container = document.getElementById('in-app-notifications');
  if (!container) return;

  const prefs = getNotificationPrefs();
  if (!prefs.enabled) {
    container.innerHTML = '<p style="font-size:13px;color:var(--txt2);padding:12px 15px">Enable notifications to see expiry reminders here.</p>';
    return;
  }

  const alerts = buildExpiryAlerts(prefs);
  if (!alerts.length) {
    container.innerHTML = '<p style="font-size:13px;color:var(--txt2);padding:12px 15px">No expiry alerts right now. Your food looks good!</p>';
    return;
  }

  container.innerHTML = alerts.map((a) => `
    <div class="fc" style="cursor:default;margin:0 15px 8px">
      <div class="ficon" style="background:${a.bg}">${a.icon}</div>
      <div style="flex:1;min-width:0">
        <div class="fn">${escapeHTML(a.title)}</div>
        <div class="fm">${escapeHTML(a.body)}</div>
      </div>
      <span class="eb ${a.badge}">${escapeHTML(a.label)}</span>
    </div>
  `).join('');
}

/** Build alert objects for items matching notification thresholds. */
function buildExpiryAlerts(prefs) {
  if (!prefs.expiryReminders) return [];
  const threshold = prefs.daysBefore ?? EXPIRY.ALERT_DAYS;
  return allFood
    .filter((item) => typeof item.days === 'number' && item.days >= 0 && item.days <= threshold)
    .sort((a, b) => a.days - b.days)
    .slice(0, 20)
    .map((item) => ({
      icon: item.icon || '🍽️',
      bg: item.bg || '#FAEEDA',
      badge: item.badge || 'es',
      label: item.label || `${item.days} days`,
      title: item.days === 0 ? `${item.name} expires today` : `${item.name} expiring soon`,
      body: `${item.meta || item.cat} — use it or plan a recipe before it goes bad.`,
    }));
}

/** Check pantry against prefs and refresh in-app notification UI.
 * @param {boolean} silent When true, skip toast popups (used during background Firestore sync).
 */
export function checkExpiryNotifications(silent) {
  const prefs = getNotificationPrefs();
  if (!prefs.enabled || !prefs.expiryReminders) return;

  renderInAppNotifications();

  if (silent) return;

  const expired = allFood.filter((i) => typeof i.days === 'number' && i.days < 0);
  const soon = allFood.filter((i) => typeof i.days === 'number' && i.days >= 0 && i.days <= (prefs.daysBefore ?? EXPIRY.ALERT_DAYS));

  if (expired.length && prefs.expiryReminders) {
    showToast(`${expired.length} item${expired.length > 1 ? 's' : ''} expired — check your pantry.`, 'info', 4500);
  } else if (soon.length && prefs.recipeSuggestions) {
    showToast(`${soon.length} item${soon.length > 1 ? 's' : ''} expiring soon — see Recipes for ideas.`, 'info', 4000);
  }
}

/**
 * Stub for future Firebase Cloud Messaging integration.
 * Call after user grants browser notification permission.
 */
export async function registerPushToken(token) {
  if (!currentUser || !token) return null;
  try {
    await persistNotifications({ pushToken: token });
    return token;
  } catch (err) {
    console.warn('Could not save push token:', err?.message);
    return null;
  }
}

/** Apply stored notification prefs to the alerts screen UI on load. */
export function initNotificationsUI() {
  syncTimingFromPrefs();
  const prefs = getNotificationPrefs();
  if (prefs.enabled) {
    const body = document.getElementById('alerts-body');
    if (body) body.style.display = 'block';
    renderTimingOptions();
  }
  renderInAppNotifications();
}

/** Attach notification handlers to window for HTML onclick attributes. */
export function bindNotificationHandlers() {
  window.allowAlerts = allowAlerts;
  window.denyAlerts = denyAlerts;
  window.pickTiming = pickTiming;
  window.registerPushToken = registerPushToken;
}
