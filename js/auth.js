/** Firebase Authentication — signup, login, logout, password reset, email change. */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { auth, functions, setAuthPersistence } from './firebase.js';
import {
  createUserDocument, touchLastLogin, ensureUserDoc, purgeUserData, subscribeUserDoc,
} from './firestore-service.js';
import { setCurrentUser, clearUserState, currentUser } from './state.js';
import { friendlyAuthError } from './utils.js';
import { showToast, showLoading, hideLoading, setButtonLoading } from './ui.js';

let authReadyResolve;
/** True after first successful sign-in listener setup — prevents re-running full app bootstrap. */
let authSessionActive = false;

export const authReady = new Promise((r) => { authReadyResolve = r; });

/** Map auth state changes to app bootstrap / teardown. */
export function initAuth(onSignedIn, onSignedOut, onUserDocChange) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Reload Auth user so email/displayName reflect verifyBeforeUpdateEmail completion.
      try {
        await user.reload();
      } catch {
        /* offline or transient — use cached user */
      }
      const freshUser = auth.currentUser || user;
      setCurrentUser(freshUser);

      if (!freshUser.emailVerified) {
        authSessionActive = false;
        onSignedOut?.('verify');
        authReadyResolve?.();
        return;
      }
      try {
        await ensureUserDoc(
          freshUser.uid,
          freshUser.email,
          freshUser.displayName || freshUser.email.split('@')[0],
        );
        await touchLastLogin(freshUser.uid);

        // Firestore snapshots fire on every preference/pantry write — must NOT re-navigate the app.
        subscribeUserDoc(
          freshUser.uid,
          () => onUserDocChange?.(freshUser),
          (err) => {
            showToast(err.message || 'Could not load your data.', 'error');
          },
        );

        if (!authSessionActive) {
          authSessionActive = true;
          onSignedIn?.(freshUser);
        }
      } catch (err) {
        showToast(friendlyAuthError(err.code) || err.message, 'error');
        onSignedOut?.();
      }
    } else {
      authSessionActive = false;
      clearUserState();
      onSignedOut?.();
    }
    authReadyResolve?.();
  });
}

/** Sign up with email/password and send verification email. */
export async function signup(username, email, password) {
  await setAuthPersistence(true);
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: username });
  await createUserDocument(cred.user.uid, email, username);
  await sendEmailVerification(cred.user);
  try {
    const sendWelcome = httpsCallable(functions, 'sendWelcomeEmail');
    await sendWelcome({ email, displayName: username });
  } catch { /* welcome email is best-effort */ }
  await signOut(auth);
  return cred.user;
}

/** Log in — blocks unverified accounts. */
export async function login(email, password, rememberMe) {
  await setAuthPersistence(rememberMe);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  if (!cred.user.emailVerified) {
    await signOut(auth);
    const err = new Error('Please verify your email before signing in.');
    err.code = 'auth/email-not-verified';
    throw err;
  }
  return cred.user;
}

/** Resend verification email for address on verification screen. */
export async function resendVerification(email, password) {
  await setAuthPersistence(false);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(cred.user);
  await signOut(auth);
}

/** Sign out current user. */
export async function logout() {
  await signOut(auth);
  clearUserState();
}

/** Firebase password reset email. */
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

/** Change password after re-authentication. */
export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

/** Change email — Firebase sends verification to new address first. */
export async function changeEmail(currentPassword, newEmail) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await verifyBeforeUpdateEmail(user, newEmail);
}

/** Delete Firebase Auth account and Firestore data. */
export async function deleteAccount(currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await purgeUserData(user.uid);
  await deleteUser(user);
  clearUserState();
}

/** Wire auth form buttons in index.html. */
export function bindAuthUI(handlers) {
  window.doLogin = async () => {
    const email = document.getElementById('login-email')?.value.trim();
    const pass = document.getElementById('login-password')?.value;
    const remember = document.getElementById('login-remember')?.checked;
    const btn = document.querySelector('#auth-login-form button');
    if (!email || !pass) { showToast('Enter your email and password.', 'error'); return; }
    setButtonLoading(btn, true, 'Signing in…');
    showLoading('Signing in…');
    try {
      await login(email, pass, remember);
      showToast('Welcome back!', 'success');
      handlers.onLoginSuccess?.();
    } catch (err) {
      const msg = err.code === 'auth/email-not-verified'
        ? 'Verify your email before signing in. Check your inbox or resend below.'
        : friendlyAuthError(err.code);
      showToast(msg, 'error');
      if (err.code === 'auth/email-not-verified') handlers.showVerifyScreen?.(email, pass);
    } finally {
      setButtonLoading(btn, false);
      hideLoading();
    }
  };

  window.doSignup = async () => {
    const username = document.getElementById('signup-username')?.value.trim();
    const email = document.getElementById('signup-email')?.value.trim();
    const pass = document.getElementById('signup-password')?.value;
    const pass2 = document.getElementById('signup-password2')?.value;
    const btn = document.querySelector('#auth-signup-form button');
    if (!username || !email || !pass) { showToast('Fill in all fields.', 'error'); return; }
    if (pass.length < 8) { showToast('Password must be at least 8 characters.', 'error'); return; }
    if (pass !== pass2) { showToast('Passwords do not match.', 'error'); return; }
    setButtonLoading(btn, true, 'Creating account…');
    showLoading('Creating account…');
    try {
      await signup(username, email, pass);
      showToast('Account created! Check your email to verify before signing in.', 'success');
      window.setAuthTab('login');
      document.getElementById('login-email').value = email;
    } catch (err) {
      showToast(friendlyAuthError(err.code), 'error');
    } finally {
      setButtonLoading(btn, false);
      hideLoading();
    }
  };

  window.doForgotPassword = async () => {
    const email = document.getElementById('fp-email')?.value.trim();
    const pass = document.getElementById('fp-pass')?.value;
    const pass2 = document.getElementById('fp-pass2')?.value;
    if (!email) { showToast('Enter your email address.', 'error'); return; }
    if (pass || pass2) {
      showToast('Use the link in your email to set a new password.', 'info');
      return;
    }
    showLoading('Sending reset email…');
    try {
      await resetPassword(email);
      showToast('Password reset email sent. Check your inbox.', 'success');
      window.closeModal();
    } catch (err) {
      showToast(friendlyAuthError(err.code), 'error');
    } finally {
      hideLoading();
    }
  };

  window.resendVerificationEmail = async () => {
    const email = document.getElementById('verify-email')?.value.trim();
    const pass = document.getElementById('verify-pass')?.value;
    if (!email || !pass) { showToast('Enter email and password to resend.', 'error'); return; }
    showLoading('Sending verification…');
    try {
      await resendVerification(email, pass);
      showToast('Verification email sent.', 'success');
    } catch (err) {
      showToast(friendlyAuthError(err.code), 'error');
    } finally {
      hideLoading();
    }
  };

  window.goAuth = async () => {
    showLoading('Signing out…');
    try {
      await logout();
      handlers.onLogout?.();
    } finally {
      hideLoading();
    }
  };
}

export { currentUser };
