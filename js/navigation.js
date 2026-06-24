/**
 * Screen routing — top tabs, bottom nav, auth, and email verification flows.
 * Exposes window.* handlers used by inline onclick attributes in index.html.
 */

/** Show one screen panel and hide all others. */
export function showScr(id) {
  document.querySelectorAll('.scr').forEach((s) => s.classList.remove('on'));
  const target = document.getElementById(id);
  if (target) target.classList.add('on');
}

/** Top tab navigation (fridge, cabinet, recipes, shopping). */
export function goMain(tab) {
  window.stopBarcodeScan?.();
  document.querySelectorAll('.ntab').forEach((t) => t.classList.remove('on'));
  document.getElementById('nt-' + tab)?.classList.add('on');
  showScr('s-' + tab);
  document.querySelectorAll('.btab').forEach((b) => b.classList.remove('on'));
  document.getElementById('bt-home')?.classList.add('on');
}

/** Bottom navigation (home, scan, alerts, settings). */
export function goBottom(tab) {
  document.querySelectorAll('.btab').forEach((b) => b.classList.remove('on'));
  document.getElementById('bt-' + tab)?.classList.add('on');
  document.querySelectorAll('.ntab').forEach((t) => t.classList.remove('on'));
  if (tab === 'home') {
    showScr('s-fridge');
    document.getElementById('nt-fridge')?.classList.add('on');
  } else {
    showScr('s-' + tab);
  }
  // Do not auto-start camera — user taps "Enable camera" after granting permission.
  if (tab !== 'scan') window.stopBarcodeScan?.();
  if (tab === 'settings') window.refreshAccountUI?.();
}

/** Signed-out state — hide main chrome and show login/signup screen. */
export function goAuthScreen() {
  const ntab = document.getElementById('NTAB');
  const bnav = document.getElementById('BNAV');
  if (ntab) ntab.style.display = 'none';
  if (bnav) bnav.style.display = 'none';
  showScr('s-auth');
  setAuthTab('login');
}

/** Signed-in state — show main chrome and land on fridge home. */
export function showMainApp() {
  const ntab = document.getElementById('NTAB');
  const bnav = document.getElementById('BNAV');
  if (ntab) ntab.style.display = '';
  if (bnav) bnav.style.display = '';
  document.querySelectorAll('.ntab, .btab').forEach((t) => t.classList.remove('on'));
  showScr('s-fridge');
  document.getElementById('nt-fridge')?.classList.add('on');
  document.getElementById('bt-home')?.classList.add('on');
}

/** Email verification gate — show verify screen with optional pre-filled credentials. */
export function showVerifyScreen(email, password) {
  const ntab = document.getElementById('NTAB');
  const bnav = document.getElementById('BNAV');
  if (ntab) ntab.style.display = 'none';
  if (bnav) bnav.style.display = 'none';
  showScr('s-verify');

  const emailEl = document.getElementById('verify-email');
  const passEl = document.getElementById('verify-pass');
  if (emailEl && email) emailEl.value = email;
  if (passEl && password) passEl.value = password;
}

/** Switch between login and signup forms on the auth screen. */
export function setAuthTab(tab) {
  const loginForm = document.getElementById('auth-login-form');
  const signupForm = document.getElementById('auth-signup-form');
  const loginTab = document.getElementById('auth-login-tab');
  const signupTab = document.getElementById('auth-signup-tab');
  if (!loginForm || !signupForm || !loginTab || !signupTab) return;

  loginForm.style.display = tab === 'login' ? 'block' : 'none';
  signupForm.style.display = tab === 'signup' ? 'block' : 'none';
  loginTab.style.background = tab === 'login' ? '#185FA5' : 'var(--bg1)';
  loginTab.style.color = tab === 'login' ? '#fff' : 'var(--txt2)';
  loginTab.style.border = tab === 'login' ? 'none' : '0.5px solid var(--bdr)';
  signupTab.style.background = tab === 'signup' ? '#185FA5' : 'var(--bg1)';
  signupTab.style.color = tab === 'signup' ? '#fff' : 'var(--txt2)';
  signupTab.style.border = tab === 'signup' ? 'none' : '0.5px solid var(--bdr)';
}

/** Register navigation handlers on window and set initial screen visibility. */
export function initNavigation() {
  window.goMain = goMain;
  window.goBottom = goBottom;
  window.showScr = showScr;
  window.goAuthScreen = goAuthScreen;
  window.showMainApp = showMainApp;
  window.showVerifyScreen = showVerifyScreen;
  window.setAuthTab = setAuthTab;
}
