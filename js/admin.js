/**
 * Supervisor dashboard — user stats, feedback, and support ticket management.
 * Only accessible when isAdmin() returns true (profile.role === 'admin').
 */
import { isAdmin, currentUser } from './state.js';
import { escapeHTML } from './utils.js';
import { showToast, showLoading, hideLoading } from './ui.js';
import { fetchAdminStats, updateSupportStatus } from './firestore-service.js';
import { showScr } from './navigation.js';

let cachedStats = null;

/** Guard — redirect non-admins away from admin screens. */
function requireAdmin() {
  if (!isAdmin()) {
    showToast('Admin access required.', 'error');
    return false;
  }
  return true;
}

/** Format Firestore timestamp or ISO string for display. */
function formatTimestamp(value) {
  if (!value) return '—';
  try {
    const d = value.toDate ? value.toDate() : new Date(value);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(value);
  }
}

/** Render dashboard HTML into #admin-dashboard. */
export async function renderAdminDashboard() {
  const container = document.getElementById('admin-dashboard');
  if (!container || !requireAdmin()) return;

  showLoading('Loading admin data…');
  try {
    cachedStats = await fetchAdminStats();
    const { totalUsers, totalPantryItems, supportRequests, feedback } = cachedStats;

    const openTickets = supportRequests.filter((r) => r.status === 'open').length;

    container.innerHTML = `
      <div style="background:#185FA5;padding:16px 15px;color:#fff">
        <div style="font-size:16px;font-weight:500;margin-bottom:4px">Supervisor dashboard</div>
        <div style="font-size:12px;opacity:.85">FreshFood analytics & support</div>
      </div>
      <div class="pad" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:var(--bg0);border:0.5px solid var(--bdr);border-radius:12px;padding:14px;text-align:center">
          <div style="font-size:22px;font-weight:600;color:var(--txt)">${totalUsers}</div>
          <div style="font-size:12px;color:var(--txt2);margin-top:4px">Total users</div>
        </div>
        <div style="background:var(--bg0);border:0.5px solid var(--bdr);border-radius:12px;padding:14px;text-align:center">
          <div style="font-size:22px;font-weight:600;color:var(--txt)">${totalPantryItems}</div>
          <div style="font-size:12px;color:var(--txt2);margin-top:4px">Pantry items</div>
        </div>
        <div style="background:var(--bg0);border:0.5px solid var(--bdr);border-radius:12px;padding:14px;text-align:center;grid-column:span 2">
          <div style="font-size:22px;font-weight:600;color:#A32D2D">${openTickets}</div>
          <div style="font-size:12px;color:var(--txt2);margin-top:4px">Open support tickets</div>
        </div>
      </div>
      <div class="slbl">Support requests</div>
      <div id="admin-support-list">
        ${supportRequests.length ? supportRequests.map(renderSupportRow).join('') : '<p style="padding:12px 15px;font-size:13px;color:var(--txt2)">No support requests yet.</p>'}
      </div>
      <div class="slbl">Recent feedback</div>
      <div id="admin-feedback-list">
        ${feedback.length ? feedback.slice(0, 10).map(renderFeedbackRow).join('') : '<p style="padding:12px 15px;font-size:13px;color:var(--txt2)">No feedback yet.</p>'}
      </div>
      <div style="padding:16px;text-align:center">
        <button onclick="goBottom('settings')" style="background:var(--bg2);color:var(--txt);border:0.5px solid var(--bdr);border-radius:8px;padding:10px 16px;font-size:13px;cursor:pointer">Back to settings</button>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="padding:16px;color:var(--txt2);font-size:13px">${escapeHTML(err.message || 'Could not load admin data.')}</p>`;
    showToast(err.message || 'Could not load admin dashboard.', 'error');
  } finally {
    hideLoading();
  }
}

/** Single support ticket row with status actions. */
function renderSupportRow(req) {
  const status = req.status || 'open';
  const statusColor = status === 'open' ? '#A32D2D' : status === 'resolved' ? '#27500A' : 'var(--txt2)';
  return `
    <div class="rc" style="margin:0 15px 8px">
      <div class="rtop">
        <div class="rn">${escapeHTML(req.displayName || 'User')}</div>
        <span style="font-size:11px;color:${statusColor};font-weight:500;text-transform:capitalize">${escapeHTML(status)}</span>
      </div>
      <div style="font-size:12px;color:var(--txt2);margin-bottom:6px">${escapeHTML(req.email || '')} · ${formatTimestamp(req.createdAt)}</div>
      <p style="font-size:13px;color:var(--txt);line-height:1.45;margin-bottom:10px">${escapeHTML(req.message || '')}</p>
      <div style="display:flex;gap:8px">
        ${status !== 'resolved' ? `<button onclick="updateSupportTicket('${req.id}','resolved')" style="flex:1;background:#EAF3DE;color:#27500A;border:none;border-radius:8px;padding:8px;font-size:12px;cursor:pointer">Mark resolved</button>` : ''}
        ${status !== 'closed' ? `<button onclick="updateSupportTicket('${req.id}','closed')" style="flex:1;background:var(--bg2);color:var(--txt2);border:0.5px solid var(--bdr);border-radius:8px;padding:8px;font-size:12px;cursor:pointer">Close</button>` : ''}
      </div>
    </div>
  `;
}

/** Single feedback entry row. */
function renderFeedbackRow(entry) {
  return `
    <div class="fc" style="cursor:default;margin:0 15px 8px">
      <div style="flex:1;min-width:0">
        <div class="fn">${escapeHTML(entry.email || 'Anonymous')} · ${'★'.repeat(entry.rating || 0)}</div>
        <div class="fm">${escapeHTML(entry.message || '')}</div>
      </div>
      <span style="font-size:11px;color:var(--txt2)">${formatTimestamp(entry.createdAt)}</span>
    </div>
  `;
}

/** Navigate to admin screen and load dashboard data. */
export function showAdminScreen() {
  if (!requireAdmin()) return;
  document.querySelectorAll('.btab').forEach((b) => b.classList.remove('on'));
  showScr('s-admin');
  renderAdminDashboard();
}

/** Update support ticket status in Firestore and refresh list. */
export async function updateSupportTicket(requestId, status) {
  if (!requireAdmin() || !currentUser) return;
  try {
    showLoading('Updating ticket…');
    await updateSupportStatus(requestId, status);
    showToast(`Ticket marked ${status}.`, 'success');
    await renderAdminDashboard();
  } catch (err) {
    showToast(err.message || 'Could not update ticket.', 'error');
  } finally {
    hideLoading();
  }
}

/** Attach admin handlers to window for HTML onclick attributes. */
export function bindAdminHandlers() {
  window.renderAdminDashboard = renderAdminDashboard;
  window.showAdminScreen = showAdminScreen;
  window.updateSupportTicket = updateSupportTicket;
}
