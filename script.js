import * as db from "./db.js";
import * as items from "./items.js";
import * as programs from "./programs.js";

let calRange = { low: 1250, high: 1750 };

function showConfirm(message, okLabel = 'Confirm') {
  return new Promise(resolve => {
    const modal = document.getElementById("confirm-modal");
    const ok = document.getElementById("confirm-ok");
    const cancel = document.getElementById("confirm-cancel");
    document.getElementById("confirm-message").textContent = message;
    ok.textContent = okLabel;
    modal.classList.add("open");
    function cleanup(result) {
      modal.classList.remove("open");
      ok.textContent = 'Confirm';
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onBackdrop(e) { if (e.target === modal) cleanup(false); }
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
  });
}

// Update freq preview label in core item form
function updateFreqPreview() {
  const raw = document.getElementById("ci-target").value;
  const target = raw === "" ? 1 : (parseFloat(raw) || 0);
  document.getElementById("ci-freq-preview").textContent = `${target} srv/day`;
}
window.updateFreqPreview = updateFreqPreview;
// ═══════════════════════════════════════════════════════════════════
// CORE ITEMS MANAGEMENT TAB
// ═══════════════════════════════════════════════════════════════════
let editingCoreItemIdx = null;

function ensureFoodModal() {
  if (!document.getElementById('food-form-modal')) {
    const el = document.createElement('div');
    el.id = 'food-form-modal';
    el.className = 'pg-modal';
    el.addEventListener('click', (e) => { if (e.target === el) closeFoodModal(); });
    document.body.appendChild(el);
  }
}

function openFoodModal(isEdit) {
  ensureFoodModal();
  const modal = document.getElementById('food-form-modal');
  modal.innerHTML = `
    <div class="pg-modal-box pg-modal-box-lg">
      <div class="pg-modal-header">
        <div class="pg-modal-title">${isEdit ? 'Edit Food' : 'Add Food'}</div>
        <button class="pg-close-btn" onclick="window.cancelCoreItemForm()">×</button>
      </div>
      <div class="pg-modal-body">
        <div class="add-row add-row-1">
          <div class="field-group">
            <span class="field-label">Name</span>
            <input id="ci-name" type="text" placeholder="e.g. Chicken Breast" />
          </div>
          <div class="field-group">
            <span class="field-label">Calories</span>
            <input id="ci-cal" type="number" placeholder="120" min="0" />
          </div>
          <div class="field-group">
            <span class="field-label">Protein (g)</span>
            <input id="ci-p" type="number" placeholder="24" min="0" />
          </div>
          <div class="field-group">
            <span class="field-label">Carbs (g)</span>
            <input id="ci-c" type="number" placeholder="0" min="0" />
          </div>
          <div class="field-group">
            <span class="field-label">Fat (g)</span>
            <input id="ci-f" type="number" placeholder="2" min="0" />
          </div>
        </div>
        <div class="add-row add-row-2" style="margin-top:12px;">
          <div class="field-group">
            <span class="field-label">Bulk Total Price ($)</span>
            <input type="number" id="ci-bulk-price" placeholder="15.00" min="0" step="0.01" oninput="window.calcCoreCostPerServing()" />
            <span class="field-hint">total you paid</span>
          </div>
          <div class="field-group">
            <span class="field-label">Servings in Package</span>
            <input type="number" id="ci-bulk-servings" placeholder="30" min="1" oninput="window.calcCoreCostPerServing()" />
            <span class="field-hint">total servings</span>
          </div>
          <div class="field-group">
            <span class="field-label">Cost / Serving ($)</span>
            <input type="number" id="ci-cost" placeholder="0.50" min="0" step="0.01" oninput="window.clearCoreBulkIfManual()" />
            <span class="field-hint" id="ci-cost-hint">or enter manually</span>
          </div>
          <div class="field-group">
            <span class="field-label">Target/Day</span>
            <input type="number" id="ci-target" placeholder="2" min="1" oninput="window.updateFreqPreview()" />
          </div>
          <div class="field-group">
            <span class="field-label">Freq Details</span>
            <input type="text" id="ci-freq" placeholder="e.g. 2 bags/wk · $32/wk" />
            <span class="field-hint" id="ci-freq-preview">1 srv/day</span>
          </div>
        </div>
      </div>
      <div class="pg-modal-footer">
        ${isEdit ? `<button class="ghost-btn pg-delete-btn" id="food-modal-delete-btn">Delete</button>` : '<div></div>'}
        <div style="display:flex;gap:8px;">
          <button class="ghost-btn" onclick="window.cancelCoreItemForm()">Cancel</button>
          <button id="food-modal-submit" class="add-btn">${isEdit ? 'Update' : '+ Add'}</button>
        </div>
      </div>
    </div>
  `;
  modal.classList.add('open');
}

function closeFoodModal() {
  const modal = document.getElementById('food-form-modal');
  if (modal) modal.classList.remove('open');
  editingCoreItemIdx = null;
}

function renderCoreItemsMgmt() {
  const list = document.getElementById("core-items-mgmt-list");
  list.innerHTML = "";
  if (!items.CORE_ITEMS.length) {
    list.innerHTML = '<div style="color:var(--muted);padding:20px 0;">No core items found.</div>';
    return;
  }
  items.CORE_ITEMS.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "mgmt-card" + (item.inactive ? " done" : "");
    card.innerHTML = `
      <div class="mgmt-card-top">
        <div class="mgmt-card-name">${item.name}${item.inactive ? ' <span class="mgmt-card-status">inactive</span>' : ''}</div>
        <button class="mgmt-edit-btn" onclick="window.editCoreItem(${idx})">Edit</button>
      </div>
      <div class="mgmt-card-actions">
        <button class="mgmt-delete-btn" onclick="window.deleteCoreItem(${idx})">Delete</button>
        <button class="mgmt-active-btn${item.inactive ? ' activate-outline' : ''}" onclick="window.toggleActiveCoreItem(this,${idx})">${item.inactive ? 'Show' : 'Hide'}</button>
      </div>
    `;
    list.appendChild(card);
  });
}

function showAddCoreItemForm() {
  showAddFoodChoiceModal();
}
window.showAddCoreItemForm = showAddCoreItemForm;

function cancelCoreItemForm() {
  closeFoodModal();
}
window.cancelCoreItemForm = cancelCoreItemForm;

// ═══════════════════════════════════════════════════════════════════
// ADD FOOD CHOICE MODAL
// ═══════════════════════════════════════════════════════════════════

function showAddFoodChoiceModal() {
  let modal = document.getElementById('add-food-choice-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'add-food-choice-modal';
    modal.className = 'pg-modal';
    modal.addEventListener('click', (e) => { if (e.target === modal) closeAddFoodChoiceModal(); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="pg-modal-box choice-modal-box">
      <div class="pg-modal-header">
        <div class="pg-modal-title">Add Food</div>
        <button class="pg-close-btn" onclick="window.closeAddFoodChoiceModal()">×</button>
      </div>
      <div class="pg-modal-body choice-modal-body">
        <div class="choice-options">
          <button class="choice-btn choice-btn-scan" onclick="window.startBarcodeFlow()">
            <div class="choice-btn-text">
              <div class="choice-btn-label">Scan Barcode</div>
              <div class="choice-btn-desc">Auto-fill from product barcode</div>
            </div>
          </button>
          <button class="choice-btn choice-btn-manual" onclick="window.addFoodManually()">
            <div class="choice-btn-text">
              <div class="choice-btn-label">Add Manually</div>
              <div class="choice-btn-desc">Enter nutrition info yourself</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  `;
  modal.classList.add('open');
}

function closeAddFoodChoiceModal() {
  const modal = document.getElementById('add-food-choice-modal');
  if (modal) modal.classList.remove('open');
}
window.closeAddFoodChoiceModal = closeAddFoodChoiceModal;

function addFoodManually() {
  closeAddFoodChoiceModal();
  editingCoreItemIdx = null;
  openFoodModal(false);
  document.getElementById('ci-target').value = '1';
  document.getElementById('ci-freq-preview').textContent = '1 srv/day';
  document.getElementById('ci-cost-hint').textContent = 'or enter manually';
  document.getElementById('food-modal-submit').onclick = handleAddCoreItem;
}
window.addFoodManually = addFoodManually;

// ═══════════════════════════════════════════════════════════════════
// BARCODE SCANNING
// ═══════════════════════════════════════════════════════════════════

let html5QrCodeInstance = null;

async function startBarcodeFlow() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showScannerError('Your browser does not support camera access. Please add food manually or use a modern browser.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    stream.getTracks().forEach(t => t.stop());
  } catch (err) {
    let msg = 'Could not access the camera. Please add food manually.';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      msg = 'Camera permission was denied. Allow camera access in your browser settings and try again.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      msg = 'No camera was found on this device. Please add food manually.';
    }
    showScannerError(msg);
    return;
  }
  closeAddFoodChoiceModal();
  openScannerModal();
}
window.startBarcodeFlow = startBarcodeFlow;

function showScannerError(message) {
  const modal = document.getElementById('add-food-choice-modal');
  if (!modal) return;
  modal.innerHTML = `
    <div class="pg-modal-box choice-modal-box">
      <div class="pg-modal-header">
        <div class="pg-modal-title">Camera Error</div>
        <button class="pg-close-btn" onclick="window.closeAddFoodChoiceModal()">×</button>
      </div>
      <div class="pg-modal-body scanner-error-body">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2.5"/>
        </svg>
        <p class="scanner-error-msg">${message}</p>
        <button style="align-self: center;" class="add-btn" onclick="window.addFoodManually()">Add Manually Instead</button>
      </div>
    </div>
  `;
}

function openScannerModal() {
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
  setTimeout(initBarcodeScanner, 150);
}

function closeScannerModal() {
  stopBarcodeScanner();
  const modal = document.getElementById('barcode-scanner-modal');
  if (modal) modal.classList.remove('open');
}
window.closeScannerModal = closeScannerModal;

function initBarcodeScanner() {
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
      await handleBarcodeDetected(decodedText);
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

async function handleBarcodeDetected(barcode) {
  closeScannerModal();
  editingCoreItemIdx = null;
  openFoodModal(false);
  document.getElementById('ci-target').value = '1';
  document.getElementById('ci-freq-preview').textContent = '1 srv/day';
  document.getElementById('ci-cost-hint').textContent = 'or enter manually';
  document.getElementById('food-modal-submit').onclick = handleAddCoreItem;
  try {
    const foodData = await lookupBarcodeOpenFoodFacts(barcode);
    if (foodData && foodData.name) fillFoodFormFromScan(foodData);
  } catch (_) {}
}

async function lookupBarcodeOpenFoodFacts(barcode) {
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

function parseServingGrams(servingSize) {
  if (!servingSize) return null;
  const match = servingSize.match(/(\d+(?:\.\d+)?)\s*g/i);
  return match ? parseFloat(match[1]) : null;
}

function fillFoodFormFromScan(foodData) {
  if (foodData.name) document.getElementById('ci-name').value = foodData.name;
  if (foodData.cal)  document.getElementById('ci-cal').value  = foodData.cal;
  if (foodData.p)    document.getElementById('ci-p').value    = foodData.p;
  if (foodData.c)    document.getElementById('ci-c').value    = foodData.c;
  if (foodData.f)    document.getElementById('ci-f').value    = foodData.f;
  updateFreqPreview();
}

function fillCoreItemForm(idx) {
  const item = items.CORE_ITEMS[idx];
  document.getElementById("ci-name").value = item.name;
  document.getElementById("ci-cal").value = item.cal;
  document.getElementById("ci-p").value = item.p;
  document.getElementById("ci-c").value = item.c;
  document.getElementById("ci-f").value = item.f;
  document.getElementById("ci-bulk-price").value = "";
  document.getElementById("ci-bulk-servings").value = "";
  document.getElementById("ci-cost").value = item.costPerServing;
  document.getElementById("ci-target").value = item.target;
  let freqDetails = "";
  if (item.freq && item.freq.includes("srv/day")) {
    freqDetails = item.freq.split("srv/day")[1];
    if (freqDetails) freqDetails = freqDetails.replace(/^\s*·\s*/, "");
  }
  document.getElementById("ci-freq").value = freqDetails;
  document.getElementById("ci-freq-preview").textContent = `${item.target} srv/day`;
  document.getElementById("ci-cost-hint").textContent = "or enter manually";
  document.getElementById("food-modal-delete-btn").onclick = async function() {
    if (!await showConfirm("Delete this food?", 'Delete')) return;
    items.CORE_ITEMS.splice(idx, 1);
    await items.deleteCoreItemFromDB(item.id);
    closeFoodModal();
    renderCoreItemsMgmt();
    renderCoreItems();
  };
  document.getElementById("food-modal-submit").onclick = async function(e) {
    if (e) e.preventDefault();
    const updatedName = document.getElementById("ci-name").value.trim();
    if (!updatedName) return;
    if (!await showConfirm(`Save changes to "${updatedName}"?`, 'Save')) return;
    item.name = updatedName;
    item.cal = parseFloat(document.getElementById("ci-cal").value) || 0;
    item.p = parseFloat(document.getElementById("ci-p").value) || 0;
    item.c = parseFloat(document.getElementById("ci-c").value) || 0;
    item.f = parseFloat(document.getElementById("ci-f").value) || 0;
    item.costPerServing = parseFloat(document.getElementById("ci-cost").value) || 0;
    const targetRaw = document.getElementById("ci-target").value;
    item.target = targetRaw === "" ? 1 : (parseFloat(targetRaw) || 0);
    const freqDetails = document.getElementById("ci-freq").value.trim();
    item.freq = `${item.target} srv/day${freqDetails ? ' · ' + freqDetails : ''}`;
    await items.saveCoreItem(item);
    closeFoodModal();
    renderCoreItemsMgmt();
    renderCoreItems();
  };
}


// Cost per serving calculation for core item form
function calcCoreCostPerServing() {
    const price = parseFloat(document.getElementById("ci-bulk-price").value) || 0;
    const servings = parseFloat(document.getElementById("ci-bulk-servings").value) || 0;
    const costInput = document.getElementById("ci-cost");
    if (price > 0 && servings > 0) {
    const cost = price / servings;
    costInput.value = cost.toFixed(2);
    document.getElementById("ci-cost-hint").textContent = "auto-calculated";
    } else {
    document.getElementById("ci-cost-hint").textContent = "or enter manually";
    }
}
function clearCoreBulkIfManual() {
    if (document.activeElement && document.activeElement.id === "ci-cost") {
    document.getElementById("ci-bulk-price").value = "";
    document.getElementById("ci-bulk-servings").value = "";
    document.getElementById("ci-cost-hint").textContent = "manual entry";
    }
}
window.calcCoreCostPerServing = calcCoreCostPerServing;
window.clearCoreBulkIfManual = clearCoreBulkIfManual;

window.renderCoreItemsMgmt = renderCoreItemsMgmt;

async function handleAddCoreItem(e) {
  if (e) e.preventDefault();
  const name = document.getElementById("ci-name").value.trim();
  const cal = parseFloat(document.getElementById("ci-cal").value) || 0;
  const p = parseFloat(document.getElementById("ci-p").value) || 0;
  const c = parseFloat(document.getElementById("ci-c").value) || 0;
  const f = parseFloat(document.getElementById("ci-f").value) || 0;
  const cost = parseFloat(document.getElementById("ci-cost").value) || 0;
  const targetRaw = document.getElementById("ci-target").value;
  const target = targetRaw === "" ? 1 : (parseFloat(targetRaw) || 0);
  if (!name) return;
  const freqDetails = document.getElementById("ci-freq").value.trim();
  const freq = `${target} srv/day${freqDetails ? ' · ' + freqDetails : ''}`;
  const newItem = {
    id: 'food_' + Date.now(),
    name,
    cal,
    p,
    c,
    f,
    costPerServing: cost,
    target,
    freq,
    inactive: false
  };
  if (!await showConfirm(`Add "${name}" as a core item?`, 'Add')) return;
  items.CORE_ITEMS.push(newItem);
  await items.saveCoreItem(newItem);
  closeFoodModal();
  renderCoreItemsMgmt();
  renderCoreItems();
}
window.handleAddCoreItem = handleAddCoreItem;

async function deleteCoreItem(idx) {
  if (!await showConfirm("Delete this food?", 'Delete')) return;
  const item = items.CORE_ITEMS[idx];
  items.CORE_ITEMS.splice(idx, 1);
  await items.deleteCoreItemFromDB(item.id);
  renderCoreItemsMgmt();
  renderCoreItems();
}
window.deleteCoreItem = deleteCoreItem;

function toggleActiveCoreItem(btn, idx) {
  const item = items.CORE_ITEMS[idx];
  item.inactive = !item.inactive;
  btn.textContent = item.inactive ? 'Show' : 'Hide';
  // Persist inactive state
  items.saveCoreItem(item);
  renderCoreItemsMgmt();
  renderCoreItems();
  renderStats();
}
window.toggleActiveCoreItem = toggleActiveCoreItem;

function editCoreItem(idx) {
  editingCoreItemIdx = idx;
  openFoodModal(true);
  fillCoreItemForm(idx);
}
window.editCoreItem = editCoreItem;

function formatDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateShort(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}


// ═══════════════════════════════════════════════════════════════════
// PERSIST — save today snapshot to IndexedDB
// ══════════════════════════════════════updateWeekRecord═════════════════════════════
async function persistState() {
  db.saveTodayLS(items.todayStr(), items.servings, items.customItems);
  const tot = items.computeTotals();
  if (tot.cal === 0 && tot.cost === 0) {
    // Remove today's log from IDB if everything is zero
    try {
      await db.dbDelete("days", items.todayStr());
    } catch (e) {
      // ignore
    }
    await updateWeekRecord(true); // pass flag to remove from week
    return;
  }
  const snapshot = {
    date: items.todayStr(),
    servings: { ...items.servings },
    customItems: [...items.customItems],
    cal: tot.cal,
    p: tot.p,
    c: tot.c,
    f: tot.f,
    cost: tot.cost,
  };
  try {
    await db.dbPut("days", snapshot);
  } catch (e) {
    console.warn("IDB write failed", e);
  }
  await updateWeekRecord();
}

async function updateWeekRecord() {
  const weekStart = items.weekStartFor(items.todayStr());
  let week;
  try {
    week = await db.dbGet("weeks", weekStart);
  } catch (e) {
    week = null;
  }
  if (!week) week = { weekStart, days: {} };
  const tot = items.computeTotals();
  // If called with removeIfZero and all values are zero, remove today from week
  if (arguments.length > 0 && arguments[0] === true && tot.cal === 0 && tot.cost === 0) {
    if (week.days && week.days[items.todayStr()]) {
      delete week.days[items.todayStr()];
      try {
        await db.dbPut("weeks", week);
      } catch (e) {
        console.warn("IDB week write failed", e);
      }
    }
    return;
  }
  // Only record today if there's actual data
  if (tot.cal === 0 && tot.cost === 0) return;
  week.days[items.todayStr()] = {
    cal: tot.cal,
    p: tot.p,
    c: tot.c,
    f: tot.f,
    cost: tot.cost,
  };
  try {
    await db.dbPut("weeks", week);
  } catch (e) {
    console.warn("IDB week write failed", e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════
function render() {
  renderHeader();
  renderCoreItems();
  renderCustomItems();
  renderStats();
  renderWeeklyCost();
}

function renderHeader() {
  document.getElementById("hdr-date").textContent =
    new Date().toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
}

function renderCoreItems() {
  const list = document.getElementById("core-items-list");
  list.innerHTML = "";
  items.CORE_ITEMS.forEach((item) => {
    if (item.inactive) return;
    const srv = items.servings[item.id] || 0;
    const met = srv >= item.target;
    const over = srv > item.target;
    const countClass = over ? "over" : met ? "met" : "under";
    const spentToday = (item.costPerServing * srv).toFixed(2);
    const targetDay = (item.costPerServing * item.target).toFixed(2);
    const card = document.createElement("div");
    card.className =
      "item-card" + (met ? " done" : "");
    card.innerHTML = `
    <div class="serving-ctrl">
    <button class="srv-btn" onclick="window.adjustServing('${item.id}',1)">+</button>
    <div class="srv-count">
        <div class="current ${countClass}">${srv}</div>
        <div class="target">/ ${item.target}</div>
    </div>
    <button class="srv-btn" onclick="window.adjustServing('${item.id}',-1)">−</button>
    </div>
    <div class="item-info">
    <div class="item-name">${item.name}</div>
    <div class="item-serving-lbl">${item.freq} · $${item.costPerServing.toFixed(2)}/serving</div>
    <div class="item-macros">
        <span class="im im-cal">${item.cal * srv} kcal</span>
        <span class="im im-p">P: ${(item.p * srv).toFixed(0)}g</span>
        <span class="im im-c">C: ${(item.c * srv).toFixed(0)}g</span>
        <span class="im im-f">F: ${(item.f * srv).toFixed(1)}g</span>
        <span class="im" style="color:var(--muted)">(${item.cal}kcal ea)</span>
    </div>
    </div>
    <div class="item-right">
    <div class="item-cost-lbl">$${spentToday} spent</div>
    <div class="item-cost-target">target: $${targetDay}/day</div>
    </div>`;
    list.appendChild(card);
  });
}

function renderCustomItems() {
  const list = document.getElementById("custom-items-list");
  list.innerHTML = "";
  if (items.customItems.length === 0) {
    list.innerHTML =
      "<div style=\"font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);padding:8px 0;\">No custom items today.</div>";
    return;
  }
  items.customItems.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "item-card custom-item";
    const srvLabel =
      item.servingsEaten > 1 ? `${item.servingsEaten} servings` : "1 serving";
    card.innerHTML = `
    <div class="serving-ctrl">
    <div class="srv-count">
        <div class="current met">${item.servingsEaten || 1}</div>
        <div class="target">srv</div>
    </div>
    </div>
    <div class="item-info">
    <div class="item-name">${item.name}</div>
    <div class="item-serving-lbl">custom · ${srvLabel} · $${parseFloat(item.costPerSrv || 0).toFixed(2)}/srv</div>
    <div class="item-macros">
        <span class="im im-cal">${item.cal} kcal</span>
        <span class="im im-p">P: ${item.p}g</span>
        <span class="im im-c">C: ${item.c}g</span>
        <span class="im im-f">F: ${item.f}g</span>
    </div>
    </div>
    <div class="item-right">
      <button class="mgmt-edit-btn edit-btn" style="width:100%" onclick="window.editCustomItem(${idx})">Edit</button>
      <button class="remove-btn" style="width:100%" onclick="window.removeCustomItem(${idx})">Delete</button>
    </div>`;
    list.appendChild(card);
  });
}

function renderStats() {
    // Calorie range indicator (target zone)
    const low = calRange.low, high = calRange.high;
    const maxCal = 2000;
    const zone = document.querySelector('.target-zone');
    if (zone) {
      const left = (low / maxCal) * 100;
      const width = ((high - low) / maxCal) * 100;
      zone.style.left = left + '%';
      zone.style.width = width + '%';
      zone.querySelector('.zone-label-low').textContent = low.toLocaleString();
      zone.querySelector('.zone-label-high').textContent = high.toLocaleString();
    }
  const tot = items.computeTotals();
  const tgtCal = items.CORE_ITEMS.filter(i => !i.inactive).reduce((s, i) => s + i.cal * i.target, 0);

  document.getElementById("tot-cal").textContent = Math.round(tot.cal);
  document.getElementById("tot-cal-sub").textContent = `/ ${tgtCal} target`;
  document.getElementById("tot-p").textContent = Math.round(tot.p) + "g";
  document.getElementById("tot-c").textContent = Math.round(tot.c) + "g";
  document.getElementById("tot-f").textContent = tot.f.toFixed(1) + "g";
  document.getElementById("tot-spent").textContent = "$" + tot.cost.toFixed(2);
  // Only include active items in target cost per day
  const activeTargetCost = items.CORE_ITEMS.filter(i => !i.inactive).reduce((s, i) => s + i.costPerServing * i.target, 0);
  document.getElementById("tot-target-cost").textContent = "$" + activeTargetCost.toFixed(2);

  // Calorie fill
  document.getElementById("cal-fill").style.width =
    Math.min((tot.cal / maxCal) * 100, 100) + "%";


  // Status banner
  const dot = document.getElementById("status-dot");
  const banner = document.getElementById("status-banner");
  const txt = document.getElementById("status-text");
  if (tot.cal === 0) {
    dot.style.cssText = "background:var(--muted);box-shadow:none;";
    banner.style.borderLeftColor = "var(--muted)";
    txt.innerHTML = `Nothing logged yet. Tap <strong>+</strong> on each item as you eat.`;
  } else if (tot.cal < low) {
    dot.style.cssText =
      "background:var(--accent3);box-shadow:0 0 8px var(--accent3);";
    banner.style.borderLeftColor = "var(--accent3)";
    txt.innerHTML = `<strong style="color:var(--accent3)">${Math.round(tot.cal)} kcal</strong> logged · <strong style="color:var(--accent3)">${Math.round(low - tot.cal)} kcal</strong> below floor · <strong style="color:var(--accent)">${Math.round(high - tot.cal)} kcal</strong> of wiggle room for extras.`;
  } else if (tot.cal <= high) {
    dot.style.cssText =
      "background:var(--protein);box-shadow:0 0 8px var(--protein);";
    banner.style.borderLeftColor = "var(--protein)";
    txt.innerHTML = `<strong style="color:var(--protein)">${Math.round(tot.cal)} kcal</strong> logged — in range! <strong style="color:var(--protein)">${Math.round(high - tot.cal)} kcal</strong> of ceiling remaining.`;
  } else {
    dot.style.cssText =
      "background:var(--warn);box-shadow:0 0 8px var(--warn);";
    banner.style.borderLeftColor = "var(--warn)";
    txt.innerHTML = `<strong style="color:var(--warn)">${Math.round(tot.cal)} kcal</strong> — <strong style="color:var(--warn)">${Math.round(tot.cal - high)} kcal over</strong> your ${high.toLocaleString()} ceiling.`;
  }

  // Macros
  const calP = tot.p * 4,
    calC = tot.c * 4,
    calF = tot.f * 9;
  const totalMC = calP + calC + calF || 1;
  const pPct = ((calP / totalMC) * 100).toFixed(0);
  const cPct = ((calC / totalMC) * 100).toFixed(0);
  const fPct = ((calF / totalMC) * 100).toFixed(0);
  document.getElementById("bar-p").style.width = pPct + "%";
  document.getElementById("bar-c").style.width = cPct + "%";
  document.getElementById("bar-f").style.width = fPct + "%";
  document.getElementById("leg-p").textContent =
    pPct + "% · " + Math.round(tot.p) + "g";
  document.getElementById("leg-c").textContent =
    cPct + "% · " + Math.round(tot.c) + "g";
  document.getElementById("leg-f").textContent =
    fPct + "% · " + Math.round(tot.f) + "g";
}

async function renderWeeklyCost() {
  // TARGET column — static per-item breakdown
  const targetRows = document.getElementById("weekly-target-rows");
  targetRows.innerHTML = "";
  let targetTotal = 0;
  items.CORE_ITEMS.filter(item => !item.inactive && item.costPerServing > 0).forEach((item) => {
    const weeklyAmt = item.costPerServing * item.target * 7;
    targetTotal += weeklyAmt;
    const row = document.createElement("div");
    row.className = "cost-row";
    row.innerHTML = `<span>${item.name.split(" ").slice(0, 3).join(" ")}</span><span class="amt target-amt">$${weeklyAmt.toFixed(2)}</span>`;
    targetRows.appendChild(row);
  });
  document.getElementById("weekly-target-total").textContent =
    "$" + targetTotal.toFixed(2);

  // ACTUAL column — sum from IDB week record
  const weekStart = items.weekStartFor(items.todayStr());
  document.getElementById("week-start-label").textContent =
    formatDate(weekStart);

  let week;
  try {
    week = await db.dbGet("weeks", weekStart);
  } catch (e) {
    week = null;
  }
  const days = week ? week.days : {};

  const actualRows = document.getElementById("weekly-actual-rows");
  actualRows.innerHTML = "";

  // Group by core items: compute from all days in this week
  let coreActual = 0;
  let customActual = 0;
  let totalActual = 0;

  // Today's running totals (from live state, not DB snapshot which may be stale mid-day)
  const dayDates = Object.keys(days).sort();
  dayDates.forEach((dateStr) => {
    totalActual += days[dateStr].cost || 0;
  });

  // Also ensure today is current (live state overrides DB for today)
  const todayTot = items.computeTotals();
  if (days[items.todayStr()]) {
    // Subtract the DB version of today, add live version
    totalActual = totalActual - (days[items.todayStr()].cost || 0) + todayTot.cost;
  } else {
    totalActual += todayTot.cost;
  }

  // Per-day rows in actual
  const allDates = new Set([...dayDates, items.todayStr()]);
  const sortedDates = [...allDates].sort();

  sortedDates.forEach((dateStr) => {
    let dayCost;
    if (dateStr === items.todayStr()) {
      dayCost = todayTot.cost;
    } else {
      dayCost = days[dateStr] ? days[dateStr].cost : 0;
    }
    if (dayCost === 0 && dateStr !== items.todayStr()) return;
    const row = document.createElement("div");
    row.className = "cost-row";
    const isToday = dateStr === items.todayStr();
    row.innerHTML = `<span>${formatDateShort(dateStr)}${isToday ? ' <em style="color:var(--accent);font-style:normal;font-size:9px">today</em>' : ""}</span><span class="amt actual-amt">$${dayCost.toFixed(2)}</span>`;
    actualRows.appendChild(row);
  });

  if (
    sortedDates.filter((d) => d === items.todayStr() || (days[d] && days[d].cost > 0))
      .length === 0
  ) {
    actualRows.innerHTML =
      "<div style=\"font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);padding:6px 0;\">No spending logged yet this week.</div>";
  }

  document.getElementById("weekly-actual-total").textContent =
    "$" + totalActual.toFixed(2);
  document.getElementById("tot-week-cost") &&
    (document.getElementById("tot-week-cost").textContent =
      "$" + totalActual.toFixed(2));
}

// ═══════════════════════════════════════════════════════════════════
// HISTORY RENDER
// ═══════════════════════════════════════════════════════════════════
async function renderHistory() {

  // Chart containers
  const chartBlock = document.getElementById("history-charts-overall");
  if (chartBlock) chartBlock.style.display = "none";

  const container = document.getElementById("history-content");
  container.innerHTML =
    "<div style=\"color:var(--muted);font-family:'DM Mono',monospace;font-size:12px;padding:20px 0;\">Loading...</div>";

  let weeks;
  try {
    weeks = await db.dbGetAll("weeks");
  } catch (e) {
    weeks = [];
  }

  if (!weeks || weeks.length === 0) {
    if (chartBlock) chartBlock.style.display = "none";
    container.innerHTML =
      '<div class="no-history">No history yet.<br><br>Your daily logs will appear here as you track over time.</div>';
    return;
  }

  // ====== CHART DATA EXTRACTION ======
  // Calories per day
  let calLabels = [], calData = [], calTargetLow = [], calTargetHigh = [];
  // Weekly cost
  let weekLabels = [], weekCostData = [];
  // Macro split
  let macroTotals = { p: 0, c: 0, f: 0 };

  // Collect all days (flat)
  let allDays = [];
  weeks.forEach(week => {
    const days = week.days || {};
    Object.keys(days).forEach(date => {
      const d = days[date];
      if (d.cal > 0 || d.cost > 0) {
        allDays.push({ date, ...d });
        macroTotals.p += d.p || 0;
        macroTotals.c += d.c || 0;
        macroTotals.f += d.f || 0;
      }
    });
  });
  allDays.sort((a, b) => a.date.localeCompare(b.date));
  calLabels = allDays.map(d => d.date);
  calData = allDays.map(d => d.cal);
  calTargetLow = allDays.map(() => calRange.low);
  calTargetHigh = allDays.map(() => calRange.high);

  // Weekly cost
  weeks.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  weekLabels = weeks.map(w => w.weekStart);
  weekCostData = weeks.map(w => {
    const days = w.days || {};
    return Object.values(days).reduce((s, d) => s + (d.cost || 0), 0);
  });

  // ====== RENDER CHARTS WITH ECHARTS ======
  if (chartBlock) {
    chartBlock.style.display = "block";
    // Destroy old charts if present
    if (window._echartCalories) window._echartCalories.dispose();
    if (window._echartWeeklyCost) window._echartWeeklyCost.dispose();
    if (window._echartMacros) window._echartMacros.dispose();

    // Responsive resize handler for ECharts
    function resizeECharts(chart, dom) {
      if (!chart || !dom) return;
      setTimeout(() => chart.resize(), 0);
      window.addEventListener('resize', () => chart.resize(), { passive: true });
    }

    const shortDate = val => {
      const d = new Date(val + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Calories per day line chart
    const caloriesDom = document.getElementById("chart-calories");
    window._echartCalories = echarts.init(caloriesDom);
    const fmtCalDate = iso => {
      const d = new Date(iso + 'T00:00:00');
      const mo  = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const yr  = String(d.getFullYear()).slice(2);
      return `${mo}/${day}/${yr}`;
    };
    window._echartCalories.setOption({
      tooltip: { 
        trigger: 'axis',
        formatter: params => {
          const p = params[0];
          return `${fmtCalDate(p.axisValue)}<br/>Calories: ${p.value || 0} kcal`;
        }
      },
      grid: { left: 40, right: 20, top: 20, bottom: 55 },
      xAxis: {
        type: 'category',
        data: calLabels,
        axisLabel: {
          show: true,
          interval: 'auto',
          rotate: 35,
          fontSize: 10,
          color: '#7a7f96',
          formatter: fmtCalDate,
        },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 2200,
        splitLine: { show: false }
      },
      series: [
        {
          name: 'Calories',
          type: 'line',
          data: calData,
          smooth: true,
          symbolSize: 6,
          lineStyle: { color: '#60c8f0', width: 3 },
          areaStyle: { color: 'rgba(96,200,240,0.12)' },
        },
        {
          name: `Target Low (${calRange.low})`,
          type: 'line',
          data: calTargetLow,
          smooth: true,
          symbol: 'none',
          tooltip: { show: false },
          lineStyle: { color: '#60f0a0', type: 'dashed', width: 2 },
        },
        {
          name: `Target High (${calRange.high})`,
          type: 'line',
          data: calTargetHigh,
          smooth: true,
          symbol: 'none',
          tooltip: { show: false },
          lineStyle: { color: '#f0a060', type: 'dashed', width: 2 },
        },
      ],
      legend: { show: false },
    });
    resizeECharts(window._echartCalories, caloriesDom);

    // Weekly cost bar chart
    const fmtWeekDate = iso => {
      const d = new Date(iso + 'T00:00:00');
      const mo  = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const yr  = String(d.getFullYear()).slice(2);
      return `${mo}/${day}/${yr}`;
    };
    const weekDom = document.getElementById("chart-weekly-cost");
    window._echartWeeklyCost = echarts.init(weekDom);
    window._echartWeeklyCost.setOption({
      tooltip: {
        trigger: 'axis',
        formatter: params => {
          const p = params[0];
          return `${fmtWeekDate(p.axisValue)}<br/>Cost: $${(p.value || 0).toFixed(2)}`;
        }
      },
      grid: { left: 40, right: 20, top: 20, bottom: 55 },
      xAxis: {
        type: 'category',
        data: weekLabels,
        axisLabel: {
          show: true,
          interval: 'auto',
          rotate: 35,
          fontSize: 10,
          color: '#7a7f96',
          formatter: fmtWeekDate,
        },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        min: 0,
        splitLine: { show: false }
      },
      series: [
        {
          name: 'Cost',
          type: 'bar',
          data: weekCostData,
          itemStyle: {
            color: '#FF6B6B',
            borderRadius: [6, 6, 0, 0],
          },
          emphasis: {
            itemStyle: {
              color: '#c8f060'
            }
          },
          barWidth: '98%',
        },
      ],
      legend: { show: false },
    });
    resizeECharts(window._echartWeeklyCost, weekDom);

    // Macro split doughnut chart
    const macrosDom = document.getElementById("chart-macros");
    window._echartMacros = echarts.init(macrosDom);
    window._echartMacros.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
      series: [
        {
          name: 'Macros',
          type: 'pie',
          radius: ['55%', '80%'],
          avoidLabelOverlap: true,
          label: {
            show: false,
            position: 'outside',
            formatter: '{b}: {d}%',
            color: 'whitesmoke',
            fontWeight: 'bold',
            fontSize: 13,
            textBorderColor: 'rgba(0,0,0,0.25)',
            textBorderWidth: 2,
          },
          emphasis: {
            label: {
              show: false,
              fontSize: 15,
              fontWeight: 'bold',
              color: 'whitesmoke',
              textBorderColor: 'rgba(0,0,0,0.35)',
              textBorderWidth: 3,
            }
          },
          labelLine: {
            show: false,
            lineStyle: { color: 'whitesmoke' }
          },
          data: [
            { value: macroTotals.p, name: 'Protein', itemStyle: { color: '#60f0a0' } },
            { value: macroTotals.c, name: 'Carbs', itemStyle: { color: '#f0d060' } },
            { value: macroTotals.f, name: 'Fat', itemStyle: { color: '#f09060' } },
          ]
        }
      ],
      legend: {
        show: true,
        type: 'scroll',
        orient: 'vertical',
        right: 0,
        bottom: 0,
        textStyle: {
          color: 'whitesmoke',
          fontWeight: 'normal',
          fontSize: 12,
          textBorderColor: 'rgba(0,0,0,0.25)',
          textBorderWidth: 2,
        }
      },
    });
    resizeECharts(window._echartMacros, macrosDom);

  }

  // Sort weeks oldest first for grouping
  weeks.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  // Group weeks by month (YYYY-MM)
  const monthMap = {};
  weeks.forEach((week) => {
    const m = week.weekStart.slice(0, 7); // "YYYY-MM"
    if (!monthMap[m]) monthMap[m] = [];
    monthMap[m].push(week);
  });


  // Remove overall stats block, just clear container
  container.innerHTML = "";

  // Accordion month grouping
  let openMonth = null;
  const monthKeys = Object.keys(monthMap).sort((a, b) => b.localeCompare(a));
  monthKeys.forEach((month, mi) => {
    const monthWeeks = monthMap[month];
    // Compute month stats (optional, can be shown in header)
    let mStats = {
      days: 0,
      totalCal: 0,
      totalCost: 0,
      inRangeDays: 0,
      totalProtein: 0,
      totalCarb: 0,
      totalFat: 0,
    };
    monthWeeks.forEach((week) => {
      const days = week.days || {};
      Object.values(days).forEach((day) => {
        if (day.cal > 0 || day.cost > 0) {
          mStats.days++;
          mStats.totalCal += day.cal || 0;
          mStats.totalCost += day.cost || 0;
          mStats.totalProtein += day.p || 0;
          mStats.totalCarb += day.c || 0;
          mStats.totalFat += day.f || 0;
          if (day.cal >= calRange.low && day.cal <= calRange.high) mStats.inRangeDays++;
        }
      });
    });
    // Month accordion block
    const monthBlock = document.createElement("div");
    monthBlock.className = "month-block";
    const monthLabel = new Date(month + "-01T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" });
    monthBlock.innerHTML = `
      <div class="month-block-inner" style="
        border:1.5px solid var(--border);
        border-radius:12px;
        background:var(--bg2);
        box-shadow:0 1px 4px rgba(0,0,0,0.03);
        margin-bottom:18px;
        font-family:'DM Mono',monospace;
        overflow:hidden;
      ">
        <div class="month-header week-header" style="
          cursor:pointer;user-select:none;
          padding:16px 18px 12px 18px;
          border-bottom-right-radius: 0px;
          border-bottom-left-radius: 0px;
          background: var(--surface);
          display:flex;align-items:flex-start;gap:8px;flex-direction:column;
          font-family:'DM Mono',monospace;
        " data-month="${month}">
          <div class="month-header-label-row" style="display:flex;align-items:center;gap:10px;width:100%;justify-content:space-between;">
            <div class="month-label" style="font-size:16px;font-weight:700;letter-spacing:0.01em;color:var(--fg);font-family:'Syne', sans-serif,monospace;">${monthLabel}</div>
            <div class="month-chevron week-chevron" style="color:var(--muted);font-size:20px;transition:transform 0.2s;font-family:'DM Mono',monospace;">▼</div>
          </div>
          <div class="month-stats-scroll" style="position:relative;overflow-x:auto;width:100%;margin-top:2px;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
            <table style="margin-top:6px;font-size:12px;color:var(--muted);border-collapse:collapse;font-family:'DM Mono',monospace;min-width:700px;width:max-content;">
              <thead>
                <tr>
                  <th style="padding-right:18px;text-align:left;font-weight:500;">kcal/day</th>
                  <th style="padding-right:18px;text-align:left;font-weight:500;">$/day</th>
                  <th style="padding-right:18px;text-align:left;font-weight:500;">Hit rate</th>
                  <th style="padding-right:18px;text-align:left;font-weight:500;">protein/day</th>
                  <th style="padding-right:18px;text-align:left;font-weight:500;">carbs/day</th>
                  <th style="text-align:left;font-weight:500;">fat/day</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding-right:18px;">~<strong style="color:var(--protein);font-weight:600;">${mStats.days ? Math.round(mStats.totalCal / mStats.days) : 0}</strong></td>
                  <td style="padding-right:18px;">~<strong style="color:var(--accent);font-weight:600;">$${mStats.days ? (mStats.totalCost / mStats.days).toFixed(2) : '0.00'}</strong></td>
                  <td style="padding-right:18px;">~<strong style="color:var(--protein);font-weight:600;">${mStats.days ? Math.round((mStats.inRangeDays / mStats.days) * 100) : 0}%</strong></td>
                  <td style="padding-right:18px;">~<strong style="color:var(--protein);font-weight:600;">${mStats.days ? Math.round(mStats.totalProtein / mStats.days) : 0}g</strong></td>
                  <td style="padding-right:18px;">~<strong style="color:var(--carbs);font-weight:600;">${mStats.days ? Math.round(mStats.totalCarb / mStats.days) : 0}g</strong></td>
                  <td>~<strong style="color:var(--fat);font-weight:600;">${mStats.days ? (mStats.totalFat / mStats.days).toFixed(1) : 0}g</strong></td>
                </tr>
              </tbody>
            </table>
            <!-- fade removed -->
          </div>
        </div>
        <div class="month-weeks" style="display:none; margin-top: 12px;"></div>
      </div>
    `;

    // Render weeks inside month
    const weeksContainer = monthBlock.querySelector('.month-weeks');
    monthWeeks.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    monthWeeks.forEach((week) => {
      const days = week.days || {};
      const dayDates = Object.keys(days).sort((a, b) => b.localeCompare(a));
      if (dayDates.length === 0) return;

      const weekTotal = dayDates.reduce((s, d) => s + (days[d].cost || 0), 0);
      const weekCal = dayDates.reduce((s, d) => s + (days[d].cal || 0), 0);
      const avgCal = dayDates.length > 0 ? Math.round(weekCal / dayDates.length) : 0;
      const weekEnd = (() => {
        const d = new Date(week.weekStart + "T00:00:00");
        d.setDate(d.getDate() + 6);
        return d.toLocaleDateString("en-CA");
      })();
      const block = document.createElement("div");
      block.className = "week-block";
      const isCurrentWeek = week.weekStart === items.weekStartFor(items.todayStr());
      block.innerHTML = `
        <div class="week-header" onclick="toggleWeek(this)">
        <div class="week-header-left">
            <div class="week-label">${formatDateShort(week.weekStart)} – ${formatDateShort(weekEnd)} ${isCurrentWeek ? "<span style=\"color:var(--accent);font-size:10px;font-family:'DM Mono', sans-serif;\">current</span>" : ""}</div>
            <div class="week-days-logged">${dayDates.length} day(s) logged</div>
        </div>
        <div class="week-header-right">
            <div class="week-summary-stat">avg <span>${avgCal} kcal</span>/day</div>
            <div class="week-summary-stat">total <span class="wcost">$${weekTotal.toFixed(2)}</span></div>
            <div class="week-chevron">▼</div>
        </div>
        </div>
        <div class="week-days">
        <table class="days-table">
            <thead>
            <tr>
                <th>Date</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Cost</th>
            </tr>
            </thead>
            <tbody>
        ${dayDates
          .map((d) => {
            const day = days[d];
            const inRange = day.cal >= calRange.low && day.cal <= calRange.high;
            const rangeLabel =
              day.cal === 0
                ? ""
                : inRange
                  ? '<br><span class="in-range">✓ in range</span>'
                  : '<br><span class="out-range">⚠ out</span>';
            return `<tr>
              <td><span class="day-date">${formatDate(d)}</span>${rangeLabel}</td>
              <td class="day-cal">${Math.round(day.cal)} kcal</td>
              <td class="day-p">${Math.round(day.p)}g</td>
              <td class="day-c">${Math.round(day.c)}g</td>
              <td class="day-f">${day.f ? day.f.toFixed(1) : 0}g</td>
              <td class="day-cost">$${(day.cost || 0).toFixed(2)}</td>
            </tr>`;
          })
          .join("")}
            <tr class="week-total-row">
              <td class="week-total-label">Week Total</td>
              <td class="day-cal">${Math.round(weekCal)} kcal</td>
              <td class="day-p">${Math.round(dayDates.reduce((s, d) => s + (days[d].p || 0), 0))}g</td>
              <td class="day-c">${Math.round(dayDates.reduce((s, d) => s + (days[d].c || 0), 0))}g</td>
              <td class="day-f">${dayDates.reduce((s, d) => s + (days[d].f || 0), 0).toFixed(1)}g</td>
              <td class="day-cost">$${weekTotal.toFixed(2)}</td>
            </tr>
            </tbody>
        </table>
        </div>`;
      if (isCurrentWeek) block.classList.add("open");
      weeksContainer.appendChild(block);
    });
    container.appendChild(monthBlock);
  });

  // Accordion logic: only one month open at a time
  const allMonthBlocks = container.querySelectorAll('.month-block');
  allMonthBlocks.forEach((mb, i) => {
    const header = mb.querySelector('.month-header');
    const weeks = mb.querySelector('.month-weeks');
    header.addEventListener('click', () => {
      allMonthBlocks.forEach((other, j) => {
        const otherWeeks = other.querySelector('.month-weeks');
        const otherChevron = other.querySelector('.month-chevron');
        if (i === j) {
          const open = otherWeeks.style.display === 'block';
          otherWeeks.style.display = open ? 'none' : 'block';
          otherChevron.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
        } else {
          otherWeeks.style.display = 'none';
          otherChevron.style.transform = 'rotate(0deg)';
        }
      });
    });
    // All months closed initially (no auto-open)
    weeks.style.display = 'none';
    const chevron = mb.querySelector('.month-chevron');
    chevron.style.transform = 'rotate(0deg)';
  });

  // Hide horizontal scrollbar and show fade indicator if scrollable
    const scrollBlocks = container.querySelectorAll('.month-stats-scroll');
    scrollBlocks.forEach(block => {
        // Hide scrollbar cross-browser
        block.style.scrollbarWidth = 'none'; // Firefox
        block.style.msOverflowStyle = 'none'; // IE/Edge
        block.style.overflowY = 'hidden';
        // Webkit
        block.classList.add('hide-scrollbar');
    });
}

function toggleWeek(header) {
  header.parentElement.classList.toggle("open");
}

// ═══════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════
function handleAdjustServing(id, delta) {
  items.adjustServing(id, delta);
  persistState();
  render();
}

// Custom item cost calculator
function calcCostPerServing() {
  const bulkPrice =
    parseFloat(document.getElementById("cf-bulk-price").value) || 0;
  const bulkServings =
    parseFloat(document.getElementById("cf-bulk-servings").value) || 0;
  const eatenToday =
    parseFloat(document.getElementById("cf-servings-eaten").value) || 1;

  if (bulkPrice > 0 && bulkServings > 0) {
    const perSrv = bulkPrice / bulkServings;
    document.getElementById("cf-cost-per-srv").value = perSrv.toFixed(2);
    document.getElementById("cf-cost-hint").textContent =
      `= $${perSrv.toFixed(2)} per serving`;
  }

  const perSrv =
    parseFloat(document.getElementById("cf-cost-per-srv").value) || 0;
  const todayCost = perSrv * eatenToday;
  document.getElementById("cf-today-cost-hint").textContent =
    `today's cost: $${todayCost.toFixed(2)}`;
}

function clearBulkIfManual() {
  // User typed cost/srv manually — clear bulk fields so they don't conflict
  document.getElementById("cf-bulk-price").value = "";
  document.getElementById("cf-bulk-servings").value = "";
  document.getElementById("cf-cost-hint").textContent = "or enter manually";
  const perSrv =
    parseFloat(document.getElementById("cf-cost-per-srv").value) || 0;
  const eaten =
    parseFloat(document.getElementById("cf-servings-eaten").value) || 1;
  document.getElementById("cf-today-cost-hint").textContent =
    `today's cost: $${(perSrv * eaten).toFixed(2)}`;
}

async function handleAddCustomItem() {
  const name = document.getElementById("cf-name").value.trim();
  if (!name) {
    document.getElementById("cf-name").focus();
    return;
  }
  const servingsEaten =
    parseFloat(document.getElementById("cf-servings-eaten").value) || 1;
  const costPerSrv =
    parseFloat(document.getElementById("cf-cost-per-srv").value) || 0;
  const bulkPrice =
    parseFloat(document.getElementById("cf-bulk-price").value) || 0;
  const bulkServings =
    parseFloat(document.getElementById("cf-bulk-servings").value) || 0;
  const todayCost = costPerSrv * servingsEaten;
  const calPerSrv = parseFloat(document.getElementById("cf-cal").value) || 0;
  const pPerSrv = parseFloat(document.getElementById("cf-p").value) || 0;
  const cPerSrv = parseFloat(document.getElementById("cf-c").value) || 0;
  const fPerSrv = parseFloat(document.getElementById("cf-f").value) || 0;
  if (!await showConfirm(`Add "${name}" to today's log?`, 'Add')) return;
  items.addCustomItem({
    name,
    cal: calPerSrv * servingsEaten,
    p: pPerSrv * servingsEaten,
    c: cPerSrv * servingsEaten,
    f: fPerSrv * servingsEaten,
    servingsEaten,
    costPerSrv,
    todayCost,
    bulkPrice: bulkPrice || null,
    bulkServings: bulkServings || null,
  });
  persistState();
  render();
  [
    "cf-name",
    "cf-cal",
    "cf-p",
    "cf-c",
    "cf-f",
    "cf-bulk-price",
    "cf-bulk-servings",
    "cf-cost-per-srv",
  ].forEach((id) => (document.getElementById(id).value = ""));
  document.getElementById("cf-servings-eaten").value = "1";
  document.getElementById("cf-cost-hint").textContent = "or enter manually";
  document.getElementById("cf-today-cost-hint").textContent =
    "today's cost: $0.00";
  document.getElementById("cf-name").focus();
}

async function handleRemoveCustomItem(idx) {
  if (!await showConfirm('Delete this custom food?', 'Delete')) return;
  items.removeCustomItem(idx);
  persistState();
  render();
}

function openCustomFoodEditModal(idx) {
  const item = items.customItems[idx];
  if (!item) return;
  const srv = item.servingsEaten || 1;
  const calPerSrv = Math.round((item.cal / srv) * 10) / 10;
  const pPerSrv = Math.round((item.p / srv) * 10) / 10;
  const cPerSrv = Math.round((item.c / srv) * 10) / 10;
  const fPerSrv = Math.round((item.f / srv) * 10) / 10;
  const safeName = String(item.name || '').replace(/"/g, '&quot;');

  if (!document.getElementById('custom-food-edit-modal')) {
    const el = document.createElement('div');
    el.id = 'custom-food-edit-modal';
    el.className = 'pg-modal';
    el.addEventListener('click', (e) => { if (e.target === el) el.classList.remove('open'); });
    document.body.appendChild(el);
  }

  const modal = document.getElementById('custom-food-edit-modal');
  modal.innerHTML = `
    <div class="pg-modal-box pg-modal-box-lg">
      <div class="pg-modal-header">
        <div class="pg-modal-title">Edit Custom Food</div>
        <button class="pg-close-btn" onclick="document.getElementById('custom-food-edit-modal').classList.remove('open')">×</button>
      </div>
      <div class="pg-modal-body">
        <div class="add-row add-row-1">
          <div class="field-group">
            <span class="field-label">Name</span>
            <input type="text" id="cfe-name" placeholder="e.g. Banana" value="${safeName}" />
          </div>
          <div class="field-group">
            <span class="field-label">Calories</span>
            <input type="number" id="cfe-cal" placeholder="105" min="0" value="${calPerSrv || ''}" />
          </div>
          <div class="field-group">
            <span class="field-label">Protein (g)</span>
            <input type="number" id="cfe-p" placeholder="1" min="0" value="${pPerSrv || ''}" />
          </div>
          <div class="field-group">
            <span class="field-label">Carbs (g)</span>
            <input type="number" id="cfe-c" placeholder="27" min="0" value="${cPerSrv || ''}" />
          </div>
          <div class="field-group">
            <span class="field-label">Fat (g)</span>
            <input type="number" id="cfe-f" placeholder="0" min="0" value="${fPerSrv || ''}" />
          </div>
        </div>
        <div class="add-row add-row-2" style="margin-top:12px;">
          <div class="field-group">
            <span class="field-label">Bulk Total Price ($)</span>
            <input type="number" id="cfe-bulk-price" placeholder="15.00" min="0" step="0.01" value="${item.bulkPrice || ''}" />
            <span class="field-hint">total you paid</span>
          </div>
          <div class="field-group">
            <span class="field-label">Servings in Package</span>
            <input type="number" id="cfe-bulk-servings" placeholder="30" min="1" value="${item.bulkServings || ''}" />
            <span class="field-hint">total servings</span>
          </div>
          <div class="field-group">
            <span class="field-label">Cost / Serving ($)</span>
            <input type="number" id="cfe-cost-per-srv" placeholder="0.50" min="0" step="0.01" value="${item.costPerSrv || ''}" />
          </div>
          <div class="field-group">
            <span class="field-label">Servings Eaten Today</span>
            <input type="number" id="cfe-servings-eaten" placeholder="1" min="1" value="${item.servingsEaten || 1}" />
          </div>
        </div>
      </div>
      <div class="pg-modal-footer">
        <button class="ghost-btn pg-delete-btn" onclick="window.deleteCustomItemFromModal(${idx})">Delete</button>
        <div style="display:flex;gap:8px;">
          <button class="ghost-btn" onclick="document.getElementById('custom-food-edit-modal').classList.remove('open')">Cancel</button>
          <button class="add-btn" onclick="window.saveCustomItemEdit(${idx})">Save</button>
        </div>
      </div>
    </div>
  `;
  modal.classList.add('open');
}
window.editCustomItem = openCustomFoodEditModal;

window.saveCustomItemEdit = async (idx) => {
  const name = document.getElementById('cfe-name').value.trim();
  if (!name) { document.getElementById('cfe-name').focus(); return; }
  if (!await showConfirm(`Save changes to "${name}"?`, 'Save')) return;
  const servingsEaten = parseFloat(document.getElementById('cfe-servings-eaten').value) || 1;
  const calPerSrv = parseFloat(document.getElementById('cfe-cal').value) || 0;
  const pPerSrv = parseFloat(document.getElementById('cfe-p').value) || 0;
  const cPerSrv = parseFloat(document.getElementById('cfe-c').value) || 0;
  const fPerSrv = parseFloat(document.getElementById('cfe-f').value) || 0;
  const costPerSrv = parseFloat(document.getElementById('cfe-cost-per-srv').value) || 0;
  const bulkPrice = parseFloat(document.getElementById('cfe-bulk-price').value) || null;
  const bulkServings = parseFloat(document.getElementById('cfe-bulk-servings').value) || null;
  const item = items.customItems[idx];
  item.name = name;
  item.cal = calPerSrv * servingsEaten;
  item.p = pPerSrv * servingsEaten;
  item.c = cPerSrv * servingsEaten;
  item.f = fPerSrv * servingsEaten;
  item.servingsEaten = servingsEaten;
  item.costPerSrv = costPerSrv;
  item.todayCost = costPerSrv * servingsEaten;
  item.bulkPrice = bulkPrice;
  item.bulkServings = bulkServings;
  document.getElementById('custom-food-edit-modal').classList.remove('open');
  persistState();
  render();
};

window.deleteCustomItemFromModal = async (idx) => {
  if (!await showConfirm('Delete this custom food?', 'Delete')) return;
  document.getElementById('custom-food-edit-modal').classList.remove('open');
  items.removeCustomItem(idx);
  persistState();
  render();
};

async function resetWeeklyCost() {
  if (!await showConfirm("Reset the weekly cost tracker? This deletes all logged days for this week.", 'Reset'))
    return;
  const weekStart = items.weekStartFor(items.todayStr());
  try {
    await db.dbDelete("weeks", weekStart);
  } catch (e) {}
  render();
  renderWeeklyCost();
}

async function confirmResetDay() {
  if (!await showConfirm("Reset today's log? All serving counts and custom items will be cleared.", 'Reset'))
    return;
  // Mutate, don't reassign ES module exports
  Object.keys(items.servings).forEach(k => { delete items.servings[k]; });
  items.CORE_ITEMS.forEach((item) => {
    items.servings[item.id] = 0;
  });
  items.customItems.length = 0;
  persistState();
  // Also clear today's entry in the weekly record
  (async () => {
    const weekStart = items.weekStartFor(items.todayStr());
    let week;
    try {
      week = await db.dbGet("weeks", weekStart);
    } catch (e) {
      week = null;
    }
    if (week && week.days && week.days[items.todayStr()]) {
      // Remove today's entry if all values are zero
      week.days[items.todayStr()] = {
        cal: 0, p: 0, c: 0, f: 0, cost: 0
      };
      await db.dbPut("weeks", week);
    }
    renderWeeklyCost();
  })();
  render();
}

// ═══════════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════════
function switchTab(name) {
  document
    .querySelectorAll(".tab-view")
    .forEach((v) => v.classList.remove("active"));
  document
    .querySelectorAll(".nav-tab")
    .forEach((t) => t.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  event.target.classList.add("active");
  if (name === "history") renderHistory();
  if (name === "coreitems") renderCoreItemsMgmt();
  if (name === "programs") programs.renderProgramsTab();
}

// ═══════════════════════════════════════════════════════════════════
// ENTER KEY in custom form
// ═══════════════════════════════════════════════════════════════════
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.activeElement?.id?.startsWith("cf-"))
    items.addCustomItem();
});

function showCalRangeEditor() {
  document.getElementById("cal-range-editor").style.display = "block";
  document.getElementById("cal-range-low-input").value = calRange.low;
  document.getElementById("cal-range-high-input").value = calRange.high;
}
window.showCalRangeEditor = showCalRangeEditor;

async function saveCalRange() {
  const low = parseInt(document.getElementById("cal-range-low-input").value) || calRange.low;
  const high = parseInt(document.getElementById("cal-range-high-input").value) || calRange.high;
  if (low >= high) return;
  if (!await showConfirm(`Set calorie range to ${low.toLocaleString()} – ${high.toLocaleString()} kcal?`, 'Save')) return;
  calRange = { low, high };
  await db.dbPut("settings", { key: "calRange", low, high });
  document.getElementById("cal-range-editor").style.display = "none";
  renderStats();
}
window.saveCalRange = saveCalRange;

function cancelCalRange() {
  document.getElementById("cal-range-editor").style.display = "none";
}
window.cancelCalRange = cancelCalRange;

// Expose functions for inline HTML event handlers
window.addCustomItem = handleAddCustomItem;
window.clearBulkIfManual = clearBulkIfManual;
window.calcCostPerServing = calcCostPerServing;
window.adjustServing = handleAdjustServing;
window.removeCustomItem = handleRemoveCustomItem;
window.switchTab = switchTab;
window.toggleWeek = toggleWeek;
window.toggleStatsAccordion = function() {
  const wrap = document.getElementById("history-charts-overall");
  wrap.classList.toggle("open");
  if (wrap.classList.contains("open")) {
    setTimeout(() => {
      if (window._echartCalories) window._echartCalories.resize();
      if (window._echartWeeklyCost) window._echartWeeklyCost.resize();
      if (window._echartMacros) window._echartMacros.resize();
    }, 50);
  }
};
window.confirmResetDay = confirmResetDay;
window.resetWeeklyCost = resetWeeklyCost;

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════
async function exportHistory(format) {
  // Close the dropdown
  document.querySelector(".export-dropdown")?.classList.remove("open");

  if (!await showConfirm(`Export history as ${format.toUpperCase()}?`, 'Export')) return;

  let allDays;
  try {
    allDays = await db.dbGetAll("days");
  } catch (e) {
    allDays = [];
  }
  if (!allDays || allDays.length === 0) {
    alert("No history to export.");
    return;
  }
  allDays.sort((a, b) => a.date.localeCompare(b.date));

  const timestamp = new Date().toLocaleDateString("en-CA");
  let content, mime, filename;

  if (format === "json") {
    const exportData = allDays.map(({ date, cal, p, c, f, cost }) => ({ date, cal, protein_g: p, carbs_g: c, fat_g: f, cost }));
    content = JSON.stringify(exportData, null, 2);
    mime = "application/json";
    filename = `foop-history-${timestamp}.json`;
  } else {
    const rows = [["date", "calories", "protein_g", "carbs_g", "fat_g", "cost"]];
    allDays.forEach(({ date, cal, p, c, f, cost }) => {
      rows.push([date, Math.round(cal), Math.round(p), Math.round(c), f.toFixed(1), cost.toFixed(2)]);
    });
    content = rows.map(r => r.join(",")).join("\n");
    mime = "text/csv";
    filename = `foop-history-${timestamp}.csv`;
  }

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportHistory = exportHistory;

function toggleExportDropdown(e) {
  e.stopPropagation();
  const dd = e.currentTarget.closest(".export-dropdown");
  const wasOpen = dd.classList.contains("open");
  document.querySelectorAll(".export-dropdown.open").forEach(el => el.classList.remove("open"));
  if (!wasOpen) dd.classList.add("open");
}
window.toggleExportDropdown = toggleExportDropdown;

document.addEventListener("click", () => {
  document.querySelectorAll(".export-dropdown.open").forEach(el => el.classList.remove("open"));
});

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
async function cleanupOldRecords() {
  // Retain up to 9 months of data (was 6). This is backwards compatible and will not wipe existing history.
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 9);
  const cutoffStr = cutoff.toLocaleDateString("en-CA");

  try {
    const allDays = await db.dbGetAll("days");
    for (const day of allDays) {
      if (day.date < cutoffStr) await db.dbDelete("days", day.date);
    }
    const allWeeks = await db.dbGetAll("weeks");
    for (const week of allWeeks) {
      if (week.weekStart < cutoffStr) await db.dbDelete("weeks", week.weekStart);
    }
  } catch (e) {
    console.warn("Cleanup failed", e);
  }
}

async function init() {
  await db.openDB();
  try {
    const saved = await db.dbGet("settings", "calRange");
    if (saved) calRange = { low: saved.low, high: saved.high };
  } catch (e) {}
  await items.loadCoreItems();
  await programs.loadAll();
  const saved = db.loadTodayLS(items.todayStr());
  if (saved) {
    Object.assign(items.servings, saved.servings || {});
    items.customItems.length = 0;
    if (saved.customItems) items.customItems.push(...saved.customItems);
  }
  items.CORE_ITEMS.forEach((item) => {
    if (items.servings[item.id] === undefined) items.servings[item.id] = 0;
  });
  render();
  // Only persist on init if there's already data loaded from today
  const initTot = items.computeTotals();
  if (initTot.cal > 0 || initTot.cost > 0) await persistState();

  // Auto-reset daily log at midnight
  let lastDate = items.todayStr();
  setInterval(() => {
    const nowDate = items.todayStr();
    if (nowDate !== lastDate) {
      lastDate = nowDate;
      // Clear servings and custom items for new day
      Object.keys(items.servings).forEach(k => { delete items.servings[k]; });
      items.CORE_ITEMS.forEach((item) => {
        items.servings[item.id] = 0;
      });
      items.customItems.length = 0;
      persistState();
      render();
    }
  }, 5 * 60 * 1000); // check every 5 minutes
}

init();
