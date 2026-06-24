/**
 * Pantry UI — fridge & cabinet lists, search, sort, bulk actions, and Firestore sync.
 * Days remaining are always computed via enrichPantryItem (never stored in Firestore).
 */
import {
  currentFridgeItems,
  currentCabItems,
  allFood,
  currentUser,
  bulkSelectMode,
  bulkSelectedIds,
  fridgeSearch,
  cabSearch,
  fridgeSort,
  cabSort,
  toggleBulkId,
  clearBulkSelection,
} from './state.js';
import {
  escapeHTML,
  enrichPantryItem,
  sortByExpiry,
  pickIcon,
  newId,
  catLabel,
  qtyFromMeta,
} from './utils.js';
import { FRIDGE_CATS, CAB_CATS, EXPIRY, CAT_BG } from './constants.js';
import { savePantry } from './firestore-service.js';
import { openModal, closeModal, showToast, showLoading, hideLoading } from './ui.js';

/** Module-local UI state (imported `let` bindings from state.js cannot be reassigned here). */
let pantryBulkActive = false;
let localFridgeSearch = '';
let localCabSearch = '';
let localFridgeSort = 'expiry';
let localCabSort = 'expiry';
let activeFridgeFilter = 'all';
let activeCabFilter = 'all';

/** Section dividers shown when rendering grouped expiry lists. */
const EXPIRY_SECTIONS = [
  { label: 'Expired', match: (days) => days <= 0 },
  { label: 'Expiring Soon', match: (days) => days > 0 && days <= EXPIRY.SOON_DAYS },
  { label: 'Fresh', match: (days) => days > EXPIRY.SOON_DAYS },
];

/** Rebuild the combined allFood array after local pantry edits. */
function syncAllFood() {
  allFood.length = 0;
  allFood.push(...currentFridgeItems, ...currentCabItems);
}

/** Whether bulk-select UI should be shown. */
function isBulkMode() {
  return pantryBulkActive || bulkSelectMode;
}

/** Persist pantry arrays to Firestore and surface errors via toast. */
async function persistPantry() {
  const uid = currentUser?.uid;
  if (!uid) {
    showToast('Sign in to save changes.', 'error');
    return false;
  }
  showLoading('Saving…');
  try {
    await savePantry(uid, currentFridgeItems, currentCabItems);
    syncAllFood();
    return true;
  } catch (err) {
    showToast(err.message || 'Could not save pantry.', 'error');
    return false;
  } finally {
    hideLoading();
  }
}

/** Normalize legacy field names (expDate / storedDate) from older data. */
function rawDates(item) {
  return {
    purchaseDate: item.purchaseDate || item.storedDate || null,
    expirationDate: item.expirationDate || item.expDate || null,
  };
}

/** Build a stored pantry record (no computed display fields). */
function buildStoredItem(name, cat, qty, purchaseDate, expirationDate, location, favorite = false) {
  return enrichPantryItem({
    id: newId(),
    name,
    cat,
    qty: qty || '—',
    purchaseDate,
    expirationDate,
    favorite,
    location,
  });
}

/** Apply category pill filter plus optional expiring shortcut. */
function applyCategoryFilter(items, filter) {
  if (filter === 'all') return items;
  if (filter === 'expiring') {
    return items.filter((i) => typeof i.days === 'number' && i.days <= EXPIRY.SOON_DAYS);
  }
  return items.filter((i) => i.cat === filter);
}

/** Case-insensitive search across name, category label, quantity, and meta. */
function applySearch(items, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => {
    const blob = `${i.name} ${i.cat} ${catLabel(i.cat)} ${i.qty || ''} ${i.meta || ''}`.toLowerCase();
    return blob.includes(q);
  });
}

/** Sort pantry items by expiry, name, or category. */
function applySort(items, mode) {
  const list = [...items];
  if (mode === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }
  if (mode === 'category') {
    list.sort((a, b) => catLabel(a.cat).localeCompare(catLabel(b.cat)) || a.name.localeCompare(b.name));
    return list;
  }
  return sortByExpiry(list);
}

/** Resolve item list and DOM container for a storage location. */
function listForLoc(loc) {
  return loc === 'fridge' ? currentFridgeItems : currentCabItems;
}

function containerIdForLoc(loc) {
  return loc === 'fridge' ? 'fridge-list' : 'cab-list';
}

/** Find item index in the full location array by stable id. */
function indexById(loc, id) {
  return listForLoc(loc).findIndex((i) => i.id === id);
}

/** HTML for a single pantry row (fc = food card). */
function makeFC(item, loc) {
  const selected = bulkSelectedIds.has(item.id);
  const favClass = item.favorite ? ' fav-on' : '';
  const checkbox = isBulkMode()
    ? `<input type="checkbox" class="bulk-chk" ${selected ? 'checked' : ''} onclick="event.stopPropagation();toggleBulkCheck('${escapeHTML(item.id)}')" aria-label="Select ${escapeHTML(item.name)}">`
    : '';
  const favBtn = `<button type="button" class="fav-btn${favClass}" onclick="event.stopPropagation();toggleFavorite('${loc}','${escapeHTML(item.id)}')" aria-label="Favorite">${item.favorite ? '★' : '☆'}</button>`;
  const openAttr = isBulkMode() ? '' : `onclick="openFoodItem('${loc}','${escapeHTML(item.id)}')"`;

  return `<div class="fc${selected ? ' bulk-on' : ''}" ${openAttr}>
    ${checkbox}
    <div class="ficon" style="background:${item.bg}">${item.icon}</div>
    <div style="flex:1;min-width:0">
      <div class="fn">${escapeHTML(item.name)}</div>
      <div class="fm">${escapeHTML(item.meta)}</div>
    </div>
    ${favBtn}
    <span class="eb ${item.badge}">${escapeHTML(item.label)}</span>
  </div>`;
}

/** Render filtered items grouped under sdv section headers. */
function renderGroupedList(items, loc) {
  if (!items.length) {
    return '<div style="text-align:center;padding:24px;color:var(--txt2)"><i class="ti ti-mood-empty" style="font-size:28px;display:block;margin-bottom:8px"></i>No items here</div>';
  }
  let html = '';
  for (const section of EXPIRY_SECTIONS) {
    const sectionItems = items.filter((i) => section.match(i.days));
    if (!sectionItems.length) continue;
    html += `<div class="sdv">${section.label}</div>`;
    html += sectionItems.map((i) => makeFC(i, loc)).join('');
  }
  return html;
}

/** Toggle bulk-action toolbar visibility when present in the DOM. */
function updateBulkBar(loc) {
  const barId = loc === 'fridge' ? 'fridge-bulk-bar' : 'cab-bulk-bar';
  const bar = document.getElementById(barId);
  if (!bar) return;
  const active = isBulkMode();
  bar.style.display = active ? 'flex' : 'none';
  const countEl = bar.querySelector('[data-bulk-count]');
  if (countEl) countEl.textContent = String(bulkSelectedIds.size);
}

/** Core render pipeline for one pantry location. */
function renderLocation(loc, filter) {
  const container = document.getElementById(containerIdForLoc(loc));
  if (!container) return;

  const search = loc === 'fridge'
    ? (localFridgeSearch || fridgeSearch)
    : (localCabSearch || cabSearch);
  const sortMode = loc === 'fridge'
    ? (localFridgeSort || fridgeSort)
    : (localCabSort || cabSort);

  let items = listForLoc(loc).map((i) => enrichPantryItem({ ...i, location: loc }));
  items = applyCategoryFilter(items, filter);
  items = applySearch(items, search);
  items = applySort(items, sortMode);

  container.innerHTML = renderGroupedList(items, loc);
  updateBulkBar(loc);

  // Keep search/sort inputs in sync when those controls exist in the page.
  const searchEl = document.getElementById(loc === 'fridge' ? 'fridge-search' : 'cab-search');
  if (searchEl && searchEl.value !== search) searchEl.value = search;
  const sortEl = document.getElementById(loc === 'fridge' ? 'fridge-sort' : 'cab-sort');
  if (sortEl && sortEl.value !== sortMode) sortEl.value = sortMode;
}

/** Show banner when fridge items expire within EXPIRY.ALERT_DAYS. */
export function updateFridgeAlert() {
  const exp = currentFridgeItems
    .map((i) => enrichPantryItem({ ...i, location: 'fridge' }))
    .filter((i) => typeof i.days === 'number' && i.days <= EXPIRY.ALERT_DAYS);
  const el = document.getElementById('fridge-alert');
  const txt = document.getElementById('fridge-alert-text');
  if (!el || !txt) return;
  if (!exp.length) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  const names = exp.slice(0, 3).map((i) => i.name.split(' ').pop().toLowerCase()).join(', ');
  txt.innerHTML = `<strong>${exp.length} item${exp.length > 1 ? 's' : ''} expiring soon</strong> — ${escapeHTML(names)}${exp.length > 3 ? ' & more' : ''}.`;
}

/** Render the fridge list with the active category filter. */
export function renderFridge(filter = activeFridgeFilter) {
  activeFridgeFilter = filter;
  renderLocation('fridge', filter);
  updateFridgeAlert();
}

/** Render the cabinet list with the active category filter. */
export function renderCab(filter = activeCabFilter) {
  activeCabFilter = filter;
  renderLocation('cabinet', filter);
}

/** Category pill click — fridge. */
export function fFilter(f, el) {
  document.querySelectorAll('#fridge-pills .fp').forEach((p) => p.classList.remove('on'));
  if (el) el.classList.add('on');
  renderFridge(f);
}

/** Category pill click — cabinet. */
export function cFilter(f, el) {
  document.querySelectorAll('#cab-pills .fp').forEach((p) => p.classList.remove('on'));
  if (el) el.classList.add('on');
  renderCab(f);
}

/** Update fridge search query and re-render. */
export function setFridgeSearch(query) {
  localFridgeSearch = query || '';
  renderFridge(activeFridgeFilter);
}

/** Update cabinet search query and re-render. */
export function setCabSearch(query) {
  localCabSearch = query || '';
  renderCab(activeCabFilter);
}

/** Change fridge sort mode (expiry | name | category). */
export function setFridgeSort(mode) {
  localFridgeSort = mode || 'expiry';
  renderFridge(activeFridgeFilter);
}

/** Change cabinet sort mode (expiry | name | category). */
export function setCabSort(mode) {
  localCabSort = mode || 'expiry';
  renderCab(activeCabFilter);
}

/** Enter or exit bulk-select mode (optional loc scopes visible bulk bar). */
export function toggleBulkMode(loc) {
  if (pantryBulkActive || bulkSelectMode) {
    pantryBulkActive = false;
    clearBulkSelection();
  } else {
    pantryBulkActive = true;
  }
  renderFridge(activeFridgeFilter);
  renderCab(activeCabFilter);
  if (loc) updateBulkBar(loc);
}

/** Toggle favorite flag on a pantry item and save. */
export async function toggleFavorite(loc, id) {
  const list = listForLoc(loc);
  const idx = indexById(loc, id);
  if (idx < 0) return;
  list[idx] = enrichPantryItem({
    ...list[idx],
    favorite: !list[idx].favorite,
    location: loc,
  });
  if (await persistPantry()) {
    renderFridge(activeFridgeFilter);
    renderCab(activeCabFilter);
  }
}

/** Open modal to add a new food item to fridge or cabinet. */
export function showAddFood(loc) {
  const cats = loc === 'fridge' ? FRIDGE_CATS : CAB_CATS;
  const opts = Object.entries(cats).map(([k, v]) => `<option value="${k}">${escapeHTML(v)}</option>`).join('');
  const defDate = new Date();
  defDate.setDate(defDate.getDate() + 7);
  const defStr = defDate.toISOString().slice(0, 10);

  openModal(`<div class="modal-wrap"><div class="modal">
    <div class="mhdl"></div>
    <div class="mtitle">Add to ${loc === 'fridge' ? 'fridge' : 'cabinet'}</div>
    <label class="flabel">Food name</label>
    <input class="inp" id="food-name" placeholder="e.g. Cheddar cheese, Baby spinach" style="margin-bottom:10px" oninput="previewFoodIcon()">
    <div id="food-icon-preview" style="display:flex;align-items:center;gap:8px;margin:-4px 0 10px;font-size:13px;color:var(--txt2)">
      <span style="font-size:22px" id="food-preview-emoji">🍽️</span><span>Icon preview</span>
    </div>
    <label class="flabel">Category</label>
    <select class="inp" id="food-cat" style="margin-bottom:10px" onchange="previewFoodIcon()">${opts}</select>
    <label class="flabel">Quantity / details</label>
    <input class="inp" id="food-qty" placeholder="e.g. 200g, 2 cans, block" style="margin-bottom:10px">
    <label class="flabel">Date bought / stored <span style="font-weight:400">(optional)</span></label>
    <input class="inp" id="food-stored" type="date" style="margin-bottom:10px">
    <label class="flabel">Expiration date</label>
    <input class="inp" id="food-exp" type="date" value="${defStr}" style="margin-bottom:4px">
    <div class="mbtn-row">
      <button class="mbtn-s" onclick="closeModal()">Cancel</button>
      <button class="mbtn-p" onclick="saveNewFood('${loc}')">Add item</button>
    </div>
  </div></div>`);
  previewFoodIcon();
}

/** Live icon preview while typing in the add-food modal. */
function previewFoodIcon() {
  const name = document.getElementById('food-name')?.value || '';
  const cat = document.getElementById('food-cat')?.value || 'produce';
  const el = document.getElementById('food-preview-emoji');
  if (el) el.textContent = pickIcon(name, cat);
}

/** Save a newly added food item from the add modal. */
export async function saveNewFood(loc) {
  const name = document.getElementById('food-name')?.value.trim();
  const cat = document.getElementById('food-cat')?.value;
  const qty = document.getElementById('food-qty')?.value.trim() || '—';
  const exp = document.getElementById('food-exp')?.value;
  const stored = document.getElementById('food-stored')?.value || null;
  if (!name) {
    showToast('Enter a food name.', 'error');
    return;
  }
  const item = buildStoredItem(name, cat, qty, stored, exp, loc, false);
  listForLoc(loc).push(item);
  if (await persistPantry()) {
    closeModal();
    showToast('Item added.', 'success');
    renderFridge(activeFridgeFilter);
    renderCab(activeCabFilter);
  }
}

/** Open edit modal for an existing pantry item (by id). */
export function openFoodItem(loc, id) {
  if (isBulkMode()) return;
  const list = listForLoc(loc);
  const idx = indexById(loc, id);
  const item = list[idx];
  if (!item) return;

  const cats = loc === 'fridge' ? FRIDGE_CATS : CAB_CATS;
  const opts = Object.entries(cats).map(([k, v]) =>
    `<option value="${k}" ${item.cat === k ? 'selected' : ''}>${escapeHTML(v)}</option>`
  ).join('');
  const dates = rawDates(item);
  const exp = dates.expirationDate || (() => {
    const d = new Date();
    d.setDate(d.getDate() + (item.days || 7));
    return d.toISOString().slice(0, 10);
  })();
  const qty = item.qty || qtyFromMeta(item.meta);

  openModal(`<div class="modal-wrap"><div class="modal">
    <div class="mhdl"></div>
    <div class="mtitle">Edit item</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div class="ficon" id="edit-icon-preview" style="background:${item.bg}">${item.icon}</div>
      <span style="font-size:12px;color:var(--txt2)">Icon updates from name & category</span>
    </div>
    <label class="flabel">Food name</label>
    <input class="inp" id="edit-name" style="margin-bottom:10px" oninput="previewEditIcon()">
    <label class="flabel">Category</label>
    <select class="inp" id="edit-cat" style="margin-bottom:10px" onchange="previewEditIcon()">${opts}</select>
    <label class="flabel">Quantity / details</label>
    <input class="inp" id="edit-qty" style="margin-bottom:10px">
    <label class="flabel">Date bought / stored <span style="font-weight:400">(optional)</span></label>
    <input class="inp" id="edit-stored" type="date" style="margin-bottom:10px">
    <label class="flabel">Expiration date</label>
    <input class="inp" id="edit-exp" type="date" style="margin-bottom:14px">
    <div class="mbtn-row">
      <button style="flex:1;background:#FCEBEB;color:#A32D2D;border:0.5px solid #F09595;border-radius:8px;padding:11px;font-size:13px;font-weight:500;cursor:pointer" onclick="deleteFoodItem('${loc}','${escapeHTML(id)}')">Delete</button>
      <button class="mbtn-s" onclick="closeModal()">Cancel</button>
      <button class="mbtn-p" onclick="saveEditedFood('${loc}','${escapeHTML(id)}')">Save</button>
    </div>
  </div></div>`);

  document.getElementById('edit-name').value = item.name;
  document.getElementById('edit-qty').value = qty;
  document.getElementById('edit-exp').value = exp;
  if (dates.purchaseDate) document.getElementById('edit-stored').value = dates.purchaseDate;
}

/** Live icon preview in the edit-food modal. */
function previewEditIcon() {
  const name = document.getElementById('edit-name')?.value || '';
  const cat = document.getElementById('edit-cat')?.value || 'produce';
  const el = document.getElementById('edit-icon-preview');
  if (el) {
    el.textContent = pickIcon(name, cat);
    el.style.background = CAT_BG[cat] || '#F1EFE8';
  }
}

/** Save edits from the edit-food modal. */
export async function saveEditedFood(loc, id) {
  const name = document.getElementById('edit-name')?.value.trim();
  const cat = document.getElementById('edit-cat')?.value;
  const qty = document.getElementById('edit-qty')?.value.trim() || '—';
  const exp = document.getElementById('edit-exp')?.value;
  const stored = document.getElementById('edit-stored')?.value || null;
  if (!name) {
    showToast('Enter a food name.', 'error');
    return;
  }
  const list = listForLoc(loc);
  const idx = indexById(loc, id);
  if (idx < 0) return;
  const prev = list[idx];
  list[idx] = enrichPantryItem({
    ...prev,
    name,
    cat,
    qty,
    purchaseDate: stored,
    expirationDate: exp,
    location: loc,
  });
  if (await persistPantry()) {
    closeModal();
    showToast('Item updated.', 'success');
    renderFridge(activeFridgeFilter);
    renderCab(activeCabFilter);
  }
}

/** Remove a single pantry item after confirmation. */
export async function deleteFoodItem(loc, id) {
  if (!confirm('Delete this item?')) return;
  const list = listForLoc(loc);
  const idx = indexById(loc, id);
  if (idx < 0) return;
  list.splice(idx, 1);
  bulkSelectedIds.delete(id);
  if (await persistPantry()) {
    closeModal();
    showToast('Item deleted.', 'success');
    renderFridge(activeFridgeFilter);
    renderCab(activeCabFilter);
  }
}

/** Delete every item currently selected in bulk mode. */
export async function bulkDeleteSelected() {
  if (!bulkSelectedIds.size) {
    showToast('Select items first.', 'info');
    return;
  }
  if (!confirm(`Delete ${bulkSelectedIds.size} selected item(s)?`)) return;
  const ids = new Set(bulkSelectedIds);
  currentFridgeItems.splice(0, currentFridgeItems.length,
    ...currentFridgeItems.filter((i) => !ids.has(i.id)));
  currentCabItems.splice(0, currentCabItems.length,
    ...currentCabItems.filter((i) => !ids.has(i.id)));
  clearBulkSelection();
  pantryBulkActive = false;
  if (await persistPantry()) {
    showToast('Selected items deleted.', 'success');
    renderFridge(activeFridgeFilter);
    renderCab(activeCabFilter);
  }
}

/** Bulk-edit expiration date (and optional category) for all selected items. */
export function bulkEditSelected() {
  if (!bulkSelectedIds.size) {
    showToast('Select items first.', 'info');
    return;
  }
  const defDate = new Date();
  defDate.setDate(defDate.getDate() + 7);
  openModal(`<div class="modal-wrap"><div class="modal">
    <div class="mhdl"></div>
    <div class="mtitle">Edit ${bulkSelectedIds.size} selected</div>
    <p style="font-size:13px;color:var(--txt2);margin-bottom:12px">Apply the same expiration date to all selected items.</p>
    <label class="flabel">New expiration date</label>
    <input class="inp" id="bulk-exp" type="date" value="${defDate.toISOString().slice(0, 10)}" style="margin-bottom:10px">
    <label class="flabel">Category (optional)</label>
    <select class="inp" id="bulk-cat" style="margin-bottom:4px">
      <option value="">Keep current categories</option>
      ${Object.entries(FRIDGE_CATS).map(([k, v]) => `<option value="${k}">${escapeHTML(v)}</option>`).join('')}
      ${Object.entries(CAB_CATS).map(([k, v]) => `<option value="${k}">${escapeHTML(v)}</option>`).join('')}
    </select>
    <div class="mbtn-row">
      <button class="mbtn-s" onclick="closeModal()">Cancel</button>
      <button class="mbtn-p" onclick="applyBulkEdit()">Apply to selected</button>
    </div>
  </div></div>`);
}

/** Apply bulk edit modal values to selected pantry items. */
async function applyBulkEdit() {
  const exp = document.getElementById('bulk-exp')?.value;
  const newCat = document.getElementById('bulk-cat')?.value;
  if (!exp) {
    showToast('Choose an expiration date.', 'error');
    return;
  }
  const ids = bulkSelectedIds;
  const patchList = (list, loc) => {
    list.forEach((item, i) => {
      if (!ids.has(item.id)) return;
      const cat = newCat || item.cat;
      list[i] = enrichPantryItem({
        ...item,
        cat,
        expirationDate: exp,
        location: loc,
      });
    });
  };
  patchList(currentFridgeItems, 'fridge');
  patchList(currentCabItems, 'cabinet');
  clearBulkSelection();
  pantryBulkActive = false;
  if (await persistPantry()) {
    closeModal();
    showToast('Selected items updated.', 'success');
    renderFridge(activeFridgeFilter);
    renderCab(activeCabFilter);
  }
}

/** Checkbox handler during bulk-select mode. */
function toggleBulkCheck(id) {
  toggleBulkId(id);
  renderFridge(activeFridgeFilter);
  renderCab(activeCabFilter);
}

/** Expose onclick handlers expected by index.html. */
export function bindPantryHandlers() {
  window.renderFridge = renderFridge;
  window.renderCab = renderCab;
  window.updateFridgeAlert = updateFridgeAlert;
  window.fFilter = fFilter;
  window.cFilter = cFilter;
  window.showAddFood = showAddFood;
  window.saveNewFood = saveNewFood;
  window.openFoodItem = openFoodItem;
  window.saveEditedFood = saveEditedFood;
  window.deleteFoodItem = deleteFoodItem;
  window.bulkDeleteSelected = bulkDeleteSelected;
  window.bulkEditSelected = bulkEditSelected;
  window.toggleBulkMode = toggleBulkMode;
  window.setFridgeSearch = setFridgeSearch;
  window.setCabSearch = setCabSearch;
  window.setFridgeSort = setFridgeSort;
  window.setCabSort = setCabSort;
  window.toggleFavorite = toggleFavorite;
  window.previewFoodIcon = previewFoodIcon;
  window.previewEditIcon = previewEditIcon;
  window.toggleBulkCheck = toggleBulkCheck;
  window.applyBulkEdit = applyBulkEdit;
}

bindPantryHandlers();
