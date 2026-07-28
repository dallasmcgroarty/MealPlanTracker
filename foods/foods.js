import * as db from "../db.js";
import { CORE_ITEMS, loadCoreItems, saveCoreItem, deleteCoreItemFromDB } from "../items.js";
import { showConfirm, showAlert } from "../ui.js";
import * as barcode from "../barcode.js";
import "../nav.js";
import "../settingsHint.js";

let editingCoreItemIdx = null;

// ═══════════════════════════════════════════════════════════════════
// FOOD FORM MODAL (add / edit)
// ═══════════════════════════════════════════════════════════════════
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
            <input type="number" id="ci-target" placeholder="2" min="0.5" step="0.5" oninput="window.updateFreqPreview()" />
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

function updateFreqPreview() {
  const raw = document.getElementById("ci-target").value;
  const target = raw === "" ? 1 : (parseFloat(raw) || 0);
  document.getElementById("ci-freq-preview").textContent = `${target} srv/day`;
}
window.updateFreqPreview = updateFreqPreview;

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
window.calcCoreCostPerServing = calcCoreCostPerServing;

function clearCoreBulkIfManual() {
  if (document.activeElement && document.activeElement.id === "ci-cost") {
    document.getElementById("ci-bulk-price").value = "";
    document.getElementById("ci-bulk-servings").value = "";
    document.getElementById("ci-cost-hint").textContent = "manual entry";
  }
}
window.clearCoreBulkIfManual = clearCoreBulkIfManual;

function fillFoodFormFromScan(foodData) {
  document.getElementById('ci-name').value = foodData.name || '';
  document.getElementById('ci-cal').value = foodData.cal ?? 0;
  document.getElementById('ci-p').value = foodData.p ?? 0;
  document.getElementById('ci-c').value = foodData.c ?? 0;
  document.getElementById('ci-f').value = foodData.f ?? 0;
  updateFreqPreview();
}

function fillCoreItemForm(idx) {
  const item = CORE_ITEMS[idx];
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
  document.getElementById("food-modal-delete-btn").onclick = async function () {
    if (!await showConfirm("Delete this food?", 'Delete')) return;
    CORE_ITEMS.splice(idx, 1);
    await deleteCoreItemFromDB(item.id);
    closeFoodModal();
    renderCoreItemsMgmt();
  };
  document.getElementById("food-modal-submit").onclick = async function (e) {
    if (e) e.preventDefault();
    const updatedName = document.getElementById("ci-name").value.trim();
    if (!updatedName) return;
    if (!await showConfirm(`Save changes to "${updatedName}"?`, 'Save')) return;
    item.name = updatedName;
    item.cal = Math.max(0, parseFloat(document.getElementById("ci-cal").value) || 0);
    item.p = Math.max(0, parseFloat(document.getElementById("ci-p").value) || 0);
    item.c = Math.max(0, parseFloat(document.getElementById("ci-c").value) || 0);
    item.f = Math.max(0, parseFloat(document.getElementById("ci-f").value) || 0);
    item.costPerServing = Math.max(0, parseFloat(document.getElementById("ci-cost").value) || 0);
    const targetRaw = document.getElementById("ci-target").value;
    item.target = Math.max(0, targetRaw === "" ? 1 : (parseFloat(targetRaw) || 0));
    const freqDetails = document.getElementById("ci-freq").value.trim();
    item.freq = `${item.target} srv/day${freqDetails ? ' · ' + freqDetails : ''}`;
    await saveCoreItem(item);
    closeFoodModal();
    renderCoreItemsMgmt();
  };
}

async function handleAddCoreItem(e) {
  if (e) e.preventDefault();
  const name = document.getElementById("ci-name").value.trim();
  const cal = Math.max(0, parseFloat(document.getElementById("ci-cal").value) || 0);
  const p = Math.max(0, parseFloat(document.getElementById("ci-p").value) || 0);
  const c = Math.max(0, parseFloat(document.getElementById("ci-c").value) || 0);
  const f = Math.max(0, parseFloat(document.getElementById("ci-f").value) || 0);
  const cost = Math.max(0, parseFloat(document.getElementById("ci-cost").value) || 0);
  const targetRaw = document.getElementById("ci-target").value;
  const target = Math.max(0, targetRaw === "" ? 1 : (parseFloat(targetRaw) || 0));
  if (!name) return;
  const freqDetails = document.getElementById("ci-freq").value.trim();
  const freq = `${target} srv/day${freqDetails ? ' · ' + freqDetails : ''}`;
  const newItem = {
    id: 'food_' + Date.now(),
    name, cal, p, c, f,
    costPerServing: cost,
    target, freq,
    inactive: false
  };
  if (!await showConfirm(`Add "${name}" as a core item?`, 'Add')) return;
  CORE_ITEMS.push(newItem);
  await saveCoreItem(newItem);
  closeFoodModal();
  renderCoreItemsMgmt();
}
window.handleAddCoreItem = handleAddCoreItem;

async function deleteCoreItem(idx) {
  if (!await showConfirm("Delete this food?", 'Delete')) return;
  const item = CORE_ITEMS[idx];
  CORE_ITEMS.splice(idx, 1);
  await deleteCoreItemFromDB(item.id);
  renderCoreItemsMgmt();
}
window.deleteCoreItem = deleteCoreItem;

function toggleActiveCoreItem(btn, idx) {
  const item = CORE_ITEMS[idx];
  item.inactive = !item.inactive;
  btn.textContent = item.inactive ? 'Show' : 'Hide';
  saveCoreItem(item);
  renderCoreItemsMgmt();
}
window.toggleActiveCoreItem = toggleActiveCoreItem;

function editCoreItem(idx) {
  editingCoreItemIdx = idx;
  openFoodModal(true);
  fillCoreItemForm(idx);
}
window.editCoreItem = editCoreItem;

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
// BARCODE SCANNING (new food)
// ═══════════════════════════════════════════════════════════════════
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

async function startBarcodeFlow() {
  const access = await barcode.requestCameraAccess();
  if (!access.ok) {
    showScannerError(access.message);
    return;
  }
  closeAddFoodChoiceModal();
  barcode.openScannerModal(async (decodedBarcode) => {
    editingCoreItemIdx = null;
    openFoodModal(false);
    document.getElementById('ci-target').value = '1';
    document.getElementById('ci-freq-preview').textContent = '1 srv/day';
    document.getElementById('ci-cost-hint').textContent = 'or enter manually';
    document.getElementById('food-modal-submit').onclick = handleAddCoreItem;
    try {
      const foodData = await barcode.lookupFood(decodedBarcode);
      if (!foodData) {
        showAlert('No Data Found', 'No nutrition info available for this product.');
      } else {
        fillFoodFormFromScan(foodData);
      }
    } catch (err) {
      if (err && err.isRateLimit) showAlert('Slow Down', err.message);
    }
  });
}
window.startBarcodeFlow = startBarcodeFlow;

// ═══════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCoreItemsMgmt() {
  const list = document.getElementById("core-items-mgmt-list");
  list.innerHTML = "";
  if (!CORE_ITEMS.length) {
    list.innerHTML = '<div class="no-foods" style="color:var(--muted);padding:20px 0;">No saved foods found.</div>';
    return;
  }
  CORE_ITEMS.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "mgmt-card" + (item.inactive ? " done" : "");
    card.innerHTML = `
      <div class="mgmt-card-top">
        <div class="mgmt-card-name">${esc(item.name)}${item.inactive ? ' <span class="mgmt-card-status">inactive</span>' : ''}</div>
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

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
async function init() {
  await db.openDB();
  await loadCoreItems();
  renderCoreItemsMgmt();
}

init();
