import { esc, showConfirm, showAlert, showDbError } from "../../../../lib/ui.js";
import { openDB } from "../../../../lib/db.js";
import { CORE_ITEMS, loadCoreItems } from "../../../../lib/items.js";
import { GROCERY_PLANS, loadGroceryPlans, saveGroceryPlan, deleteGroceryPlanFromDB } from "../../../../lib/groceryPlans.js";
import * as prefs from "../../../../lib/prefs.js";

// A page-local override of the displayed currency — never touches the global
// prefs.js currency setting, and never performs conversion math. Every value
// on this page is entered in whatever currency the user is already thinking
// in; this only changes the symbol shown next to it. Stored as a currency
// code (one of prefs.CURRENCIES) so it can share the same dropdown UI as the
// Settings page's currency picker; "" means "use the Settings default".
const CURRENCY_OVERRIDE_LS_KEY = "nawtch_gbc_currency_override";
let currencyOverrideCode = "";
let globalCurrencyCode = "USD";

function gbSymbol() {
  return currencyOverrideCode ? prefs.CURRENCY_SYMBOLS[currencyOverrideCode] : prefs.getCurrencySymbol();
}
function gbFormatCurrency(amount) {
  return `${gbSymbol()}${(amount || 0).toFixed(2)}`;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

function newWorkingPlan() {
  return { id: null, name: "", createdAt: null, items: [] };
}
let workingPlan = newWorkingPlan();

function defaultPlanName() {
  const d = new Date();
  return "Grocery Plan — " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ═══════════════════════════════════════════════════════════════════
// COST MATH
// ═══════════════════════════════════════════════════════════════════
function weeklyTarget(item) {
  return item.targetUnit === "week" ? item.targetValue : item.targetValue * 7;
}
function itemCosts(item) {
  return { pacedCost: item.costPerServing * weeklyTarget(item) };
}
function planTotals(items) {
  let paced = 0;
  items.forEach((item) => {
    paced += itemCosts(item).pacedCost;
  });
  return { paced, monthly: paced * 4.33 };
}

// ═══════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════
function renderAll() {
  renderTotals();
  renderItemList();
}

function renderTotals() {
  const totals = planTotals(workingPlan.items);
  document.getElementById("gb-total-paced").textContent = gbFormatCurrency(totals.paced);
  document.getElementById("gb-total-monthly").textContent = gbFormatCurrency(totals.monthly);
}

function renderItemList() {
  const list = document.getElementById("gb-item-list");
  if (workingPlan.items.length === 0) {
    list.innerHTML = `<div class="gb-empty-note">Nothing on your list yet — search your Foods or add a custom item to get started.</div>`;
    return;
  }
  list.innerHTML = workingPlan.items
    .map((item) => {
      const costs = itemCosts(item);
      const sym = gbSymbol();
      return `
      <div class="gb-item-row" data-item-id="${item.id}">
        <div class="gb-item-row-top">
          <div class="gb-item-name">${esc(item.name)}</div>
          <span class="material-symbols-outlined gb-remove-btn" role="button" tabindex="0" aria-label="Remove ${esc(item.name)}" onclick="window.gbRemoveItem('${item.id}')">close</span>
        </div>
        <div class="gb-item-fields">
          <div class="field-group">
            <label class="field-label">Cost per serving (${sym})</label>
            <input type="number" class="gb-cost-input" min="0" step="0.01" value="${item.costPerServing || ""}" placeholder="0.00" oninput="window.gbSetCost('${item.id}', this.value)" />
          </div>
          <div class="field-group">
            <label class="field-label">Target servings</label>
            <div class="gb-target-row">
              <input type="number" min="0" step="0.1" value="${item.targetValue}" oninput="window.gbSetTargetValue('${item.id}', this.value)" />
              <button type="button" class="gb-unit-toggle-btn ${item.targetUnit === "day" ? "active" : ""}" onclick="window.gbSetTargetUnit('${item.id}','day')">/day</button>
              <button type="button" class="gb-unit-toggle-btn ${item.targetUnit === "week" ? "active" : ""}" onclick="window.gbSetTargetUnit('${item.id}','week')">/week</button>
            </div>
          </div>
        </div>
        <div class="gb-bulk-helper">
          <div class="gb-bulk-helper-row">
            <div class="field-group">
              <label class="field-label">Bulk Total Price (${sym})</label>
              <input type="number" min="0" step="0.01" value="${item.bulkTotalPrice || ""}" placeholder="15.00" oninput="window.gbSetBulkPrice('${item.id}', this.value)" />
            </div>
            <div class="field-group">
              <label class="field-label">Total Servings</label>
              <input type="number" min="0" step="1" value="${item.packageServings > 0 ? item.packageServings : ""}" placeholder="30" oninput="window.gbSetBulkServings('${item.id}', this.value)" />
            </div>
          </div>
        </div>
        <div class="gb-item-results">
          <div class="gb-item-result">
            <span class="gb-item-result-label" title="What this item actually costs you per week, based on your target servings">Paced this week</span>
            <span class="gb-item-result-value">${gbFormatCurrency(costs.pacedCost)}/wk</span>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function renderSavedPlans() {
  const list = document.getElementById("gb-saved-plans-list");
  const empty = document.getElementById("gb-saved-plans-empty");
  if (GROCERY_PLANS.length === 0) {
    list.innerHTML = "";
    empty.style.display = "";
    return;
  }
  empty.style.display = "none";
  list.innerHTML = GROCERY_PLANS
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((plan) => {
      const totals = planTotals(plan.items);
      return `
      <div class="mgmt-card">
        <div class="mgmt-card-top">
          <div class="mgmt-card-name">${esc(plan.name)}</div>
        </div>
        <div class="gb-item-result-label">${gbFormatCurrency(totals.paced)}/wk paced · ${plan.items.length} item${plan.items.length === 1 ? "" : "s"}</div>
        <div class="mgmt-card-actions">
          <button class="mgmt-edit-btn" onclick="window.gbOpenSavedPlan('${plan.id}')">Open / Edit</button>
          <button class="mgmt-edit-btn" onclick="window.gbExportPlanPdf('${plan.id}')">Export PDF</button>
          <button class="remove-btn" onclick="window.gbDeletePlan('${plan.id}')">Delete</button>
        </div>
      </div>`;
    })
    .join("");
}

function renderSaveButtons() {
  const wrap = document.getElementById("gb-save-as-new-wrap");
  if (!wrap) return;
  wrap.innerHTML = workingPlan.id
    ? `<button type="button" class="ghost-btn" onclick="window.gbSavePlanAsNew()">Save as New</button>`
    : "";
  wrap.style.display = workingPlan.id ? "" : "none";
}

// ═══════════════════════════════════════════════════════════════════
// ACTIONS — item mutation
// ═══════════════════════════════════════════════════════════════════
function addItem({ name, costPerServing, sourceType, sourceRef }) {
  workingPlan.items.push({
    id: "gitem_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    name,
    costPerServing: costPerServing || 0,
    bulkTotalPrice: null,
    packageServings: null,
    targetValue: 1,
    targetUnit: "day",
    sourceType,
    sourceRef: sourceRef || null,
  });
  renderAll();
}

window.gbRemoveItem = function (id) {
  workingPlan.items = workingPlan.items.filter((i) => i.id !== id);
  renderAll();
};

window.gbSetCost = function (id, value) {
  const item = workingPlan.items.find((i) => i.id === id);
  if (!item) return;
  item.costPerServing = Math.max(0, parseFloat(value) || 0);
  renderTotals();
  refreshItemDisplay(id);
};

function recomputeFromBulk(item) {
  if (item.bulkTotalPrice > 0 && item.packageServings > 0) {
    item.costPerServing = round2(item.bulkTotalPrice / item.packageServings);
  }
}

window.gbSetBulkPrice = function (id, value) {
  const item = workingPlan.items.find((i) => i.id === id);
  if (!item) return;
  item.bulkTotalPrice = Math.max(0, parseFloat(value) || 0);
  recomputeFromBulk(item);
  renderTotals();
  refreshItemDisplay(id);
};

window.gbSetBulkServings = function (id, value) {
  const item = workingPlan.items.find((i) => i.id === id);
  if (!item) return;
  item.packageServings = Math.max(0, parseFloat(value) || 0);
  recomputeFromBulk(item);
  renderTotals();
  refreshItemDisplay(id);
};

window.gbSetTargetValue = function (id, value) {
  const item = workingPlan.items.find((i) => i.id === id);
  if (!item) return;
  item.targetValue = Math.max(0, parseFloat(value) || 0);
  renderTotals();
  refreshItemDisplay(id);
};

window.gbSetTargetUnit = function (id, unit) {
  const item = workingPlan.items.find((i) => i.id === id);
  if (!item) return;
  item.targetUnit = unit;
  renderAll();
};

function findItemRow(id) {
  return document.querySelector(`.gb-item-row[data-item-id="${id}"]`);
}

// Updates only one row's Paced This Week figure and (if the bulk helper just
// changed it) the Cost per Serving field — without a full renderItemList()
// re-render, which would rebuild the DOM and drop the focus/cursor position
// out of whichever field the user is actively typing in.
function refreshItemDisplay(id) {
  const item = workingPlan.items.find((i) => i.id === id);
  if (!item) return;
  const row = findItemRow(id);
  if (!row) return;
  const costs = itemCosts(item);
  const valueEl = row.querySelector(".gb-item-result-value");
  if (valueEl) valueEl.textContent = `${gbFormatCurrency(costs.pacedCost)}/wk`;
  const costInput = row.querySelector(".gb-cost-input");
  if (costInput && document.activeElement !== costInput) {
    costInput.value = item.costPerServing || "";
  }
}

// ═══════════════════════════════════════════════════════════════════
// ACTIONS — plan lifecycle
// ═══════════════════════════════════════════════════════════════════
window.gbStartNewPlan = async function () {
  if (workingPlan.items.length > 0) {
    if (!(await showConfirm("Start a new plan? Anything not saved will be lost.", "Start New"))) return;
  }
  workingPlan = newWorkingPlan();
  document.getElementById("gb-plan-name-input").value = "";
  renderAll();
  renderSaveButtons();
};

window.gbOpenSavedPlan = function (id) {
  const plan = GROCERY_PLANS.find((p) => p.id === id);
  if (!plan) return;
  workingPlan = {
    id: plan.id,
    name: plan.name,
    createdAt: plan.createdAt,
    items: plan.items.map((i) => ({ ...i })),
  };
  document.getElementById("gb-plan-name-input").value = plan.name;
  renderAll();
  renderSaveButtons();
  document.getElementById("gb-list-section").scrollIntoView({ behavior: "smooth", block: "start" });
};

window.gbDeletePlan = async function (id) {
  const plan = GROCERY_PLANS.find((p) => p.id === id);
  if (!plan) return;
  if (!(await showConfirm(`Delete saved plan "${plan.name}"?`, "Delete"))) return;
  try {
    await deleteGroceryPlanFromDB(id);
  } catch (e) {
    showDbError();
    return;
  }
  const idx = GROCERY_PLANS.findIndex((p) => p.id === id);
  if (idx >= 0) GROCERY_PLANS.splice(idx, 1);
  if (workingPlan.id === id) {
    workingPlan = newWorkingPlan();
    document.getElementById("gb-plan-name-input").value = "";
    renderAll();
    renderSaveButtons();
  }
  renderSavedPlans();
};

async function persistPlan(asNew) {
  const nameInput = document.getElementById("gb-plan-name-input").value.trim();
  const name = nameInput || defaultPlanName();
  const now = Date.now();
  let plan;
  if (workingPlan.id && !asNew) {
    plan = { id: workingPlan.id, name, createdAt: workingPlan.createdAt || now, updatedAt: now, items: workingPlan.items };
  } else {
    plan = { id: "gplan_" + now, name, createdAt: now, updatedAt: now, items: workingPlan.items };
  }
  try {
    await saveGroceryPlan(plan);
  } catch (e) {
    showDbError();
    return false;
  }
  const idx = GROCERY_PLANS.findIndex((p) => p.id === plan.id);
  if (idx >= 0) GROCERY_PLANS[idx] = plan;
  else GROCERY_PLANS.push(plan);
  workingPlan.id = plan.id;
  workingPlan.createdAt = plan.createdAt;
  workingPlan.name = name;
  document.getElementById("gb-plan-name-input").value = name;
  renderSavedPlans();
  renderSaveButtons();
  return { name };
}

window.gbSavePlan = async function () {
  if (workingPlan.items.length === 0) {
    showAlert("Empty Plan", "Add at least one item to your list before saving.");
    return;
  }
  if (!(await showConfirm("Save this plan?", "Save"))) return;
  const result = await persistPlan(false);
  if (result) showAlert("Plan Saved", `"${result.name}" was saved.`);
};

window.gbSavePlanAsNew = async function () {
  if (workingPlan.items.length === 0) {
    showAlert("Empty Plan", "Add at least one item to your list before saving.");
    return;
  }
  if (!(await showConfirm("Save this plan as a new entry?", "Save as New"))) return;
  const result = await persistPlan(true);
  if (result) showAlert("Plan Saved", `"${result.name}" was saved as a new plan.`);
};

// ═══════════════════════════════════════════════════════════════════
// EXPORT (PRINT / PDF) — renders one saved plan into the hidden #gb-print-area,
// which only becomes visible under the @media print stylesheet (see
// grocery-budget-calculator.css); window.print()'s own "Save as PDF"
// destination is what turns this into a PDF, no library involved.
// ═══════════════════════════════════════════════════════════════════
function buildPrintPlanHTML(plan) {
  const totals = planTotals(plan.items);
  const rows = plan.items
    .map((item) => {
      const costs = itemCosts(item);
      const target = `${item.targetValue}/${item.targetUnit}`;
      return `
      <div class="gb-print-item">
        <span>${esc(item.name)} (${gbFormatCurrency(item.costPerServing)}/srv · ${esc(target)})</span>
        <span>${gbFormatCurrency(costs.pacedCost)}/wk</span>
      </div>`;
    })
    .join("");
  return `
    <h1>${esc(plan.name)}</h1>
    <div class="gb-print-items">${rows}</div>
    <div class="gb-print-totals">
      <div><span>Weekly total (paced)</span><span>${gbFormatCurrency(totals.paced)}</span></div>
      <div><span>Monthly total (paced)</span><span>${gbFormatCurrency(totals.monthly)}</span></div>
    </div>
  `;
}

window.gbExportPlanPdf = async function (id) {
  const plan = GROCERY_PLANS.find((p) => p.id === id);
  if (!plan) return;
  if (!(await showConfirm("This will open your browser's print dialog so you can save this grocery list as a PDF or print it. Continue?", "Print / Save PDF"))) return;
  const area = document.getElementById("gb-print-area");
  area.innerHTML = buildPrintPlanHTML(plan);
  window.print();
};

// ═══════════════════════════════════════════════════════════════════
// CUSTOM ITEM MODAL — a single name field; cost, bulk pricing, and target
// servings are all edited directly on the row once it's added.
// ═══════════════════════════════════════════════════════════════════
function ensureCustomItemModal() {
  if (!document.getElementById("gb-custom-item-modal")) {
    const el = document.createElement("div");
    el.id = "gb-custom-item-modal";
    el.className = "pg-modal";
    el.addEventListener("click", (e) => {
      if (e.target === el) window.gbCloseCustomItemModal();
    });
    document.body.appendChild(el);
  }
}

function openCustomItemModal() {
  ensureCustomItemModal();
  const modal = document.getElementById("gb-custom-item-modal");
  modal.innerHTML = `
    <div class="pg-modal-box">
      <div class="pg-modal-header">
        <div class="pg-modal-title">Add a Custom Item</div>
        <button class="pg-close-btn" onclick="window.gbCloseCustomItemModal()">×</button>
      </div>
      <div class="pg-modal-body">
        <div class="field-group">
          <span class="field-label">Item name</span>
          <input id="gb-ci-name" type="text" placeholder="e.g. Farmer's market eggs" />
        </div>
      </div>
      <div class="pg-modal-footer">
        <div></div>
        <div style="display:flex;gap:8px;">
          <button class="ghost-btn" onclick="window.gbCloseCustomItemModal()">Cancel</button>
          <button class="add-btn" onclick="window.gbSubmitCustomItem()">+ Add to List</button>
        </div>
      </div>
    </div>
  `;
  modal.classList.add("open");
  document.getElementById("gb-ci-name").focus();
}

window.gbCloseCustomItemModal = function () {
  const modal = document.getElementById("gb-custom-item-modal");
  if (modal) modal.classList.remove("open");
};

window.gbSubmitCustomItem = function () {
  const name = document.getElementById("gb-ci-name").value.trim();
  if (!name) return;
  addItem({ name, costPerServing: 0, sourceType: "custom", sourceRef: null });
  window.gbCloseCustomItemModal();
};

// ═══════════════════════════════════════════════════════════════════
// FOODS SEARCH — a combined, read-only lookup: Bowl Builder's bundled ~300-
// item food database (only its name is used here — no macro data applies to
// a cost-only tool) with the user's own saved Foods rolled in on top, starred
// so they're distinguishable and carry their real cost-per-serving. A saved
// Food with the same name as a bundled entry replaces it (real cost wins).
// Selecting a result copies name + cost-per-serving (if any) into a new line
// item as a one-time starting point; nothing here ever mutates CORE_ITEMS.
// ═══════════════════════════════════════════════════════════════════
let FOOD_SEARCH_LIST = [];

function buildFoodSearchList(bundledFoods) {
  const byName = new Map();
  bundledFoods.forEach((food) => {
    byName.set(food.name.toLowerCase(), {
      name: food.name,
      costPerServing: 0,
      isSaved: false,
      sourceType: "local",
      sourceRef: food.id,
    });
  });
  CORE_ITEMS.forEach((item) => {
    byName.set(item.name.toLowerCase(), {
      name: item.name,
      costPerServing: item.costPerServing || 0,
      isSaved: true,
      sourceType: "food",
      sourceRef: item.id,
    });
  });
  return [...byName.values()];
}

function searchFoodList(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const startsWith = [];
  const includes = [];
  for (const food of FOOD_SEARCH_LIST) {
    const name = food.name.toLowerCase();
    if (name.startsWith(q)) startsWith.push(food);
    else if (name.includes(q)) includes.push(food);
  }
  return [...startsWith, ...includes].slice(0, 20);
}

window.gbAddSearchResult = function (idx) {
  const list = window._gbLastSearchResults;
  const food = list && list[idx];
  if (!food) return;
  addItem({
    name: food.name,
    costPerServing: food.costPerServing || 0,
    sourceType: food.sourceType,
    sourceRef: food.sourceRef,
  });
  document.getElementById("gb-search-input").value = "";
  document.getElementById("gb-search-results").innerHTML = "";
  document.getElementById("gb-search-hint").textContent = "Type to search our foods";
};

function wireSearch() {
  const input = document.getElementById("gb-search-input");
  const results = document.getElementById("gb-search-results");
  const hint = document.getElementById("gb-search-hint");

  input.addEventListener("input", () => {
    const query = input.value.trim();
    if (!query) {
      results.innerHTML = "";
      hint.textContent = "Type to search our foods";
      return;
    }
    const found = searchFoodList(query);
    window._gbLastSearchResults = found;
    if (found.length === 0) {
      results.innerHTML = "";
      hint.textContent = `No foods match "${query}" — try "+ Add a custom item" below.`;
      return;
    }
    hint.textContent = "";
    results.innerHTML = found
      .map(
        (food, idx) => `
        <div class="gb-search-result" onclick="window.gbAddSearchResult(${idx})">
          <span class="gb-search-result-name">${food.isSaved ? `<span class="material-symbols-outlined gb-saved-star" title="From your saved foods">star</span>` : ""}${esc(food.name)}</span>
          <span class="gb-search-result-cost">${food.costPerServing ? gbFormatCurrency(food.costPerServing) + "/serving" : "no cost saved"}</span>
        </div>`
      )
      .join("");
  });
}

// ═══════════════════════════════════════════════════════════════════
// CURRENCY OVERRIDE — same export-dropdown UI as the Settings currency
// picker, but writes to localStorage instead of the shared prefs.js
// "settings" store, so it only ever affects this page.
// ═══════════════════════════════════════════════════════════════════
function gbCurrencyMenuHTML() {
  const options = [{ code: "", label: "Use Settings default" }].concat(
    prefs.CURRENCIES.map((code) => ({ code, label: `${prefs.CURRENCY_SYMBOLS[code]} ${code}` }))
  );
  return options
    .map(({ code, label }) => {
      const selected = currencyOverrideCode === code;
      return `<button style="${selected ? "background:var(--surface2);color:var(--text);font-weight:600;" : ""}" onclick="window.gbSetCurrencyOverride('${code}')">${label}${selected ? " ✓" : ""}</button>`;
    })
    .join("");
}

function renderCurrencyDropdown() {
  const activeCode = currencyOverrideCode || globalCurrencyCode;
  const trigger = document.getElementById("gb-currency-trigger");
  const menu = document.getElementById("gb-currency-menu");
  if (trigger) trigger.textContent = `${activeCode} (${prefs.CURRENCY_SYMBOLS[activeCode]}) ▾`;
  if (menu) menu.innerHTML = gbCurrencyMenuHTML();
}

window.gbSetCurrencyOverride = function (code) {
  currencyOverrideCode = code;
  try {
    if (code) localStorage.setItem(CURRENCY_OVERRIDE_LS_KEY, code);
    else localStorage.removeItem(CURRENCY_OVERRIDE_LS_KEY);
  } catch (e) {}
  document.getElementById("gb-currency-dropdown")?.classList.remove("open");
  renderCurrencyDropdown();
  renderAll();
};

window.gbToggleCurrencyDropdown = function (e) {
  e.stopPropagation();
  const dd = e.currentTarget.closest(".export-dropdown");
  const wasOpen = dd.classList.contains("open");
  document.querySelectorAll(".export-dropdown.open").forEach((el) => el.classList.remove("open"));
  if (!wasOpen) dd.classList.add("open");
};

document.addEventListener("click", () => {
  document.querySelectorAll(".export-dropdown.open").forEach((el) => el.classList.remove("open"));
});

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
async function init() {
  await openDB();
  const [, , currencyCode, bundledFoods] = await Promise.all([
    loadCoreItems(),
    loadGroceryPlans(),
    prefs.getCurrency(),
    fetch("../bowl-builder/bowl-foods.json").then((r) => r.json()).catch(() => []),
  ]);
  globalCurrencyCode = currencyCode;
  FOOD_SEARCH_LIST = buildFoodSearchList(bundledFoods);
  try {
    const saved = localStorage.getItem(CURRENCY_OVERRIDE_LS_KEY) || "";
    currencyOverrideCode = prefs.CURRENCIES.includes(saved) ? saved : "";
  } catch (e) {
    currencyOverrideCode = "";
  }

  renderAll();
  renderSaveButtons();
  renderSavedPlans();
  wireSearch();
  renderCurrencyDropdown();

  document.getElementById("gb-custom-item-btn").addEventListener("click", openCustomItemModal);
  document.getElementById("gb-save-plan-btn").addEventListener("click", () => window.gbSavePlan());
}

init();
