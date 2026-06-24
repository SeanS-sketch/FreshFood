/**
 * Settings screen — account profile, dark mode, privacy toggles, export, delete, and support.
 * Wires Firebase Auth for password/email changes and Cloud Functions for support email.
 */
import {
  APP,
  currentUser,
  userDoc,
  currentFridgeItems,
  currentCabItems,
  getProfile,
  isAdmin,
  activeAllergies,
  customRestrictions,
} from './state.js';
import { escapeHTML, initials, friendlyAuthError, friendlyFunctionsError, fmtDate, catLabel, qtyFromMeta } from './utils.js';
import { ALLERGY_LABELS } from './constants.js';
import {
  openModal,
  closeModal,
  showToast,
  showLoading,
  hideLoading,
  setButtonLoading,
} from './ui.js';
import { savePreferences, saveSettings, saveProfile, submitSupportRequest } from './firestore-service.js';
import { changePassword, changeEmail, deleteAccount, resetPassword } from './auth.js';
import { auth, functions } from './firebase.js';
import { setCurrentUser } from './state.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

/** Sync profile and allergy label text on the settings screen. */
export async function refreshAccountUI() {
  // Reload Auth token/profile so email changes appear immediately after re-login.
  if (auth.currentUser) {
    try {
      await auth.currentUser.reload();
      setCurrentUser(auth.currentUser);
    } catch {
      /* offline — show last known Auth state */
    }
  }

  const profile = getProfile();
  const uname = document.getElementById('uname-display');
  const emailEl = document.getElementById('email-display');
  const label = document.getElementById('allergy-label');
  const pname = document.getElementById('profile-name');
  const pemail = document.getElementById('profile-email');
  const avatar = document.getElementById('profile-avatar');

  if (uname) uname.textContent = profile.displayName || profile.username || 'User';
  if (emailEl) emailEl.textContent = profile.email || 'Not signed in';
  if (pname) pname.textContent = profile.displayName || 'User';
  if (pemail) pemail.textContent = profile.email || 'Not signed in';
  if (avatar) avatar.textContent = initials(profile.displayName || profile.username);

  if (label) {
    const allergies = userDoc?.preferences?.allergies?.length
      ? userDoc.preferences.allergies
      : [...activeAllergies];
    const custom = userDoc?.preferences?.customRestrictions?.length
      ? userDoc.preferences.customRestrictions
      : [...customRestrictions];
    const display = [...new Set([...allergies, ...custom])].map((v) => ALLERGY_LABELS[v] || v);
    label.textContent = display.length ? display.join(', ') : 'No restrictions set';
  }

  const adminRow = document.getElementById('admin-settings-row');
  if (adminRow) adminRow.style.display = isAdmin() ? '' : 'none';
}

/** Toggle dark mode and persist preference to Firestore. */
export async function toggleDark() {
  const tog = document.getElementById('dark-tog');
  if (!tog) return;
  tog.classList.toggle('on');
  const dark = tog.classList.contains('on');
  APP?.classList.toggle('dark', dark);
  const darkSub = document.getElementById('dark-sub');
  if (darkSub) darkSub.textContent = dark ? 'Currently dark' : 'Currently light';

  if (!currentUser) return;
  try {
    await savePreferences(currentUser.uid, {
      ...userDoc?.preferences,
      dark,
    });
  } catch (err) {
    showToast(err.message || 'Could not save theme.', 'error');
  }
}

/** Open a settings modal by type key (username, email, export, etc.). */
export function showModal(type) {
  const profile = getProfile();

  if (type === 'export') {
    const total = currentFridgeItems.length + currentCabItems.length;
    openModal(`<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle">Export your data</div><p style="font-size:13px;color:var(--txt2);margin-bottom:14px;line-height:1.6">Your personal fridge and cabinet items will be exported as a PDF with names, categories, quantities, stored dates, and expiry.</p><div style="background:var(--bg1);border-radius:9px;padding:11px 13px;margin-bottom:14px;border:0.5px solid var(--bdr)"><div style="font-size:13px;font-weight:500;color:var(--txt);margin-bottom:3px">Your food list</div><div style="font-size:12px;color:var(--txt2)">${total} item${total === 1 ? '' : 's'} · ${currentFridgeItems.length} fridge · ${currentCabItems.length} cabinet</div></div>${total ? `<div class="mbtn-row"><button class="mbtn-s" onclick="closeModal()">Cancel</button><button class="mbtn-p" onclick="doExport()"><i class="ti ti-download" style="font-size:14px;margin-right:5px"></i>Export PDF</button></div>` : `<p style="font-size:13px;color:var(--txt2);margin-bottom:12px">Add items to your fridge or cabinet before exporting.</p><button class="mbtn-p" onclick="closeModal()" style="width:100%">OK</button>`}</div></div>`);
    return;
  }

  const settings = userDoc?.settings || {};
  const modals = {
    username: `<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle">Change username</div><label class="flabel">Current username</label><input class="inp" value="${escapeHTML(profile.displayName)}" readonly style="margin-bottom:10px;color:var(--txt2)"><label class="flabel">New username</label><input class="inp" id="new-uname" placeholder="Enter new username" style="margin-bottom:4px"><div class="mbtn-row"><button class="mbtn-s" onclick="closeModal()">Cancel</button><button class="mbtn-p" onclick="saveUsername()">Save</button></div></div></div>`,

    email: `<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle">Change email address</div><div class="notice"><i class="ti ti-mail" style="font-size:14px;vertical-align:-2px;margin-right:5px"></i>Firebase will send a verification link to your new address. Sign in again after confirming.</div><label class="flabel">Current password</label><input class="inp" id="email-current-pass" type="password" placeholder="Enter current password" style="margin-bottom:10px"><label class="flabel">New email address</label><input class="inp" id="new-email" type="email" placeholder="your@email.com" style="margin-bottom:10px"><label class="flabel">Confirm email address</label><input class="inp" id="confirm-email" type="email" placeholder="Repeat new email" style="margin-bottom:4px"><div class="mbtn-row"><button class="mbtn-s" onclick="closeModal()">Cancel</button><button class="mbtn-p" onclick="saveEmail()">Send verification</button></div></div></div>`,

    password: `<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle">Change password</div><div class="notice"><i class="ti ti-shield-check" style="font-size:14px;vertical-align:-2px;margin-right:5px"></i>Re-enter your current password to set a new one.</div><label class="flabel">Current password</label><input class="inp" id="current-password" type="password" placeholder="Enter current password" style="margin-bottom:10px"><div style="text-align:right;margin:-5px 0 10px"><span onclick="showForgotPassword()" style="font-size:12px;color:var(--blue);cursor:pointer;font-weight:500">Forgot password?</span></div><label class="flabel">New password</label><input class="inp" id="new-password" type="password" placeholder="At least 8 characters" style="margin-bottom:10px"><label class="flabel">Confirm new password</label><input class="inp" id="confirm-password" type="password" placeholder="Repeat new password" style="margin-bottom:4px"><div class="mbtn-row"><button class="mbtn-s" onclick="closeModal()">Cancel</button><button class="mbtn-p" onclick="savePassword()">Change password</button></div></div></div>`,

    privacy: `<div class="modal-wrap"><div class="modal" style="padding-bottom:24px"><div class="mhdl"></div><div class="mtitle">Privacy settings</div><div class="priv-row"><div><div style="font-size:14px;color:var(--txt)">Share analytics data</div><div style="font-size:12px;color:var(--txt2)">Help improve the app</div></div><div class="tog ${settings.shareAnalytics !== false ? 'on' : ''}" data-setting="shareAnalytics" onclick="this.classList.toggle('on')"><div class="tok"></div></div></div><div class="priv-row"><div><div style="font-size:14px;color:var(--txt)">Personalised recipe suggestions</div><div style="font-size:12px;color:var(--txt2)">Based on your food habits</div></div><div class="tog ${settings.personalizedRecipes !== false ? 'on' : ''}" data-setting="personalizedRecipes" onclick="this.classList.toggle('on')"><div class="tok"></div></div></div><div class="priv-row"><div><div style="font-size:14px;color:var(--txt)">Store food scan history</div><div style="font-size:12px;color:var(--txt2)">Used to improve barcode lookups</div></div><div class="tog ${settings.storeScanHistory ? 'on' : ''}" data-setting="storeScanHistory" onclick="this.classList.toggle('on')"><div class="tok"></div></div></div><div class="priv-row" style="border:none"><div><div style="font-size:14px;color:var(--txt)">Marketing emails</div><div style="font-size:12px;color:var(--txt2)">Occasional tips & offers</div></div><div class="tog ${settings.marketingEmails ? 'on' : ''}" data-setting="marketingEmails" onclick="this.classList.toggle('on')"><div class="tok"></div></div></div><div class="mbtn-row"><button class="mbtn-s" onclick="closeModal()">Cancel</button><button class="mbtn-p" onclick="savePrivacySettings()">Save preferences</button></div></div></div>`,

    delete: `<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle" style="color:#A32D2D">Delete account</div><div style="background:#FCEBEB;border:0.5px solid #F09595;border-radius:8px;padding:11px;font-size:13px;color:#791F1F;margin-bottom:14px;line-height:1.5"><i class="ti ti-alert-triangle" style="vertical-align:-2px;margin-right:5px"></i>This permanently deletes all your food data, preferences, and account information. This cannot be undone.</div><label class="flabel">Current password</label><input class="inp" id="delete-password" type="password" placeholder="Enter your password" style="margin-bottom:10px"><label class="flabel">Type DELETE to confirm</label><input class="inp" id="delete-confirm" placeholder='Type "DELETE"' style="margin-bottom:4px"><div class="mbtn-row"><button class="mbtn-s" onclick="closeModal()">Cancel</button><button style="flex:2;background:#E24B4A;color:#fff;border:none;border-radius:8px;padding:11px;font-size:13px;font-weight:500;cursor:pointer" onclick="doDelete()">Delete my account</button></div></div></div>`,

    terms: `<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle">Terms & conditions</div><p style="font-size:13px;color:var(--txt2);line-height:1.55;margin-bottom:10px">FreshFood is a food tracking assistant. Dates, recipe suggestions, and alerts are planning aids, so users should still check food labels, smell, appearance, and local food safety guidance before eating anything.</p><p style="font-size:13px;color:var(--txt2);line-height:1.55;margin-bottom:10px">Account data is protected by Firebase Authentication and stored in Firestore with security rules that limit access to your own documents.</p><button class="mbtn-p" onclick="closeModal()" style="width:100%;margin-top:8px">Done</button></div></div>`,

    policy: `<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle">Privacy policy</div><p style="font-size:13px;color:var(--txt2);line-height:1.55;margin-bottom:10px">FreshFood stores account, food list, and preference data in Firebase with encrypted transport. You control analytics, marketing, export, and deletion from Settings.</p><p style="font-size:13px;color:var(--txt2);line-height:1.55;margin-bottom:10px">We collect only the data needed to manage food, reminders, recipes, and support requests.</p><button class="mbtn-p" onclick="closeModal()" style="width:100%;margin-top:8px">Done</button></div></div>`,

    help: `<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle">How to use FreshFood</div><div class="help-step"><div>1. Add your food</div><div>Use Fridge and Cabinet to track what you have, where it is stored, and when it expires.</div></div><div class="help-step"><div>2. Check expiring soon</div><div>FreshFood sorts soonest first so the food that needs attention stays at the top.</div></div><div class="help-step"><div>3. Scan or search manually</div><div>Use Scan for barcodes, or Search manually when a barcode is missing or the camera cannot read it.</div></div><div class="help-step"><div>4. Use recipes and restrictions</div><div>Combine recipe filters like Dessert, Gluten-free, or Under 30 min. Tap the restrictions row to hide recipes that do not fit your allergies or diet.</div></div><div class="help-step"><div>5. Manage account and privacy</div><div>Settings lets you change dark mode, account details, privacy choices, export data, sign out, or delete the account.</div></div><button class="mbtn-p" onclick="closeModal()" style="width:100%;margin-top:8px">Got it</button></div></div>`,

    support: `<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle">Contact support</div><p style="font-size:13px;color:var(--txt2);line-height:1.55;margin-bottom:12px">Need help with scans, recipes, expiry dates, account access, or data export? Send a support request and include what screen you were on plus what you expected to happen.</p><label class="flabel">Your message</label><textarea class="inp" id="support-message" style="min-height:92px;resize:none;margin-bottom:10px" placeholder="Tell us what went wrong or what you need help with"></textarea><div class="mbtn-row"><button class="mbtn-s" onclick="closeModal()">Cancel</button><button class="mbtn-p" id="support-send-btn" onclick="sendSupportRequest()">Send request</button></div></div></div>`,
  };

  openModal(modals[type] || '');
}

/** Save privacy toggles from the privacy modal to Firestore. */
export async function savePrivacySettings() {
  if (!currentUser) {
    closeModal();
    return;
  }
  const patch = {};
  document.querySelectorAll('#MODAL [data-setting]').forEach((el) => {
    patch[el.dataset.setting] = el.classList.contains('on');
  });
  try {
    showLoading('Saving…');
    await saveSettings(currentUser.uid, { ...userDoc?.settings, ...patch });
    showToast('Privacy settings saved.', 'success');
    closeModal();
  } catch (err) {
    showToast(err.message || 'Could not save settings.', 'error');
  } finally {
    hideLoading();
  }
}

/** Update display name in Auth profile and Firestore. */
export async function saveUsername() {
  const v = document.getElementById('new-uname')?.value.trim();
  if (!v) {
    showToast('Enter a username.', 'error');
    return;
  }
  if (!currentUser) {
    closeModal();
    return;
  }
  try {
    showLoading('Saving…');
    await saveProfile(currentUser.uid, { displayName: v });
    showToast('Username updated.', 'success');
    refreshAccountUI();
    closeModal();
  } catch (err) {
    showToast(err.message || 'Could not save username.', 'error');
  } finally {
    hideLoading();
  }
}

/** Request email change via Firebase verifyBeforeUpdateEmail. */
export async function saveEmail() {
  const newEmail = document.getElementById('new-email')?.value.trim();
  const confirm = document.getElementById('confirm-email')?.value.trim();
  const pass = document.getElementById('email-current-pass')?.value;
  if (!newEmail || newEmail !== confirm) {
    showToast('Enter matching email addresses.', 'error');
    return;
  }
  if (!pass) {
    showToast('Enter your current password.', 'error');
    return;
  }
  try {
    showLoading('Sending verification…');
    await changeEmail(pass, newEmail);
    showToast('Verification sent to your new email. Confirm it, then sign in again.', 'success');
    closeModal();
  } catch (err) {
    showToast(friendlyAuthError(err.code) || err.message, 'error');
  } finally {
    hideLoading();
  }
}

/** Change password after re-authentication. */
export async function savePassword() {
  const current = document.getElementById('current-password')?.value;
  const p = document.getElementById('new-password')?.value;
  const c = document.getElementById('confirm-password')?.value;
  if (!current) {
    showToast('Enter your current password.', 'error');
    return;
  }
  if (!p || p.length < 8 || p !== c) {
    showToast('Enter matching passwords of at least 8 characters.', 'error');
    return;
  }
  try {
    showLoading('Updating password…');
    await changePassword(current, p);
    showToast('Password changed.', 'success');
    closeModal();
  } catch (err) {
    showToast(friendlyAuthError(err.code) || err.message, 'error');
  } finally {
    hideLoading();
  }
}

/** Firebase password reset email modal. */
export function showForgotPassword() {
  openModal(`<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle">Reset password</div><div class="notice"><i class="ti ti-mail" style="font-size:14px;vertical-align:-2px;margin-right:5px"></i>Enter the email for your account. We will send a link to reset your password.</div><label class="flabel">Email address</label><input class="inp" id="fp-email" type="email" placeholder="your@email.com" value="${escapeHTML(getProfile().email)}" style="margin-bottom:4px"><div class="mbtn-row"><button class="mbtn-s" onclick="closeModal()">Cancel</button><button class="mbtn-p" onclick="doForgotPassword()">Send reset email</button></div></div></div>`);
}

/** Send Firebase password reset email (also bound in auth.js as doForgotPassword). */
export async function sendForgotPasswordEmail() {
  const email = document.getElementById('fp-email')?.value.trim();
  if (!email) {
    showToast('Enter your email address.', 'error');
    return;
  }
  showLoading('Sending reset email…');
  try {
    await resetPassword(email);
    showToast('Password reset email sent. Check your inbox.', 'success');
    closeModal();
  } catch (err) {
    showToast(friendlyAuthError(err.code) || err.message, 'error');
  } finally {
    hideLoading();
  }
}

/** Escape text for PDF stream content. */
function pdfText(v) {
  return String(v).replace(/[^\x20-\x7E]/g, ' ').replace(/[\\()]/g, '\\$&');
}

/** Build a minimal PDF blob of fridge + cabinet items. */
function makeFoodListPDF() {
  const profile = getProfile();
  const rows = [
    ['FreshFood Food List'],
    [`Account: ${profile.email || 'unknown'}`],
    [''],
    ['Location', 'Name', 'Category', 'Qty', 'Stored', 'Expires'],
  ];

  const addRows = (loc, items) => {
    items.slice().sort((a, b) => (a.days ?? 999) - (b.days ?? 999)).forEach((i) => {
      rows.push([
        loc,
        i.name,
        catLabel(i.cat),
        i.qty || qtyFromMeta(i.meta),
        i.purchaseDate ? fmtDate(i.purchaseDate) : '—',
        i.label || '—',
      ]);
    });
  };
  addRows('Fridge', currentFridgeItems);
  addRows('Cabinet', currentCabItems);

  const lines = rows.map((r) => (Array.isArray(r) ? r.join('  |  ') : r));
  let y = 760;
  const content = ['BT', '/F1 18 Tf', '1 0 0 1 50 790 Tm', '(FreshFood Food List) Tj', '/F1 10 Tf'];
  lines.slice(3).forEach((line) => {
    content.push(`1 0 0 1 50 ${y} Tm (${pdfText(line)}) Tj`);
    y -= 16;
  });
  content.push('ET');
  const stream = content.join('\n');
  const objs = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((o) => {
    offsets.push(pdf.length);
    pdf += o + '\n';
  });
  const xref = pdf.length;
  pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map((n) => String(n).padStart(10, '0') + ' 00000 n ').join('\n') + '\n';
  pdf += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

/** Download pantry data as PDF. */
export function doExport() {
  if (!currentFridgeItems.length && !currentCabItems.length) {
    showToast('Nothing to export — add items first.', 'error');
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(makeFoodListPDF());
  a.download = 'FreshFood-food-list.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  closeModal();
  showToast('PDF exported.', 'success');
}

/** Delete Firebase Auth account and Firestore data after confirmation. */
export async function doDelete() {
  const confirm = document.getElementById('delete-confirm')?.value;
  const pass = document.getElementById('delete-password')?.value;
  if (confirm !== 'DELETE') {
    showToast('Type DELETE to confirm.', 'error');
    return;
  }
  if (!pass) {
    showToast('Enter your password.', 'error');
    return;
  }
  try {
    showLoading('Deleting account…');
    await deleteAccount(pass);
    showToast('Account deleted.', 'success');
    closeModal();
    window.goAuthScreen?.();
  } catch (err) {
    showToast(friendlyAuthError(err.code) || err.message, 'error');
  } finally {
    hideLoading();
  }
}

/** Submit support ticket to Firestore and trigger Cloud Function email. */
export async function sendSupportRequest() {
  const message = document.getElementById('support-message')?.value.trim();
  const btn = document.getElementById('support-send-btn');
  if (!message) {
    showToast('Enter a message.', 'error');
    return;
  }
  if (!currentUser) {
    showToast('Sign in to contact support.', 'error');
    return;
  }
  const profile = getProfile();
  setButtonLoading(btn, true, 'Sending…');
  try {
    // Always persist to Firestore first — works even if Cloud Function email fails.
    await submitSupportRequest(
      currentUser.uid,
      profile.email,
      profile.displayName,
      message,
    );

    // httpsCallable uses Firebase SDK (not raw fetch) — avoids browser CORS issues.
    try {
      const sendSupportEmail = httpsCallable(functions, 'sendSupportEmail');
      await sendSupportEmail({ message });
      showToast('Support request sent. We will reply by email.', 'success');
    } catch (fnErr) {
      console.warn('sendSupportEmail callable failed:', fnErr?.code, fnErr?.message);
      showToast(
        friendlyFunctionsError(fnErr) + ' Your request was saved in our system.',
        'info',
        5000,
      );
    }
    closeModal();
  } catch (err) {
    showToast(err.message || 'Could not send support request.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

/** Attach settings handlers to window for HTML onclick attributes. */
export function bindSettingsHandlers() {
  window.refreshAccountUI = refreshAccountUI;
  window.toggleDark = toggleDark;
  window.showModal = showModal;
  window.saveUsername = saveUsername;
  window.saveEmail = saveEmail;
  window.savePassword = savePassword;
  window.savePrivacySettings = savePrivacySettings;
  window.doExport = doExport;
  window.doDelete = doDelete;
  window.showForgotPassword = showForgotPassword;
  window.sendSupportRequest = sendSupportRequest;
}
