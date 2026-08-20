// Shared barcode scanning — camera access, the scanner modal, the html5-qrcode
// wiring, and the rate-limited OpenFoodFacts lookup. Used by both the Today
// page (scanning a custom food) and the Foods page (scanning a new saved
// food). Callers pass in what to do with a decoded barcode; this module only
// owns the scanning mechanics, not any particular form.
//
// Requires the page to load the html5-qrcode CDN script and include the
// #barcode-scanner-modal / #scanner-alert-modal markup (see barcode.css).

let html5QrCodeInstance = null;

export async function requestCameraAccess() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return { ok: false, message: 'Your browser does not support camera access. Please add food manually or use a modern browser.' };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    stream.getTracks().forEach(t => t.stop());
    return { ok: true };
  } catch (err) {
    let message = 'Could not access the camera. Please add food manually.';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      message = 'Camera permission was denied. Allow camera access in your browser settings and try again.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      message = 'No camera was found on this device. Please add food manually.';
    }
    return { ok: false, message };
  }
}

// onBarcodeDetected(barcode) is called once a code is decoded; the scanner
// modal is already closed by the time it's invoked.
export function openScannerModal(onBarcodeDetected) {
  let modal = document.getElementById('barcode-scanner-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'barcode-scanner-modal';
    modal.className = 'pg-modal';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="pg-modal-box scanner-modal-box">
      <div class="pg-modal-header">
        <div class="pg-modal-title">Scan Barcode</div>
        <button class="pg-close-btn" onclick="window.closeScannerModal()">×</button>
      </div>
      <div class="pg-modal-body scanner-body">
        <div id="barcode-video-container" class="barcode-video-container"></div>
        <div id="scanner-status-text" class="scanner-status-text">Point camera at product barcode</div>
      </div>
      <div class="pg-modal-footer">
        <div></div>
        <button class="ghost-btn" onclick="window.closeScannerModal()">Cancel</button>
      </div>
    </div>
  `;
  modal.classList.add('open');
  window.closeScannerModal = closeScannerModal;
  setTimeout(() => initBarcodeScanner(onBarcodeDetected), 150);
}

export function closeScannerModal() {
  stopBarcodeScanner();
  const modal = document.getElementById('barcode-scanner-modal');
  if (modal) modal.classList.remove('open');
}

function initBarcodeScanner(onBarcodeDetected) {
  const Html5Qrcode = window.Html5Qrcode;
  if (!Html5Qrcode) {
    const el = document.getElementById('scanner-status-text');
    if (el) el.textContent = 'Barcode scanner library failed to load.';
    return;
  }
  const Formats = window.Html5QrcodeSupportedFormats;
  const formatsToSupport = Formats ? [
    Formats.EAN_13, Formats.EAN_8, Formats.UPC_A, Formats.UPC_E,
    Formats.CODE_128, Formats.CODE_39, Formats.QR_CODE
  ] : undefined;

  html5QrCodeInstance = new Html5Qrcode('barcode-video-container', { formatsToSupport, verbose: false });

  html5QrCodeInstance.start(
    { facingMode: 'environment' },
    {
      fps: 10,
      qrbox: (w, h) => ({ width: Math.min(Math.round(w * 0.85), 300), height: Math.min(Math.round(h * 0.35), 100) })
    },
    async (decodedText) => {
      const statusEl = document.getElementById('scanner-status-text');
      if (statusEl) statusEl.textContent = 'Barcode detected! Looking up food data...';
      const inst = html5QrCodeInstance;
      html5QrCodeInstance = null;
      try { await inst.stop(); } catch (_) {}
      closeScannerModal();
      await onBarcodeDetected(decodedText);
    },
    () => {}
  ).catch(() => {
    const el = document.getElementById('scanner-status-text');
    if (el) el.textContent = 'Could not start camera. Please try again.';
  });
}

function stopBarcodeScanner() {
  if (html5QrCodeInstance) {
    const inst = html5QrCodeInstance;
    html5QrCodeInstance = null;
    inst.stop().catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════
// BARCODE LOOKUP RATE LIMITING
// OpenFoodFacts caps requests at 10/min/user. If 8 requests land within any
// rolling 60s window, we lock out scanning for 5 minutes before granting
// another batch of 8. Requests spread out slower than that never trigger it.
// Persisted to localStorage so a page refresh (or a different page) can't be
// used to dodge the lockout.
// ═══════════════════════════════════════════════════════════════════
const BARCODE_RATE_LIMIT = 8;
const BARCODE_RATE_WINDOW_MS = 60 * 1000;
const BARCODE_LOCKOUT_MS = 5 * 60 * 1000;
const BARCODE_RATE_LS_KEY = 'mp_barcode_ratelimit_v1';

let _barcodeRequestTimes = [];
let _barcodeLockoutUntil = 0;

(function loadBarcodeRateLimitState() {
  try {
    const saved = JSON.parse(localStorage.getItem(BARCODE_RATE_LS_KEY));
    if (saved) {
      _barcodeRequestTimes = Array.isArray(saved.requestTimes) ? saved.requestTimes : [];
      _barcodeLockoutUntil = saved.lockoutUntil || 0;
    }
  } catch (e) {}
})();

function saveBarcodeRateLimitState() {
  try {
    localStorage.setItem(BARCODE_RATE_LS_KEY, JSON.stringify({
      requestTimes: _barcodeRequestTimes,
      lockoutUntil: _barcodeLockoutUntil,
    }));
  } catch (e) {}
}

function barcodeRateLimitWaitMs() {
  const now = Date.now();
  if (_barcodeLockoutUntil && now >= _barcodeLockoutUntil) {
    _barcodeLockoutUntil = 0;
    _barcodeRequestTimes = [];
    saveBarcodeRateLimitState();
  }
  if (_barcodeLockoutUntil) return _barcodeLockoutUntil - now;
  return 0;
}

function parseServingGrams(servingSize) {
  if (!servingSize) return null;
  const match = servingSize.match(/(\d+(?:\.\d+)?)\s*g/i);
  return match ? parseFloat(match[1]) : null;
}

export async function lookupFood(barcode) {
  const waitMs = barcodeRateLimitWaitMs();
  if (waitMs > 0) {
    const waitMin = Math.ceil(waitMs / 60000);
    const err = new Error(`You must wait about ${waitMin} minute${waitMin === 1 ? '' : 's'} before scanning again.`);
    err.isRateLimit = true;
    throw err;
  }
  const now = Date.now();
  _barcodeRequestTimes.push(now);
  _barcodeRequestTimes = _barcodeRequestTimes.filter((t) => now - t < BARCODE_RATE_WINDOW_MS);
  if (_barcodeRequestTimes.length >= BARCODE_RATE_LIMIT) {
    _barcodeLockoutUntil = now + BARCODE_LOCKOUT_MS;
  }
  saveBarcodeRateLimitState();
  const resp = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_en,serving_size,nutriments`
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data.status !== 1) return null;

  const product = data.product;
  const n = product.nutriments || {};
  let cal, p, c, f;

  if (n['energy-kcal_serving'] != null) {
    cal = Math.round(n['energy-kcal_serving']);
    p   = Math.round((n['proteins_serving']      || 0) * 10) / 10;
    c   = Math.round((n['carbohydrates_serving'] || 0) * 10) / 10;
    f   = Math.round((n['fat_serving']           || 0) * 10) / 10;
  } else {
    const servingG = parseServingGrams(product.serving_size);
    const mult = servingG ? servingG / 100 : 1;
    cal = Math.round((n['energy-kcal_100g'] || 0) * mult);
    p   = Math.round((n['proteins_100g']      || 0) * mult * 10) / 10;
    c   = Math.round((n['carbohydrates_100g'] || 0) * mult * 10) / 10;
    f   = Math.round((n['fat_100g']           || 0) * mult * 10) / 10;
  }

  return {
    name: (product.product_name || product.product_name_en || '').trim(),
    cal, p, c, f
  };
}
