/**
 * Scan screen — camera barcode detection + Open Food Facts lookup.
 * Falls back to manual pantry search when camera/API unavailable.
 */
import { allFood } from './state.js';
import { escapeHTML } from './utils.js';
import { showToast, openModal, closeModal } from './ui.js';

let mediaStream = null;
let scanLoopId = null;
let barcodeDetector = null;
let scanBusy = false;

/** Update status text shown over the camera preview. */
function setScanStatus(text) {
  const el = document.getElementById('scan-status');
  if (el) el.textContent = text;
}

/** Map Open Food Facts category tags to FreshFood pantry categories. */
function mapOffCategory(categories) {
  const c = (categories || '').toLowerCase();
  if (/dairy|milk|cheese|yogurt/.test(c)) return 'dairy';
  if (/meat|poultry|beef|pork|chicken/.test(c)) return 'meat';
  if (/fish|seafood/.test(c)) return 'seafood';
  if (/fruit|vegetable|produce/.test(c)) return 'produce';
  if (/frozen/.test(c)) return 'frozen';
  if (/beverage|drink|juice/.test(c)) return 'beverages';
  if (/snack|chocolate|cookie/.test(c)) return 'snacks';
  if (/pasta|noodle/.test(c)) return 'pasta';
  if (/bread|bakery/.test(c)) return 'baked';
  if (/canned|preserve/.test(c)) return 'canned';
  return 'produce';
}

/** True when Open Food Facts returned a product with a food-related category. */
function isFoodProduct(product) {
  if (!product) return false;
  const tags = (product.categories_tags || []).join(' ').toLowerCase();
  const name = (product.product_name || product.generic_name || '').trim();
  if (!name) return false;
  // Reject obvious non-food departments when tagged.
  if (/non-food|pet-food|cosmetic|cleaning|household/.test(tags)) return false;
  return true;
}

/** Lookup barcode via Open Food Facts (public API, CORS-enabled). */
async function lookupBarcode(barcode) {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) throw new Error('Product lookup failed.');
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  return data.product;
}

/** Ask user to confirm scanned product before opening add-food flow. */
function confirmScannedProduct(barcode, product) {
  const name = (product.product_name || product.generic_name || 'Unknown product').trim();
  const brand = product.brands ? ` (${product.brands})` : '';
  const cat = mapOffCategory(product.categories);
  const qty = product.quantity || '—';

  openModal(`<div class="modal-wrap"><div class="modal">
    <div class="mhdl"></div>
    <div class="mtitle">Add scanned item?</div>
    <p style="font-size:13px;color:var(--txt2);margin-bottom:12px;line-height:1.5">Barcode <strong>${escapeHTML(barcode)}</strong></p>
    <div class="fc" style="cursor:default;margin-bottom:14px">
      <div class="ficon" style="background:#EAF3DE">🍽️</div>
      <div><div class="fn">${escapeHTML(name)}${escapeHTML(brand)}</div><div class="fm">${escapeHTML(qty)}</div></div>
    </div>
    <p style="font-size:12px;color:var(--txt2);margin-bottom:14px">Add this to your fridge or cabinet?</p>
    <div class="mbtn-row">
      <button class="mbtn-s" onclick="closeModal()">Cancel</button>
      <button class="mbtn-p" onclick="confirmAddScannedItem('fridge','${escapeHTML(name).replace(/'/g, "\\'")}','${cat}','${escapeHTML(String(qty)).replace(/'/g, "\\'")}')">Add to fridge</button>
    </div>
    <button class="mbtn-s" onclick="confirmAddScannedItem('cabinet','${escapeHTML(name).replace(/'/g, "\\'")}','${cat}','${escapeHTML(String(qty)).replace(/'/g, "\\'")}')" style="width:100%;margin-top:8px">Add to cabinet</button>
  </div></div>`);
}

/** Open the standard add-food modal with fields prefilled from scan. */
export function confirmAddScannedItem(loc, name, cat, qty) {
  closeModal();
  if (typeof window.showAddFood === 'function') {
    window.showAddFood(loc);
    setTimeout(() => {
      const nameEl = document.getElementById('food-name');
      const catEl = document.getElementById('food-cat');
      const qtyEl = document.getElementById('food-qty');
      if (nameEl) nameEl.value = name;
      if (catEl && cat) catEl.value = cat;
      if (qtyEl && qty) qtyEl.value = qty;
      window.previewFoodIcon?.();
    }, 50);
  }
}

/** Handle a detected barcode string. */
async function onBarcodeDetected(raw) {
  const barcode = String(raw || '').trim();
  if (!barcode || scanBusy) return;
  scanBusy = true;
  stopBarcodeScan();
  setScanStatus(`Looking up ${barcode}…`);
  try {
    const product = await lookupBarcode(barcode);
    if (!product || !isFoodProduct(product)) {
      showToast('Barcode not recognized as a food product. Try manual search below.', 'info');
      setScanStatus('Not a food item — try manual search');
      scanBusy = false;
      return;
    }
    confirmScannedProduct(barcode, product);
  } catch {
    showToast('Could not look up barcode. Check connection or search manually.', 'error');
    setScanStatus('Lookup failed — try manual search');
  } finally {
    scanBusy = false;
  }
}

/** Start camera and barcode detection loop. */
export async function startBarcodeScan() {
  if (scanLoopId || scanBusy) return;

  const video = document.getElementById('scan-video');
  const startBtn = document.getElementById('scan-start-btn');
  if (!video) return;

  if (!('BarcodeDetector' in window)) {
    setScanStatus('Camera scan not supported in this browser — use manual search');
    showToast('Barcode scanning needs Chrome/Edge. Use manual search below.', 'info');
    return;
  }

  try {
    barcodeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
  } catch {
    setScanStatus('Barcode detection unavailable — use manual search');
    return;
  }

  setScanStatus('Requesting camera permission…');
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  } catch {
    setScanStatus('Camera permission denied — use manual search below');
    showToast('Camera access is required to scan barcodes.', 'error');
    return;
  }

  video.srcObject = mediaStream;
  video.style.display = 'block';
  if (startBtn) startBtn.style.display = 'none';
  await video.play();
  setScanStatus('Point camera at barcode…');

  const tick = async () => {
    if (!mediaStream || !barcodeDetector) return;
    try {
      const codes = await barcodeDetector.detect(video);
      if (codes.length) {
        await onBarcodeDetected(codes[0].rawValue);
        return;
      }
    } catch {
      /* frame decode miss — continue loop */
    }
    scanLoopId = requestAnimationFrame(tick);
  };
  scanLoopId = requestAnimationFrame(tick);
}

/** Stop camera stream and detection loop. */
export function stopBarcodeScan() {
  if (scanLoopId) {
    cancelAnimationFrame(scanLoopId);
    scanLoopId = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  const video = document.getElementById('scan-video');
  if (video) {
    video.srcObject = null;
    video.style.display = 'none';
  }
  const startBtn = document.getElementById('scan-start-btn');
  if (startBtn) startBtn.style.display = '';
}

/** Filter pantry items by query and render up to 5 matches. */
export function doScanSearch(value) {
  const el = document.getElementById('scan-results');
  if (!el) return;
  const q = (value || '').trim().toLowerCase();
  if (!q) {
    el.innerHTML = '';
    return;
  }
  const matches = allFood.filter((i) =>
    `${i.name} ${i.meta || ''} ${i.cat}`.toLowerCase().includes(q),
  );
  if (!matches.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--txt2);padding:8px 0">No matches found</p>';
    return;
  }
  el.innerHTML = matches.slice(0, 5).map((i) =>
    `<div class="sr-item" onclick="pickScanItem('${escapeHTML(i.name).replace(/'/g, "\\'")}')">` +
    `<div class="ficon" style="background:${i.bg};width:34px;height:34px;font-size:17px">${i.icon}</div>` +
    `<div><div class="fn" style="font-size:13px">${escapeHTML(i.name)}</div><div class="fm">${escapeHTML(i.meta || '')}</div></div>` +
    `<i class="ti ti-plus" style="font-size:15px;color:var(--blue);margin-left:auto"></i></div>`,
  ).join('');
}

/** User picked a manual search result — offer add flow. */
export function pickScanItem(name) {
  const input = document.getElementById('scan-search');
  if (input) input.value = name;
  openModal(`<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle">Add "${escapeHTML(name)}"?</div><div class="mbtn-row"><button class="mbtn-s" onclick="closeModal()">Cancel</button><button class="mbtn-p" onclick="closeModal();confirmAddScannedItem('fridge','${escapeHTML(name).replace(/'/g, "\\'")}','produce','—')">Add to fridge</button></div></div></div>`);
}

/** Register scan handlers on window for inline HTML. */
export function bindScanHandlers() {
  window.doScanSearch = doScanSearch;
  window.pickScanItem = pickScanItem;
  window.startBarcodeScan = startBarcodeScan;
  window.stopBarcodeScan = stopBarcodeScan;
  window.confirmAddScannedItem = confirmAddScannedItem;
}

bindScanHandlers();
