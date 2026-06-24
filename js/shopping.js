/**
 * Shopping list UI — add, edit, check off items and move them into the pantry.
 * List data syncs to Firestore via saveShoppingList.
 */
import { shoppingList, currentUser, currentFridgeItems, currentCabItems } from './state.js';
import { escapeHTML, newId, pickIcon, enrichPantryItem, catLabel } from './utils.js';
import { SHOP_CATS, CAT_BG } from './constants.js';
import { saveShoppingList, savePantry } from './firestore-service.js';
import { openModal, closeModal, showToast, showLoading, hideLoading } from './ui.js';

/** id of the shopping row currently being edited in a modal. */
let editingShopId = null;

/** Persist the in-memory shopping list to Firestore. */
async function persistShoppingList() {
  const uid = currentUser?.uid;
  if (!uid) {
    showToast('Sign in to save changes.', 'error');
    return false;
  }
  showLoading('Saving…');
  try {
    const serialized = shoppingList.map((item) => ({
      id: item.id,
      name: item.name,
      cat: item.cat,
      qty: item.qty || '—',
      checked: !!item.checked,
      createdAt: item.createdAt || new Date().toISOString(),
    }));
    await saveShoppingList(uid, serialized);
    return true;
  } catch (err) {
    showToast(err.message || 'Could not save shopping list.', 'error');
    return false;
  } finally {
    hideLoading();
  }
}

/** Find a shopping item by stable id. */
function findShopItem(id) {
  return shoppingList.find((i) => i.id === id);
}

/** Emoji / background for a shopping row based on name and category. */
function shopVisual(item) {
  const cat = item.cat || 'other';
  return {
    icon: pickIcon(item.name, cat),
    bg: CAT_BG[cat] || '#F1EFE8',
  };
}

/** HTML for one shopping list row. */
function makeShopRow(item) {
  const { icon, bg } = shopVisual(item);
  const checkedStyle = item.checked ? ' style="opacity:.55;text-decoration:line-through"' : '';
  return `<div class="fc shop-row" data-id="${escapeHTML(item.id)}">
    <input type="checkbox" class="shop-chk" ${item.checked ? 'checked' : ''}
      onclick="toggleShopItem('${escapeHTML(item.id)}')"
      aria-label="Mark ${escapeHTML(item.name)} as purchased">
    <div class="ficon" style="background:${bg}">${icon}</div>
    <div style="flex:1;min-width:0"${checkedStyle}>
      <div class="fn">${escapeHTML(item.name)}</div>
      <div class="fm">${escapeHTML(catLabel(item.cat))} · ${escapeHTML(item.qty || '—')}</div>
    </div>
    <button type="button" class="addbtn" style="padding:4px 8px;font-size:11px;margin-right:4px"
      onclick="event.stopPropagation();moveToPantry('${escapeHTML(item.id)}')" title="Move to pantry">
      <i class="ti ti-fridge" style="font-size:12px"></i>
    </button>
    <button type="button" style="background:var(--bg1);border:0.5px solid var(--bdr);border-radius:8px;padding:4px 8px;cursor:pointer;color:var(--txt2)"
      onclick="event.stopPropagation();editShopItem('${escapeHTML(item.id)}')" title="Edit">
      <i class="ti ti-pencil" style="font-size:14px"></i>
    </button>
    <button type="button" style="background:#FCEBEB;border:0.5px solid #F09595;border-radius:8px;padding:4px 8px;cursor:pointer;color:#A32D2D;margin-left:4px"
      onclick="event.stopPropagation();deleteShopItem('${escapeHTML(item.id)}')" title="Remove">
      <i class="ti ti-trash" style="font-size:14px"></i>
    </button>
  </div>`;
}

/** Paint the shopping list into #shopping-list (unchecked first, then checked). */
export function renderShoppingList() {
  const container = document.getElementById('shopping-list');
  if (!container) return;

  const unchecked = shoppingList.filter((i) => !i.checked);
  const checked = shoppingList.filter((i) => i.checked);

  if (!shoppingList.length) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--txt2)"><i class="ti ti-shopping-cart" style="font-size:28px;display:block;margin-bottom:8px"></i>Your list is empty</div>';
    return;
  }

  let html = '';
  if (unchecked.length) {
    html += unchecked.map((i) => makeShopRow(i)).join('');
  }
  if (checked.length) {
    html += '<div class="sdv">Checked off</div>';
    html += checked.map((i) => makeShopRow(i)).join('');
  }
  container.innerHTML = html;

  const badge = document.getElementById('shop-count');
  if (badge) badge.textContent = String(unchecked.length);
}

/** Open modal to add a new shopping list item. */
export function showAddShoppingItem() {
  editingShopId = null;
  const opts = Object.entries(SHOP_CATS).map(([k, v]) =>
    `<option value="${k}">${escapeHTML(v)}</option>`
  ).join('');

  openModal(`<div class="modal-wrap"><div class="modal">
    <div class="mhdl"></div>
    <div class="mtitle">Add to shopping list</div>
    <label class="flabel">Item name</label>
    <input class="inp" id="shop-name" placeholder="e.g. Milk, Pasta, Bananas" style="margin-bottom:10px" oninput="previewShopIcon()">
    <div style="display:flex;align-items:center;gap:8px;margin:-4px 0 10px;font-size:13px;color:var(--txt2)">
      <span style="font-size:22px" id="shop-preview-emoji">🛒</span><span>Icon preview</span>
    </div>
    <label class="flabel">Category</label>
    <select class="inp" id="shop-cat" style="margin-bottom:10px" onchange="previewShopIcon()">${opts}</select>
    <label class="flabel">Quantity / notes</label>
    <input class="inp" id="shop-qty" placeholder="e.g. 2 cartons, 500g" style="margin-bottom:4px">
    <div class="mbtn-row">
      <button class="mbtn-s" onclick="closeModal()">Cancel</button>
      <button class="mbtn-p" onclick="saveShoppingItem()">Add item</button>
    </div>
  </div></div>`);
  previewShopIcon();
}

/** Live icon preview in the add/edit shopping modal. */
function previewShopIcon() {
  const name = document.getElementById('shop-name')?.value || '';
  const cat = document.getElementById('shop-cat')?.value || 'other';
  const el = document.getElementById('shop-preview-emoji');
  if (el) el.textContent = pickIcon(name, cat);
}

/** Save a new or edited shopping item from the modal. */
export async function saveShoppingItem() {
  const name = document.getElementById('shop-name')?.value.trim();
  const cat = document.getElementById('shop-cat')?.value || 'other';
  const qty = document.getElementById('shop-qty')?.value.trim() || '—';
  if (!name) {
    showToast('Enter an item name.', 'error');
    return;
  }

  if (editingShopId) {
    const item = findShopItem(editingShopId);
    if (item) {
      item.name = name;
      item.cat = cat;
      item.qty = qty;
    }
  } else {
    shoppingList.push({
      id: newId(),
      name,
      cat,
      qty,
      checked: false,
      createdAt: new Date().toISOString(),
    });
  }

  if (await persistShoppingList()) {
    closeModal();
    showToast(editingShopId ? 'Item updated.' : 'Added to list.', 'success');
    editingShopId = null;
    renderShoppingList();
  }
}

/** Toggle checked state on a shopping item. */
export async function toggleShopItem(id) {
  const item = findShopItem(id);
  if (!item) return;
  item.checked = !item.checked;
  if (await persistShoppingList()) renderShoppingList();
}

/** Open modal to edit an existing shopping item. */
export function editShopItem(id) {
  const item = findShopItem(id);
  if (!item) return;
  editingShopId = id;

  const opts = Object.entries(SHOP_CATS).map(([k, v]) =>
    `<option value="${k}" ${item.cat === k ? 'selected' : ''}>${escapeHTML(v)}</option>`
  ).join('');

  openModal(`<div class="modal-wrap"><div class="modal">
    <div class="mhdl"></div>
    <div class="mtitle">Edit shopping item</div>
    <label class="flabel">Item name</label>
    <input class="inp" id="shop-name" value="${escapeHTML(item.name)}" style="margin-bottom:10px" oninput="previewShopIcon()">
    <div style="display:flex;align-items:center;gap:8px;margin:-4px 0 10px;font-size:13px;color:var(--txt2)">
      <span style="font-size:22px" id="shop-preview-emoji">${pickIcon(item.name, item.cat)}</span><span>Icon preview</span>
    </div>
    <label class="flabel">Category</label>
    <select class="inp" id="shop-cat" style="margin-bottom:10px" onchange="previewShopIcon()">${opts}</select>
    <label class="flabel">Quantity / notes</label>
    <input class="inp" id="shop-qty" value="${escapeHTML(item.qty || '')}" style="margin-bottom:4px">
    <div class="mbtn-row">
      <button class="mbtn-s" onclick="closeModal()">Cancel</button>
      <button class="mbtn-p" onclick="saveShoppingItem()">Save</button>
    </div>
  </div></div>`);
}

/** Remove a shopping item from the list. */
export async function deleteShopItem(id) {
  const idx = shoppingList.findIndex((i) => i.id === id);
  if (idx < 0) return;
  if (!confirm('Remove this item from your list?')) return;
  shoppingList.splice(idx, 1);
  if (await persistShoppingList()) {
    showToast('Item removed.', 'success');
    renderShoppingList();
  }
}

/** Move a shopping item into the fridge or cabinet pantry. */
export function moveToPantry(id) {
  const item = findShopItem(id);
  if (!item) return;

  const defDate = new Date();
  defDate.setDate(defDate.getDate() + 7);
  const defStr = defDate.toISOString().slice(0, 10);

  openModal(`<div class="modal-wrap"><div class="modal">
    <div class="mhdl"></div>
    <div class="mtitle">Move to pantry</div>
    <p style="font-size:13px;color:var(--txt2);margin-bottom:12px;line-height:1.5">
      Add <strong>${escapeHTML(item.name)}</strong> to your pantry and remove it from the shopping list.
    </p>
    <label class="flabel">Store in</label>
    <select class="inp" id="move-loc" style="margin-bottom:10px">
      <option value="fridge">Fridge</option>
      <option value="cabinet">Cabinet</option>
    </select>
    <label class="flabel">Expiration date</label>
    <input class="inp" id="move-exp" type="date" value="${defStr}" style="margin-bottom:4px">
    <div class="mbtn-row">
      <button class="mbtn-s" onclick="closeModal()">Cancel</button>
      <button class="mbtn-p" onclick="confirmMoveToPantry('${escapeHTML(id)}')">Move to pantry</button>
    </div>
  </div></div>`);
}

/** Confirm pantry move — creates pantry item, saves both lists, removes shopping row. */
export async function confirmMoveToPantry(id) {
  const shopItem = findShopItem(id);
  if (!shopItem) return;

  const loc = document.getElementById('move-loc')?.value || 'fridge';
  const exp = document.getElementById('move-exp')?.value;
  const uid = currentUser?.uid;
  if (!uid) {
    showToast('Sign in to save changes.', 'error');
    return;
  }

  const pantryItem = enrichPantryItem({
    id: newId(),
    name: shopItem.name,
    cat: shopItem.cat || 'other',
    qty: shopItem.qty || '—',
    purchaseDate: new Date().toISOString().slice(0, 10),
    expirationDate: exp,
    favorite: false,
    location: loc,
  });

  if (loc === 'fridge') currentFridgeItems.push(pantryItem);
  else currentCabItems.push(pantryItem);

  const shopIdx = shoppingList.findIndex((i) => i.id === id);
  if (shopIdx >= 0) shoppingList.splice(shopIdx, 1);

  showLoading('Moving item…');
  try {
    await savePantry(uid, currentFridgeItems, currentCabItems);
    const serialized = shoppingList.map((i) => ({
      id: i.id,
      name: i.name,
      cat: i.cat,
      qty: i.qty || '—',
      checked: !!i.checked,
      createdAt: i.createdAt || new Date().toISOString(),
    }));
    await saveShoppingList(uid, serialized);
    closeModal();
    showToast('Moved to pantry.', 'success');
    renderShoppingList();
    // Re-render pantry if those modules are loaded.
    if (typeof window.renderFridge === 'function') window.renderFridge();
    if (typeof window.renderCab === 'function') window.renderCab();
  } catch (err) {
    showToast(err.message || 'Could not move item.', 'error');
  } finally {
    hideLoading();
  }
}

/** Expose onclick handlers expected by index.html. */
export function bindShoppingHandlers() {
  window.renderShoppingList = renderShoppingList;
  window.showAddShoppingItem = showAddShoppingItem;
  window.saveShoppingItem = saveShoppingItem;
  window.toggleShopItem = toggleShopItem;
  window.editShopItem = editShopItem;
  window.deleteShopItem = deleteShopItem;
  window.moveToPantry = moveToPantry;
  window.confirmMoveToPantry = confirmMoveToPantry;
  window.previewShopIcon = previewShopIcon;
}

bindShoppingHandlers();
