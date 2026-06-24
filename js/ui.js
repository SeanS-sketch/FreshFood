/** Toast notifications, loading overlay, and modal helpers. */
import { escapeHTML } from './utils.js';

let toastContainer = null;
let loadingEl = null;
let loadingCount = 0;

function ensureToastContainer() {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-stack';
  toastContainer.setAttribute('role', 'status');
  toastContainer.setAttribute('aria-live', 'polite');
  document.getElementById('APP')?.appendChild(toastContainer);
  return toastContainer;
}

export function showToast(message, type, duration) {
  const kind = type || 'info';
  const ms = duration || 3500;
  const stack = ensureToastContainer();
  const el = document.createElement('div');
  el.className = 'toast toast-' + kind;
  const icon = kind === 'success' ? 'circle-check' : kind === 'error' ? 'alert-circle' : 'info-circle';
  el.innerHTML = '<i class="ti ti-' + icon + '"></i><span>' + escapeHTML(message) + '</span>';
  stack.appendChild(el);
  requestAnimationFrame(function () { el.classList.add('show'); });
  setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () { el.remove(); }, 300);
  }, ms);
}

export function showLoading(label) {
  loadingCount += 1;
  const text = label || 'Loading…';
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.id = 'app-loading';
    loadingEl.innerHTML = '<div class="spinner" aria-hidden="true"></div><p></p>';
    loadingEl.setAttribute('role', 'alert');
    loadingEl.setAttribute('aria-busy', 'true');
    document.getElementById('APP')?.appendChild(loadingEl);
  }
  loadingEl.querySelector('p').textContent = text;
  loadingEl.style.display = 'flex';
}

export function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0 && loadingEl) loadingEl.style.display = 'none';
}

export function openModal(html) {
  const M = document.getElementById('MODAL');
  if (!M) return;
  M.style.display = 'block';
  M.innerHTML = html;
  M.onclick = function (e) { if (e.target === M) closeModal(); };
}

export function closeModal() {
  const M = document.getElementById('MODAL');
  if (M) {
    M.style.display = 'none';
    M.innerHTML = '';
    M.onclick = null;
  }
}

export function initConnectivityBanner() {
  const bar = document.createElement('div');
  bar.id = 'offline-bar';
  bar.hidden = true;
  bar.textContent = 'You are offline. Changes will sync when reconnected.';
  document.getElementById('APP')?.prepend(bar);
  const sync = function () { bar.hidden = navigator.onLine; };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

export function setButtonLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = (label || 'Working…');
  } else if (btn.dataset.origText) {
    btn.innerHTML = btn.dataset.origText;
    delete btn.dataset.origText;
  }
}
