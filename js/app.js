/**
 * FreshFood main entry point (ES module).
 * Bootstraps Firebase, auth, navigation, and UI refresh on sign-in/out.
 */
import { connectEmulatorsIfDev, enableOfflinePersistence } from './firebase.js';
import { initAuth, bindAuthUI } from './auth.js';
import { initConnectivityBanner, closeModal } from './ui.js';
import { initNavigation, showMainApp, goAuthScreen, showVerifyScreen } from './navigation.js';
import { bindRecipeHandlers, renderRec, updateRecipeAlert } from './recipes.js';
import { bindSettingsHandlers, refreshAccountUI } from './settings.js';
import {
  bindNotificationHandlers,
  initNotificationsUI,
  renderInAppNotifications,
  checkExpiryNotifications,
} from './notifications.js';
import { bindAdminHandlers, renderAdminDashboard } from './admin.js';
import { isAdmin } from './state.js';
import { renderFridge, renderCab, updateFridgeAlert, bindPantryHandlers } from './pantry.js';
import { renderShoppingList, bindShoppingHandlers } from './shopping.js';
import './scan.js';

/** Live device clock in the status bar. */
function startDeviceClock() {
  const el = document.getElementById('device-time');
  if (!el) return;

  const tick = () => {
    el.textContent = new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  };
  tick();
  setInterval(tick, 1000);
}

/** Refresh data-driven UI after sign-in (includes navigation to home). */
async function refreshAppUI() {
  await refreshUserDocUI();
  checkExpiryNotifications(false);
}

/** Refresh UI after Firestore sync without changing the current screen/tab. */
async function refreshUserDocUI() {
  await refreshAccountUI();
  initNotificationsUI();

  renderFridge('all');
  renderCab('all');
  updateFridgeAlert();
  renderShoppingList();

  renderRec();
  updateRecipeAlert();
  renderInAppNotifications();

  if (isAdmin()) {
    const adminScr = document.getElementById('s-admin');
    if (adminScr?.classList.contains('on')) {
      renderAdminDashboard();
    }
  }
}

/** Wire global closeModal for inline onclick handlers in dynamically built HTML. */
function bindGlobalUI() {
  window.closeModal = closeModal;
}

/** Register window handlers and start Firebase auth listener. */
function bootstrap() {
  connectEmulatorsIfDev();
  enableOfflinePersistence();

  initNavigation();
  bindGlobalUI();
  bindRecipeHandlers();
  bindSettingsHandlers();
  bindNotificationHandlers();
  bindAdminHandlers();
  bindPantryHandlers();
  bindShoppingHandlers();
  startDeviceClock();

  bindAuthUI({
    onLoginSuccess: () => {
      showMainApp();
      refreshAppUI();
    },
    onLogout: (reason) => {
      if (reason === 'verify') {
        goAuthScreen();
      } else {
        goAuthScreen();
      }
    },
    showVerifyScreen,
  });

  initAuth(
    () => {
      showMainApp();
      refreshAppUI();
    },
    (reason) => {
      if (reason === 'verify') {
        showVerifyScreen();
      } else {
        goAuthScreen();
      }
    },
    () => {
      // Realtime Firestore updates — refresh data only, stay on current tab (fixes Alerts redirect).
      refreshUserDocUI();
      checkExpiryNotifications(true);
    },
  );

  initConnectivityBanner();
}

bootstrap();
