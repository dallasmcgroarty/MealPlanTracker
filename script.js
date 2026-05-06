import * as db from "./db.js";
import * as items from "./items.js";

// Update freq preview label in core item form
function updateFreqPreview() {
  const target = parseFloat(document.getElementById("ci-target").value) || 1;
  document.getElementById("ci-freq-preview").textContent = `${target} srv/day`;
}
window.updateFreqPreview = updateFreqPreview;
// ═══════════════════════════════════════════════════════════════════
// CORE ITEMS MANAGEMENT TAB
// ═══════════════════════════════════════════════════════════════════
let editingCoreItemIdx = null;

function renderCoreItemsMgmt() {
  // Render add form at top if not editing
  const addFormContainer = document.getElementById("add-core-item-form-container");
  const addBtn = document.getElementById("add-core-item-btn");
  const list = document.getElementById("core-items-mgmt-list");
  list.innerHTML = "";
  addFormContainer.innerHTML = "";
  if (editingCoreItemIdx === null) {
    addBtn.style.display = "inline-block";
    addFormContainer.innerHTML = getCoreItemFormHTML();
    document.getElementById("add-core-item-form").style.display = "none";
  } else {
    addBtn.style.display = "inline-block";
  }
  if (!items.CORE_ITEMS.length) {
    list.innerHTML = '<div style="color:var(--muted);padding:20px 0;">No core items found.</div>';
    return;
  }
  items.CORE_ITEMS.forEach((item, idx) => {
    const activeLabel = item.inactive ? '<span style="color:var(--muted);font-size:11px;">(inactive)</span>' : '';
    const row = document.createElement("div");
    row.className = "item-card" + (item.inactive ? " done" : "");
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-weight:700;">${item.name}</span> ${activeLabel}
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <button class="edit-btn" style="padding:4px 12px;font-size:12px;" onclick="window.editCoreItem(${idx})">Edit</button>
        <button class="ghost-btn delete-btn" style="padding:4px 12px;font-size:12px;" onclick="window.deleteCoreItem(${idx})">Delete</button>
        <button class="ghost-btn active-btn${item.inactive ? ' activate-outline' : ''}" style="padding:4px 12px;font-size:12px;" onclick="window.toggleActiveCoreItem(this,${idx})">${item.inactive ? 'Activate' : 'Inactivate'}</button>
      </div>
    `;
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.marginBottom = "8px";
    list.appendChild(row);
    // Accordion edit form
    if (editingCoreItemIdx === idx) {
      const editForm = document.createElement("div");
      editForm.innerHTML = getCoreItemFormHTML(true);
      editForm.firstChild.style.display = "block";
      editForm.style.margin = "16px 0 24px 0";
      list.appendChild(editForm);
      setTimeout(() => fillCoreItemForm(idx), 0);
    }
  });
}

function getCoreItemFormHTML(isEdit) {
  return `<div id="add-core-item-form" class="add-section" style="display:${isEdit ? 'block' : 'none'};">
    <h3 id="core-item-form-title" class="section-title" style="margin-bottom:12px;">${isEdit ? 'Edit Core Item' : 'Add Core Item'}</h3>
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
    <div class="add-row add-row-2">
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
    <div style="margin-top:18px;display:flex;gap:10px;">
      <button id="core-item-form-submit" class="add-btn">${isEdit ? 'Update' : 'Add'}</button>
      <button class="ghost-btn" onclick="window.cancelCoreItemForm()">Cancel</button>
    </div>
  </div>`;
}

function showAddCoreItemForm() {
  editingCoreItemIdx = null;
  renderCoreItemsMgmt();
  setTimeout(() => {
    document.getElementById("add-core-item-form").style.display = "block";
    document.getElementById("core-item-form-title").textContent = "Add Core Item";
    document.getElementById("core-item-form-submit").onclick = handleAddCoreItem;
    // Clear fields
    document.getElementById("ci-name").value = "";
    document.getElementById("ci-cal").value = "";
    document.getElementById("ci-p").value = "";
    document.getElementById("ci-c").value = "";
    document.getElementById("ci-f").value = "";
    document.getElementById("ci-bulk-price").value = "";
    document.getElementById("ci-bulk-servings").value = "";
    document.getElementById("ci-cost").value = "";
    document.getElementById("ci-target").value = "";
    document.getElementById("ci-freq").value = "";
    document.getElementById("ci-freq-preview").textContent = `1 srv/day`;
    document.getElementById("ci-cost-hint").textContent = "or enter manually";
  }, 0);
}
window.showAddCoreItemForm = showAddCoreItemForm;

function cancelCoreItemForm() {
  editingCoreItemIdx = null;
  renderCoreItemsMgmt();
}
window.cancelCoreItemForm = cancelCoreItemForm;

function fillCoreItemForm(idx) {
  const item = items.CORE_ITEMS[idx];
  document.getElementById("core-item-form-title").textContent = "Edit Core Item";
  document.getElementById("core-item-form-submit").textContent = "Update";
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
  document.getElementById("core-item-form-submit").onclick = async function(e) {
    if (e) e.preventDefault();
    item.name = document.getElementById("ci-name").value.trim();
    item.cal = parseFloat(document.getElementById("ci-cal").value) || 0;
    item.p = parseFloat(document.getElementById("ci-p").value) || 0;
    item.c = parseFloat(document.getElementById("ci-c").value) || 0;
    item.f = parseFloat(document.getElementById("ci-f").value) || 0;
    item.costPerServing = parseFloat(document.getElementById("ci-cost").value) || 0;
    item.target = parseFloat(document.getElementById("ci-target").value) || 1;
    const freqDetails = document.getElementById("ci-freq").value.trim();
    item.freq = `${item.target} srv/day${freqDetails ? ' · ' + freqDetails : ''}`;
    await items.saveCoreItem(item);
    editingCoreItemIdx = null;
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

function hideAddCoreItemForm() {
  document.getElementById("add-core-item-form").style.display = "none";
}
window.hideAddCoreItemForm = hideAddCoreItemForm;

async function handleAddCoreItem(e) {
  if (e) e.preventDefault();
  const name = document.getElementById("ci-name").value.trim();
  const cal = parseFloat(document.getElementById("ci-cal").value) || 0;
  const p = parseFloat(document.getElementById("ci-p").value) || 0;
  const c = parseFloat(document.getElementById("ci-c").value) || 0;
  const f = parseFloat(document.getElementById("ci-f").value) || 0;
  const cost = parseFloat(document.getElementById("ci-cost").value) || 0;
  const target = parseFloat(document.getElementById("ci-target").value) || 1;
  if (!name) return;
  const freqDetails = document.getElementById("ci-freq").value.trim();
  const freq = `${target} srv/day${freqDetails ? ' · ' + freqDetails : ''}`;
  const newItem = {
    id: name.toLowerCase().replace(/\s+/g, "_"),
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
  items.CORE_ITEMS.push(newItem);
  await items.saveCoreItem(newItem);
  hideAddCoreItemForm();
  renderCoreItemsMgmt();
  renderCoreItems();
}
window.handleAddCoreItem = handleAddCoreItem;

async function deleteCoreItem(idx) {
  if (!confirm("Delete this core item?")) return;
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
  btn.textContent = item.inactive ? 'Activate' : 'Inactivate';
  // Persist inactive state
  items.saveCoreItem(item);
  renderCoreItemsMgmt();
  renderCoreItems();
  renderStats();
}
window.toggleActiveCoreItem = toggleActiveCoreItem;

function editCoreItem(idx) {
  editingCoreItemIdx = idx;
  renderCoreItemsMgmt();
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
    card.className = "item-card custom-item done";
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
    <div class="item-cost-lbl">$${parseFloat(item.todayCost || 0).toFixed(2)} today</div>
    ${item.bulkPrice ? `<div class="item-cost-target">$${parseFloat(item.bulkPrice).toFixed(2)} bulk / ${item.bulkServings} srv</div>` : ""}
    <button class="remove-btn" onclick="window.removeCustomItem(${idx})">remove</button>
    </div>`;
    list.appendChild(card);
  });
}

function renderStats() {
    // Calorie range indicator (target zone)
    const low = 1250, high = 1750, maxCal = 2000;
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
    Math.min((tot.cal / 2000) * 100, 100) + "%";

  // Meter note
  const note = document.getElementById("meter-note");
  if (tot.cal === 0) {
    note.innerHTML = `<strong>Nothing logged yet.</strong> Target: ${tgtCal} kcal at full servings.`;
  } else if (tot.cal < 1250) {
    note.innerHTML = `<strong style="color:var(--accent3)">${Math.round(tot.cal)} kcal</strong> — ${Math.round(1250 - tot.cal)} kcal to floor. Wiggle room for extras.`;
  } else if (tot.cal <= 1750) {
    note.innerHTML = `<strong style="color:var(--protein)">${Math.round(tot.cal)} kcal</strong> — in range! ${Math.round(1750 - tot.cal)} kcal ceiling remaining.`;
  } else {
    note.innerHTML = `<strong style="color:var(--warn)">${Math.round(tot.cal)} kcal</strong> — ${Math.round(tot.cal - 1750)} kcal over ceiling.`;
  }

  // Status banner
  const dot = document.getElementById("status-dot");
  const banner = document.getElementById("status-banner");
  const txt = document.getElementById("status-text");
  if (tot.cal === 0) {
    dot.style.cssText = "background:var(--muted);box-shadow:none;";
    banner.style.borderLeftColor = "var(--muted)";
    txt.innerHTML = `Nothing logged yet. Tap <strong>+</strong> on each item as you eat.`;
  } else if (tot.cal < 1250) {
    dot.style.cssText =
      "background:var(--accent3);box-shadow:0 0 8px var(--accent3);";
    banner.style.borderLeftColor = "var(--accent3)";
    txt.innerHTML = `<strong style="color:var(--accent3)">${Math.round(tot.cal)} kcal</strong> logged · <strong style="color:var(--accent3)">${Math.round(1250 - tot.cal)} kcal</strong> below floor · <strong style="color:var(--accent)">${Math.round(1750 - tot.cal)} kcal</strong> of wiggle room for extras.`;
  } else if (tot.cal <= 1750) {
    dot.style.cssText =
      "background:var(--protein);box-shadow:0 0 8px var(--protein);";
    banner.style.borderLeftColor = "var(--protein)";
    txt.innerHTML = `<strong style="color:var(--protein)">${Math.round(tot.cal)} kcal</strong> logged — in range! <strong style="color:var(--protein)">${Math.round(1750 - tot.cal)} kcal</strong> of ceiling remaining.`;
  } else {
    dot.style.cssText =
      "background:var(--warn);box-shadow:0 0 8px var(--warn);";
    banner.style.borderLeftColor = "var(--warn)";
    txt.innerHTML = `<strong style="color:var(--warn)">${Math.round(tot.cal)} kcal</strong> — <strong style="color:var(--warn)">${Math.round(tot.cal - 1750)} kcal over</strong> your 1,750 ceiling.`;
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
    fPct + "% · " + tot.f.toFixed(1) + "g";
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
  calTargetLow = allDays.map(() => 1250);
  calTargetHigh = allDays.map(() => 1750);

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

    // Calories per day line chart
    const caloriesDom = document.getElementById("chart-calories");
    window._echartCalories = echarts.init(caloriesDom);
    window._echartCalories.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: calLabels,
        axisLabel: { show: false }
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
          name: 'Target Low (1250)',
          type: 'line',
          data: calTargetLow,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#60f0a0', type: 'dashed', width: 2 },
        },
        {
          name: 'Target High (1750)',
          type: 'line',
          data: calTargetHigh,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#f0a060', type: 'dashed', width: 2 },
        },
      ],
      legend: { show: false },
    });
    resizeECharts(window._echartCalories, caloriesDom);

    // Weekly cost bar chart
    const weekDom = document.getElementById("chart-weekly-cost");
    window._echartWeeklyCost = echarts.init(weekDom);
    window._echartWeeklyCost.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: weekLabels,
        axisLabel: { show: false }
      },
      yAxis: {
        type: 'value',
        min: 0,
        splitLine: { show: false }
      },
      series: [
        {
          name: 'Weekly Cost',
          type: 'bar',
          data: weekCostData,
          itemStyle: {
            color: '#c8f060',
            borderRadius: [6, 6, 0, 0],
          },
          barWidth: 24,
        },
      ],
      legend: { show: false },
    });
    resizeECharts(window._echartWeeklyCost, weekDom);

    // Macro split doughnut chart
    const macrosDom = document.getElementById("chart-macros");
    window._echartMacros = echarts.init(macrosDom);
    window._echartMacros.setOption({
      tooltip: { trigger: 'item' },
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
          if (day.cal >= 1250 && day.cal <= 1750) mStats.inRangeDays++;
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
          background:var(--bg2);
          display:flex;align-items:flex-start;gap:8px;flex-direction:column;
          font-family:'DM Mono',monospace;
        " data-month="${month}">
          <div class="month-header-label-row" style="display:flex;align-items:center;gap:10px;width:100%;justify-content:space-between;">
            <div class="month-label" style="font-size:18px;font-weight:700;letter-spacing:0.01em;color:var(--fg);font-family:'DM Mono',monospace;">${monthLabel}</div>
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
        <div class="month-weeks" style="display:none;"></div>
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
            <div class="week-label">${formatDateShort(week.weekStart)} – ${formatDateShort(weekEnd)} ${isCurrentWeek ? "<span style=\"color:var(--accent);font-size:10px;font-family:'DM Mono',monospace;\">current</span>" : ""}</div>
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
            const inRange = day.cal >= 1250 && day.cal <= 1750;
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
            <td>Week Total</td>
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

function handleAddCustomItem() {
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

function handleRemoveCustomItem(idx) {
  items.removeCustomItem(idx);
  persistState();
  render();
}

async function resetWeeklyCost() {
  if (
    !confirm(
      "Reset the weekly cost tracker? This deletes all logged days for this week.",
    )
  )
    return;
  const weekStart = items.weekStartFor(items.todayStr());
  try {
    await db.dbDelete("weeks", weekStart);
  } catch (e) {}
  render();
  renderWeeklyCost();
}

function confirmResetDay() {
  if (
    !confirm(
      "Reset today's log? All serving counts and custom items will be cleared.",
    )
  )
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
}

// ═══════════════════════════════════════════════════════════════════
// ENTER KEY in custom form
// ═══════════════════════════════════════════════════════════════════
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.activeElement?.id?.startsWith("cf-"))
    items.addCustomItem();
});

// Expose functions for inline HTML event handlers
window.addCustomItem = handleAddCustomItem;
window.clearBulkIfManual = clearBulkIfManual;
window.adjustServing = handleAdjustServing;
window.removeCustomItem = handleRemoveCustomItem;
window.switchTab = switchTab;
window.toggleWeek = toggleWeek;
window.confirmResetDay = confirmResetDay;
window.resetWeeklyCost = resetWeeklyCost;

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
  await items.loadCoreItems();
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