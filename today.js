import * as db from "./db.js";
import { todayStr, weekStartFor } from "./dates.js";
import { CORE_ITEMS, loadCoreItems } from "./items.js";
import * as prefs from "./prefs.js";
import { esc, showConfirm, showAlert, showDbError } from "./ui.js";
import * as barcode from "./barcode.js";
import "./nav.js";
import "./settingsHint.js";

// ═══════════════════════════════════════════════════════════════════
// TODAY'S LOGGING STATE — session state for servings logged + custom
// items added today. Lives here, not in items.js, since nothing else
// needs it (Foods only manages the CORE_ITEMS catalog itself).
// ═══════════════════════════════════════════════════════════════════
let servings = {};
let customItems = [];
let calRange = { low: 1250, high: 1750 };
let halfStepMode = false; // session-only: when true, +/- steps by 0.5 instead of 1
let coreItemsFilter = ""; // session-only: live text filter over the saved-foods list

function computeTotals() {
  let cal = 0, p = 0, c = 0, f = 0, cost = 0;
  CORE_ITEMS.forEach((item) => {
    const srv = servings[item.id] || 0;
    cal += item.cal * srv;
    p += item.p * srv;
    c += item.c * srv;
    f += item.f * srv;
    cost += item.costPerServing * srv;
  });
  customItems.forEach((item) => {
    cal += parseFloat(item.cal) || 0;
    p += parseFloat(item.p) || 0;
    c += parseFloat(item.c) || 0;
    f += parseFloat(item.f) || 0;
    cost += parseFloat(item.todayCost) || 0;
  });
  return { cal, p, c, f, cost };
}

// Builds a per-item snapshot of everything logged today, from the current
// CORE_ITEMS catalog + session state — called only from persistState(), which
// only ever writes to todayStr()'s record, so once a day is in the past this
// snapshot is frozen forever and never re-derived from a (possibly since
// edited/deleted/renamed) catalog entry.
function buildLoggedItems() {
  const items = [];
  CORE_ITEMS.forEach((item) => {
    const srv = servings[item.id] || 0;
    if (srv > 0) {
      items.push({
        name: item.name,
        servings: srv,
        cal: item.cal * srv,
        p: item.p * srv,
        c: item.c * srv,
        f: item.f * srv,
        cost: item.costPerServing * srv,
      });
    }
  });
  customItems.forEach((item) => {
    items.push({
      name: item.name,
      servings: item.servingsEaten,
      cal: parseFloat(item.cal) || 0,
      p: parseFloat(item.p) || 0,
      c: parseFloat(item.c) || 0,
      f: parseFloat(item.f) || 0,
      cost: parseFloat(item.todayCost) || 0,
    });
  });
  return items;
}

function adjustServing(id, delta) {
  const next = Math.max(0, (servings[id] || 0) + delta);
  servings[id] = Math.round(next * 2) / 2; // guard against float drift, servings are always multiples of 0.5
}

function fmtServing(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

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
// PERSIST — save today's snapshot to IndexedDB
// ═══════════════════════════════════════════════════════════════════
async function persistState() {
  db.saveTodayLS(todayStr(), servings, customItems);
  const tot = computeTotals();
  if (tot.cal === 0 && tot.cost === 0) {
    try {
      await db.dbDelete("days", todayStr());
    } catch (e) {}
    await updateWeekRecord(true); // remove today from the week too
    return;
  }
  const snapshot = {
    date: todayStr(),
    servings: { ...servings },
    customItems: [...customItems],
    loggedItems: buildLoggedItems(),
    cal: tot.cal,
    p: tot.p,
    c: tot.c,
    f: tot.f,
    cost: tot.cost,
    calLow: calRange.low,
    calHigh: calRange.high,
  };
  try {
    await db.dbPut("days", snapshot);
  } catch (e) {
    showDbError();
  }
  await updateWeekRecord();
}

async function updateWeekRecord(removeIfZero) {
  const weekStart = weekStartFor(todayStr());
  let week;
  try {
    week = await db.dbGet("weeks", weekStart);
  } catch (e) {
    week = null;
  }
  if (!week) week = { weekStart, days: {} };
  const tot = computeTotals();
  if (removeIfZero === true && tot.cal === 0 && tot.cost === 0) {
    if (week.days && week.days[todayStr()]) {
      delete week.days[todayStr()];
      try {
        await db.dbPut("weeks", week);
      } catch (e) {
        showDbError();
      }
    }
    return;
  }
  if (tot.cal === 0 && tot.cost === 0) return;
  week.days[todayStr()] = {
    cal: tot.cal,
    p: tot.p,
    c: tot.c,
    f: tot.f,
    cost: tot.cost,
    calLow: calRange.low,
    calHigh: calRange.high,
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
  if (CORE_ITEMS.length === 0) {
    list.innerHTML =
      "<div style=\"font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);padding:8px 0;\">No saved foods available.</div>";
    return;
  }
  const filter = coreItemsFilter.trim().toLowerCase();
  const items = filter ? CORE_ITEMS.filter((item) => item.name.toLowerCase().includes(filter)) : CORE_ITEMS;
  if (items.length === 0) {
    list.innerHTML =
      "<div style=\"font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);padding:8px 0;\">No saved foods match your search.</div>";
    return;
  }
  const step = halfStepMode ? 0.5 : 1;
  items.forEach((item) => {
    if (item.inactive) return;
    const srv = servings[item.id] || 0;
    const met = srv >= item.target;
    const over = srv > item.target;
    const countClass = over ? "over" : met ? "met" : "under";
    const spentToday = (item.costPerServing * srv).toFixed(2);
    const targetDay = (item.costPerServing * item.target).toFixed(2);
    const card = document.createElement("div");
    card.className = "item-card" + (met ? " done" : "");
    card.innerHTML = `
    <div class="serving-ctrl">
    <button class="srv-btn" onclick="window.adjustServing('${item.id}',${step})">+</button>
    <div class="srv-count">
        <div class="current ${countClass}">${fmtServing(srv)}</div>
        <div class="target">/ ${fmtServing(item.target)}</div>
    </div>
    <button class="srv-btn" onclick="window.adjustServing('${item.id}',${-step})">−</button>
    </div>
    <div class="item-info">
    <div class="item-name">${esc(item.name)}</div>
    <div class="item-serving-lbl">${esc(item.freq)} · ${prefs.formatCurrency(item.costPerServing)}/serving</div>
    <div class="item-macros">
        <span class="im im-cal">${prefs.formatEnergy(item.cal * srv)}</span>
        <span class="im im-p">P: ${(item.p * srv).toFixed(0)}g</span>
        <span class="im im-c">C: ${(item.c * srv).toFixed(0)}g</span>
        <span class="im im-f">F: ${(item.f * srv).toFixed(1)}g</span>
        <span class="im" style="color:var(--muted)">(${prefs.formatEnergy(item.cal)} ea)</span>
    </div>
    </div>
    <div class="item-right">
    <div class="item-cost-lbl">${prefs.getCurrencySymbol()}${spentToday} spent</div>
    <div class="item-cost-target">target: ${prefs.getCurrencySymbol()}${targetDay}/day</div>
    </div>`;
    list.appendChild(card);
  });
}

function renderCustomItems() {
  const list = document.getElementById("custom-items-list");
  list.innerHTML = "";
  if (customItems.length === 0) {
    list.innerHTML =
      "<div style=\"font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);padding:8px 0;\">No custom items today.</div>";
    return;
  }
  customItems.forEach((item, idx) => {
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
    <div class="item-name">${esc(item.name)}</div>
    <div class="item-serving-lbl">custom · ${srvLabel} · ${prefs.formatCurrency(parseFloat(item.costPerSrv || 0))}/srv</div>
    <div class="item-macros">
        <span class="im im-cal">${prefs.formatEnergy(item.cal)}</span>
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
  const unit = prefs.getEnergyUnitSync();
  const low = calRange.low, high = calRange.high;
  const maxCal = Math.ceil((calRange.high + 250) / 500) * 500;
  const zone = document.querySelector('.target-zone');
  if (zone) {
    const left = (low / maxCal) * 100;
    const width = ((high - low) / maxCal) * 100;
    zone.style.left = left + '%';
    zone.style.width = width + '%';
    zone.querySelector('.zone-label-low').textContent = Math.round(prefs.kcalToDisplayUnit(low, unit)).toLocaleString();
    zone.querySelector('.zone-label-high').textContent = Math.round(prefs.kcalToDisplayUnit(high, unit)).toLocaleString();
  }
  const scaleEl = document.getElementById("cal-scale");
  if (scaleEl) {
    scaleEl.innerHTML = "";
    for (let v = 0; v <= maxCal; v += 500) {
      const pct = (v / maxCal) * 100;
      const dv = Math.round(prefs.kcalToDisplayUnit(v, unit));
      const label = dv === 0 ? "0" : dv < 1000 ? String(dv) : `${dv / 1000}k`;
      const span = document.createElement("span");
      span.textContent = label;
      if (v === 0) {
        span.style.cssText = "position:absolute;left:0;";
      } else if (v === maxCal) {
        span.style.cssText = "position:absolute;right:0;";
      } else {
        span.style.cssText = `position:absolute;left:${pct}%;transform:translateX(-50%);`;
      }
      scaleEl.appendChild(span);
    }
  }
  const tot = computeTotals();
  const tgtCal = CORE_ITEMS.filter(i => !i.inactive).reduce((s, i) => s + i.cal * i.target, 0);

  document.getElementById("tot-cal").textContent = Math.round(prefs.kcalToDisplayUnit(tot.cal, unit));
  document.getElementById("tot-cal-lbl").textContent = unit === "kJ" ? "Logged kJ" : "Logged kcal";
  document.getElementById("tot-cal-sub").textContent = `/ ${Math.round(prefs.kcalToDisplayUnit(tgtCal, unit))} target`;
  document.getElementById("tot-p").textContent = Math.round(tot.p) + "g";
  document.getElementById("tot-c").textContent = Math.round(tot.c) + "g";
  document.getElementById("tot-f").textContent = tot.f.toFixed(1) + "g";
  document.getElementById("tot-spent").textContent = prefs.formatCurrency(tot.cost);
  const activeTargetCost = CORE_ITEMS.filter(i => !i.inactive).reduce((s, i) => s + i.costPerServing * i.target, 0);
  document.getElementById("tot-target-cost").textContent = prefs.formatCurrency(activeTargetCost);

  document.getElementById("cal-fill").style.width =
    Math.min((tot.cal / maxCal) * 100, 100) + "%";

  const dot = document.getElementById("status-dot");
  const banner = document.getElementById("status-banner");
  const txt = document.getElementById("status-text");
  if (tot.cal === 0) {
    dot.style.cssText = "background:var(--muted);box-shadow:none;";
    banner.style.borderLeftColor = "var(--muted)";
    txt.innerHTML = `Nothing logged yet. Tap <strong>+</strong> on each item as you eat.`;
  } else if (tot.cal < low) {
    dot.style.cssText = "background:var(--accent3);box-shadow:0 0 8px var(--accent3);";
    banner.style.borderLeftColor = "var(--accent3)";
    txt.innerHTML = `<strong style="color:var(--accent3)">${prefs.formatEnergy(tot.cal)}</strong> logged · <strong style="color:var(--accent3)">${prefs.formatEnergy(low - tot.cal)}</strong> below floor · <strong style="color:var(--accent)">${prefs.formatEnergy(high - tot.cal)}</strong> of wiggle room for extras.`;
  } else if (tot.cal <= high) {
    dot.style.cssText = "background:var(--protein);box-shadow:0 0 8px var(--protein);";
    banner.style.borderLeftColor = "var(--protein)";
    txt.innerHTML = `<strong style="color:var(--protein)">${prefs.formatEnergy(tot.cal)}</strong> logged — in range! <strong style="color:var(--protein)">${prefs.formatEnergy(high - tot.cal)}</strong> of ceiling remaining.`;
  } else {
    dot.style.cssText = "background:var(--warn);box-shadow:0 0 8px var(--warn);";
    banner.style.borderLeftColor = "var(--warn)";
    txt.innerHTML = `<strong style="color:var(--warn)">${prefs.formatEnergy(tot.cal)}</strong> — <strong style="color:var(--warn)">${prefs.formatEnergy(tot.cal - high)} over</strong> your ${prefs.formatEnergy(high)} ceiling.`;
  }

  const calP = tot.p * 4, calC = tot.c * 4, calF = tot.f * 9;
  const totalMC = calP + calC + calF || 1;
  const pPct = ((calP / totalMC) * 100).toFixed(0);
  const cPct = ((calC / totalMC) * 100).toFixed(0);
  const fPct = ((calF / totalMC) * 100).toFixed(0);
  document.getElementById("bar-p").style.width = pPct + "%";
  document.getElementById("bar-c").style.width = cPct + "%";
  document.getElementById("bar-f").style.width = fPct + "%";
  document.getElementById("leg-p").textContent = pPct + "% · " + Math.round(tot.p) + "g";
  document.getElementById("leg-c").textContent = cPct + "% · " + Math.round(tot.c) + "g";
  document.getElementById("leg-f").textContent = fPct + "% · " + Math.round(tot.f) + "g";
}

async function renderWeeklyCost() {
  const targetRows = document.getElementById("weekly-target-rows");
  targetRows.innerHTML = "";
  let targetTotal = 0;
  CORE_ITEMS.filter(item => !item.inactive && item.costPerServing > 0).forEach((item) => {
    const weeklyAmt = item.costPerServing * item.target * 7;
    targetTotal += weeklyAmt;
    const row = document.createElement("div");
    row.className = "cost-row";
    row.innerHTML = `<span>${esc(item.name.split(" ").slice(0, 3).join(" "))}</span><span class="amt target-amt">${prefs.formatCurrency(weeklyAmt)}</span>`;
    targetRows.appendChild(row);
  });
  document.getElementById("weekly-target-total").textContent = prefs.formatCurrency(targetTotal);

  const weekStart = weekStartFor(todayStr());
  document.getElementById("week-start-label").textContent = formatDate(weekStart);

  let week;
  try {
    week = await db.dbGet("weeks", weekStart);
  } catch (e) {
    week = null;
  }
  const days = week ? week.days : {};

  const actualRows = document.getElementById("weekly-actual-rows");
  actualRows.innerHTML = "";

  let totalActual = 0;
  const dayDates = Object.keys(days).sort();
  dayDates.forEach((dateStr) => {
    totalActual += days[dateStr].cost || 0;
  });

  const todayTot = computeTotals();
  if (days[todayStr()]) {
    totalActual = totalActual - (days[todayStr()].cost || 0) + todayTot.cost;
  } else {
    totalActual += todayTot.cost;
  }

  const allDates = new Set([...dayDates, todayStr()]);
  const sortedDates = [...allDates].sort();

  sortedDates.forEach((dateStr) => {
    let dayCost;
    if (dateStr === todayStr()) {
      dayCost = todayTot.cost;
    } else {
      dayCost = days[dateStr] ? days[dateStr].cost : 0;
    }
    if (dayCost === 0 && dateStr !== todayStr()) return;
    const row = document.createElement("div");
    row.className = "cost-row";
    const isToday = dateStr === todayStr();
    row.innerHTML = `<span>${formatDateShort(dateStr)}${isToday ? ' <em style="color:var(--accent);font-style:normal;font-size:11px">today</em>' : ""}</span><span class="amt actual-amt">${prefs.formatCurrency(dayCost)}</span>`;
    actualRows.appendChild(row);
  });

  if (
    sortedDates.filter((d) => d === todayStr() || (days[d] && days[d].cost > 0)).length === 0
  ) {
    actualRows.innerHTML =
      "<div style=\"font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);padding:6px 0;\">No spending logged yet this week.</div>";
  }

  document.getElementById("weekly-actual-total").textContent = prefs.formatCurrency(totalActual);
}

// ═══════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════
function handleAdjustServing(id, delta) {
  adjustServing(id, delta);
  persistState();
  render();
}
window.adjustServing = handleAdjustServing;

function toggleHalfStepMode() {
  halfStepMode = !halfStepMode;
  document.getElementById("half-step-toggle-btn")?.classList.toggle("active", halfStepMode);
  renderCoreItems();
}
window.toggleHalfStepMode = toggleHalfStepMode;

function calcCostPerServing() {
  const bulkPrice = parseFloat(document.getElementById("cf-bulk-price").value) || 0;
  const bulkServings = parseFloat(document.getElementById("cf-bulk-servings").value) || 0;
  const eatenToday = parseFloat(document.getElementById("cf-servings-eaten").value) || 1;

  if (bulkPrice > 0 && bulkServings > 0) {
    const perSrv = bulkPrice / bulkServings;
    document.getElementById("cf-cost-per-srv").value = perSrv.toFixed(2);
    document.getElementById("cf-cost-hint").textContent = `= ${prefs.formatCurrency(perSrv)} per serving`;
  }

  const perSrv = parseFloat(document.getElementById("cf-cost-per-srv").value) || 0;
  const todayCost = perSrv * eatenToday;
  document.getElementById("cf-today-cost-hint").textContent = `today's cost: ${prefs.formatCurrency(todayCost)}`;
}
window.calcCostPerServing = calcCostPerServing;

function clearBulkIfManual() {
  document.getElementById("cf-bulk-price").value = "";
  document.getElementById("cf-bulk-servings").value = "";
  document.getElementById("cf-cost-hint").textContent = "or enter manually";
  const perSrv = parseFloat(document.getElementById("cf-cost-per-srv").value) || 0;
  const eaten = parseFloat(document.getElementById("cf-servings-eaten").value) || 1;
  document.getElementById("cf-today-cost-hint").textContent = `today's cost: ${prefs.formatCurrency(perSrv * eaten)}`;
}
window.clearBulkIfManual = clearBulkIfManual;

async function handleAddCustomItem() {
  const name = document.getElementById("cf-name").value.trim();
  if (!name) {
    document.getElementById("cf-name").focus();
    return;
  }
  const servingsEaten = Math.max(1, parseFloat(document.getElementById("cf-servings-eaten").value) || 1);
  const costPerSrv = Math.max(0, parseFloat(document.getElementById("cf-cost-per-srv").value) || 0);
  const bulkPrice = Math.max(0, parseFloat(document.getElementById("cf-bulk-price").value) || 0);
  const bulkServings = Math.max(0, parseFloat(document.getElementById("cf-bulk-servings").value) || 0);
  const todayCost = costPerSrv * servingsEaten;
  const calPerSrvRaw = Math.max(0, parseFloat(document.getElementById("cf-cal").value) || 0);
  const calPerSrv = Math.round(prefs.displayUnitToKcal(calPerSrvRaw, prefs.getEnergyUnitSync()));
  const pPerSrv = Math.max(0, parseFloat(document.getElementById("cf-p").value) || 0);
  const cPerSrv = Math.max(0, parseFloat(document.getElementById("cf-c").value) || 0);
  const fPerSrv = Math.max(0, parseFloat(document.getElementById("cf-f").value) || 0);
  if (!await showConfirm(`Add "${name}" to today's log?`, 'Add')) return;
  customItems.push({
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
  ["cf-name", "cf-cal", "cf-p", "cf-c", "cf-f", "cf-bulk-price", "cf-bulk-servings", "cf-cost-per-srv"]
    .forEach((id) => (document.getElementById(id).value = ""));
  document.getElementById("cf-servings-eaten").value = "1";
  document.getElementById("cf-cost-hint").textContent = "or enter manually";
  document.getElementById("cf-today-cost-hint").textContent = `today's cost: ${prefs.formatCurrency(0)}`;
  document.getElementById("cf-name").focus();
}
window.addCustomItem = handleAddCustomItem;

async function handleRemoveCustomItem(idx) {
  if (!await showConfirm('Delete this custom food?', 'Delete')) return;
  customItems.splice(idx, 1);
  persistState();
  render();
}
window.removeCustomItem = handleRemoveCustomItem;

function openCustomFoodEditModal(idx) {
  const item = customItems[idx];
  if (!item) return;
  const energyUnit = prefs.getEnergyUnitSync();
  const srv = item.servingsEaten || 1;
  const calPerSrv = Math.round(prefs.kcalToDisplayUnit(item.cal / srv, energyUnit) * 10) / 10;
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
            <span class="field-label">Calories (${energyUnit})</span>
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
            <span class="field-label">Bulk Total Price (${prefs.getCurrencySymbol()})</span>
            <input type="number" id="cfe-bulk-price" placeholder="15.00" min="0" step="0.01" value="${item.bulkPrice || ''}" />
            <span class="field-hint">total you paid</span>
          </div>
          <div class="field-group">
            <span class="field-label">Servings in Package</span>
            <input type="number" id="cfe-bulk-servings" placeholder="30" min="1" value="${item.bulkServings || ''}" />
            <span class="field-hint">total servings</span>
          </div>
          <div class="field-group">
            <span class="field-label">Cost / Serving (${prefs.getCurrencySymbol()})</span>
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
  const servingsEaten = Math.max(1, parseFloat(document.getElementById('cfe-servings-eaten').value) || 1);
  const calPerSrvRaw = Math.max(0, parseFloat(document.getElementById('cfe-cal').value) || 0);
  const calPerSrv = Math.round(prefs.displayUnitToKcal(calPerSrvRaw, prefs.getEnergyUnitSync()));
  const pPerSrv = Math.max(0, parseFloat(document.getElementById('cfe-p').value) || 0);
  const cPerSrv = Math.max(0, parseFloat(document.getElementById('cfe-c').value) || 0);
  const fPerSrv = Math.max(0, parseFloat(document.getElementById('cfe-f').value) || 0);
  const costPerSrv = Math.max(0, parseFloat(document.getElementById('cfe-cost-per-srv').value) || 0);
  const bulkPrice = parseFloat(document.getElementById('cfe-bulk-price').value) || null;
  const bulkServings = parseFloat(document.getElementById('cfe-bulk-servings').value) || null;
  const item = customItems[idx];
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
  customItems.splice(idx, 1);
  persistState();
  render();
};

async function resetWeeklyCost() {
  if (!await showConfirm("Reset the weekly cost tracker? This deletes all logged days for this week.", 'Reset')) return;
  const weekStart = weekStartFor(todayStr());
  try {
    await db.dbDelete("weeks", weekStart);
  } catch (e) {}
  render();
  renderWeeklyCost();
}
window.resetWeeklyCost = resetWeeklyCost;

async function confirmResetDay() {
  if (!await showConfirm("Reset today's log? All serving counts and custom items will be cleared.", 'Reset')) return;
  Object.keys(servings).forEach(k => { delete servings[k]; });
  CORE_ITEMS.forEach((item) => { servings[item.id] = 0; });
  customItems.length = 0;
  persistState();
  (async () => {
    const weekStart = weekStartFor(todayStr());
    let week;
    try {
      week = await db.dbGet("weeks", weekStart);
    } catch (e) {
      week = null;
    }
    if (week && week.days && week.days[todayStr()]) {
      week.days[todayStr()] = { cal: 0, p: 0, c: 0, f: 0, cost: 0 };
      await db.dbPut("weeks", week);
    }
    renderWeeklyCost();
  })();
  render();
}
window.confirmResetDay = confirmResetDay;

// ═══════════════════════════════════════════════════════════════════
// CALORIE RANGE (inline editor)
// ═══════════════════════════════════════════════════════════════════
function showCalRangeEditor() {
  const unit = prefs.getEnergyUnitSync();
  document.getElementById("cal-range-editor").style.display = "block";
  document.getElementById("cal-range-low-label").textContent = `Floor (${unit})`;
  document.getElementById("cal-range-high-label").textContent = `Ceiling (${unit})`;
  document.getElementById("cal-range-low-input").value = Math.round(prefs.kcalToDisplayUnit(calRange.low, unit));
  document.getElementById("cal-range-high-input").value = Math.round(prefs.kcalToDisplayUnit(calRange.high, unit));
}
window.showCalRangeEditor = showCalRangeEditor;

async function saveCalRange() {
  const unit = prefs.getEnergyUnitSync();
  const lowRaw = parseFloat(document.getElementById("cal-range-low-input").value);
  const highRaw = parseFloat(document.getElementById("cal-range-high-input").value);
  const low = Number.isFinite(lowRaw) ? Math.round(prefs.displayUnitToKcal(lowRaw, unit)) : calRange.low;
  const high = Number.isFinite(highRaw) ? Math.round(prefs.displayUnitToKcal(highRaw, unit)) : calRange.high;
  if (low >= high) return;
  if (!await showConfirm(`Set calorie range to ${prefs.formatEnergy(low)} – ${prefs.formatEnergy(high)}?`, 'Save')) return;
  calRange = { low, high };
  await prefs.setCalRange(low, high);
  document.getElementById("cal-range-editor").style.display = "none";
  renderStats();
}
window.saveCalRange = saveCalRange;

function cancelCalRange() {
  document.getElementById("cal-range-editor").style.display = "none";
}
window.cancelCalRange = cancelCalRange;

// ═══════════════════════════════════════════════════════════════════
// BARCODE SCANNING (custom food)
// ═══════════════════════════════════════════════════════════════════
function fillCustomFoodFormFromScan(foodData) {
  document.getElementById('cf-name').value = foodData.name || '';
  document.getElementById('cf-cal').value = Math.round(prefs.kcalToDisplayUnit(foodData.cal ?? 0, prefs.getEnergyUnitSync()));
  document.getElementById('cf-p').value = foodData.p ?? 0;
  document.getElementById('cf-c').value = foodData.c ?? 0;
  document.getElementById('cf-f').value = foodData.f ?? 0;
}

async function startBarcodeFlowForCustomFood() {
  const access = await barcode.requestCameraAccess();
  if (!access.ok) {
    showAlert('Camera Error', access.message);
    return;
  }
  barcode.openScannerModal(async (decodedBarcode) => {
    try {
      const foodData = await barcode.lookupFood(decodedBarcode);
      if (!foodData) {
        showAlert('No Data Found', 'No nutrition info available for this product.');
      } else {
        fillCustomFoodFormFromScan(foodData);
      }
    } catch (err) {
      showAlert(err && err.isRateLimit ? 'Slow Down' : 'No Data Found', err.message || 'No nutrition info available for this product.');
    }
  });
}
window.startBarcodeFlowForCustomFood = startBarcodeFlowForCustomFood;

// ═══════════════════════════════════════════════════════════════════
// WELCOME MODAL (first run)
// ═══════════════════════════════════════════════════════════════════
async function maybeShowWelcome() {
  const started = await prefs.getJourneyStarted();
  if (started) return;
  let modal = document.getElementById('welcome-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'welcome-modal';
    modal.className = 'pg-modal';
    modal.addEventListener('click', (e) => { if (e.target === modal) window.startJourney(); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="pg-modal-box welcome-modal-box">
      <button class="pg-close-btn welcome-close-btn" onclick="window.startJourney()">×</button>
      <div class="welcome-modal-content">
        <div class="welcome-header">
          <div class="welcome-wordmark">Nawtch</div>
          <img class="welcome-nawtch-logo" src="/media/favicon-512x512.png" alt="nawtch logo image, smiling teeth with a notch in one tooth" loading="lazy" />
        </div>
        <h2 class="welcome-title">Welcome to Nawtch!</h2>
        <p class="welcome-subtitle">Track your daily macros, food costs, weight changes, create programs and exercises, and view your progress over time.</p>
        <p class="welcome-subtitle">Simple, easy, fast and free!</p>
        <button class="add-btn welcome-start-btn" onclick="window.startJourney()">Start your journey!</button>
      </div>
    </div>
  `;
  modal.classList.add('open');
}

window.startJourney = async function () {
  await prefs.setJourneyStarted();
  const modal = document.getElementById('welcome-modal');
  if (modal) modal.classList.remove('open');
};

// ═══════════════════════════════════════════════════════════════════
// ENTER KEY in custom food form
// ═══════════════════════════════════════════════════════════════════
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.activeElement?.id?.startsWith("cf-")) handleAddCustomItem();
});

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
async function init() {
  await db.openDB();
  calRange = await prefs.getCalRange();
  const energyUnit = await prefs.getEnergyUnit();
  document.getElementById('cf-cal-label').textContent = `Calories (${energyUnit})`;
  await prefs.getCurrency();
  document.getElementById('cf-bulk-price-label').textContent = `Bulk Total Price (${prefs.getCurrencySymbol()})`;
  document.getElementById('cf-cost-label').textContent = `Cost / Serving (${prefs.getCurrencySymbol()})`;
  document.getElementById('cf-today-cost-hint').textContent = `today's cost: ${prefs.formatCurrency(0)}`;
  document.getElementById('core-items-filter').addEventListener('keyup', (e) => {
    coreItemsFilter = e.target.value;
    renderCoreItems();
  });
  await loadCoreItems();

  const saved = db.loadTodayLS(todayStr());
  if (saved) {
    Object.assign(servings, saved.servings || {});
    customItems.length = 0;
    if (saved.customItems) customItems.push(...saved.customItems);
  }
  CORE_ITEMS.forEach((item) => {
    if (servings[item.id] === undefined) servings[item.id] = 0;
  });
  render();

  const initTot = computeTotals();
  if (initTot.cal > 0 || initTot.cost > 0) await persistState();
  await maybeShowWelcome();

  // Auto-reset daily log at midnight
  let lastDate = todayStr();
  setInterval(() => {
    const nowDate = todayStr();
    if (nowDate !== lastDate) {
      lastDate = nowDate;
      Object.keys(servings).forEach(k => { delete servings[k]; });
      CORE_ITEMS.forEach((item) => { servings[item.id] = 0; });
      customItems.length = 0;
      persistState();
      render();
    }
  }, 5 * 60 * 1000);
}

init();
