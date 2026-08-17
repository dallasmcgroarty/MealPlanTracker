import { esc, showConfirm, showAlert, showDbError } from "../../ui.js";
import "../../nav.js";
import "../../settingsHint.js";
import { openDB } from "../../db.js";
import { CORE_ITEMS, loadCoreItems, saveCoreItem } from "../../items.js";
import { BOWLS, loadBowls, saveBowl, deleteBowlFromDB } from "../../bowls.js";
import * as prefs from "../../prefs.js";
import { searchFoods } from "../../foodSearch.js";

const OZ_TO_G = 28.3495;
const STEP_G = 10;
const STEP_OZ = 0.5;

// Bundled local food database (~260 generic bowl ingredients) — loaded once
// in init() from bowl-foods.json. This is the primary source for both the
// tap-to-add tiles (entries flagged `popular`) and text search; Open Food
// Facts is only consulted as a fallback when a search term isn't covered here.
let BOWL_FOODS = [];

let portionUnit = "g";
let editingAmountId = null;
let searchDebounceTimer = null;

function newWorkingBowl() {
  return { id: null, name: "", createdAt: null, components: [] };
}
let workingBowl = newWorkingBowl();

function toGrams(amount, unit) {
  return unit === "oz" ? amount * OZ_TO_G : amount;
}
function fromGrams(grams, unit) {
  return unit === "oz" ? grams / OZ_TO_G : grams;
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
function componentMacros(comp) {
  const g = toGrams(comp.amount, comp.unit);
  const mult = g / 100;
  return {
    cal: comp.per100g.cal * mult,
    p: comp.per100g.p * mult,
    c: comp.per100g.c * mult,
    f: comp.per100g.f * mult,
  };
}
function computeTotals(components) {
  const totals = { cal: 0, p: 0, c: 0, f: 0 };
  components.forEach((comp) => {
    const m = componentMacros(comp);
    totals.cal += m.cal;
    totals.p += m.p;
    totals.c += m.c;
    totals.f += m.f;
  });
  return totals;
}
function defaultBowlName() {
  const d = new Date();
  return "Bowl — " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function displayAmount(comp) {
  return comp.unit === "oz" ? Math.round(comp.amount * 10) / 10 : Math.round(comp.amount);
}
function fmtAmount(comp) {
  return `${displayAmount(comp)}${comp.unit}`;
}

// ═══════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════
function renderAll() {
  renderTotalsAndVisual();
  renderBowlList();
  renderUnitToggle();
}

function renderTotalsAndVisual() {
  const totals = computeTotals(workingBowl.components);

  const visual = document.getElementById("bb-visual");
  if (workingBowl.components.length === 0) {
    visual.innerHTML = `<div class="bb-visual-empty">Empty bowl</div>`;
  } else {
    const pCal = totals.p * 4, cCal = totals.c * 4, fCal = totals.f * 9;
    const segs = [
      { grow: pCal, color: "var(--protein)", label: "Protein" },
      { grow: cCal, color: "var(--carbs)", label: "Carbs" },
      { grow: fCal, color: "var(--fat)", label: "Fat" },
    ]
      .filter((s) => s.grow > 0)
      .map((s) => `<div class="bb-visual-seg" style="flex-grow:${s.grow};background:${s.color}" title="${s.label}"></div>`)
      .join("");
    visual.innerHTML = `<div class="bb-visual-bar">${segs}</div>`;
  }

  document.getElementById("bb-totals-cal").textContent = prefs.formatEnergy(totals.cal);
  document.getElementById("bb-totals-macros").innerHTML = `
    <span class="im-p">P: ${totals.p.toFixed(0)}g</span>
    <span class="im-c">C: ${totals.c.toFixed(0)}g</span>
    <span class="im-f">F: ${totals.f.toFixed(0)}g</span>
  `;
}

function renderBowlList() {
  const list = document.getElementById("bb-bowl-list");
  if (workingBowl.components.length === 0) {
    list.innerHTML = `<div class="bb-empty-note">Nothing in your bowl yet</div>`;
    return;
  }
  list.innerHTML = workingBowl.components
    .map((comp) => {
      const m = componentMacros(comp);
      const amountCell =
        editingAmountId === comp.id
          ? `<input type="number" min="0.1" step="0.1" class="bb-amount-input" id="bb-amount-edit-${comp.id}" value="${displayAmount(comp)}" onblur="window.bbCommitAmount('${comp.id}',this.value)" onkeydown="if(event.key==='Enter')this.blur();" />`
          : `<span class="bb-amount-input" style="cursor:text;border-style:dashed;" onclick="window.bbStartEditAmount('${comp.id}')">${fmtAmount(comp)}</span>`;
      return `
      <div class="bb-bowl-row">
        <div class="bb-portion-ctrl">
          <span class="bb-step-btn" role="button" tabindex="0" aria-label="Decrease amount" onclick="window.bbAdjustAmount('${comp.id}',-1)">−</span>
          ${amountCell}
          <span class="bb-step-btn" role="button" tabindex="0" aria-label="Increase amount" onclick="window.bbAdjustAmount('${comp.id}',1)">+</span>
        </div>
        <div class="bb-bowl-row-info">
          <div class="bb-bowl-row-name">${esc(comp.name)}</div>
          <div class="bb-bowl-row-macro"><span class="im-cal">${prefs.formatEnergy(m.cal)}</span> · <span class="im-p">P ${m.p.toFixed(0)}g</span> · <span class="im-c">C ${m.c.toFixed(0)}g</span> · <span class="im-f">F ${m.f.toFixed(0)}g</span></div>
        </div>
        <span class="material-symbols-outlined bb-remove-btn" role="button" tabindex="0" aria-label="Remove ${esc(comp.name)}" onclick="window.bbRemoveComponent('${comp.id}')">close</span>
      </div>`;
    })
    .join("");
}

function renderTiles() {
  const grid = document.getElementById("bb-tile-grid");
  grid.innerHTML = BOWL_FOODS
    .filter((food) => food.popular)
    .map(
      (food) => `
      <div class="bb-tile" role="button" tabindex="0" onclick="window.bbAddCommonFood('${food.id}')">
        <span class="material-symbols-outlined bb-tile-icon">${food.icon}</span>
        <span class="bb-tile-name">${esc(food.name)}</span>
      </div>`
    )
    .join("");
}

function renderUnitToggle() {
  let row = document.getElementById("bb-unit-toggle-row");
  if (!row) return;
  row.innerHTML = `
    <span class="field-hint">Portion unit:</span>
    <button type="button" class="bb-unit-toggle-btn ${portionUnit === "g" ? "active" : ""}" onclick="window.bbSetUnit('g')">grams</button>
    <button type="button" class="bb-unit-toggle-btn ${portionUnit === "oz" ? "active" : ""}" onclick="window.bbSetUnit('oz')">ounces</button>
  `;
}

function renderSavedBowls() {
  const list = document.getElementById("bb-saved-bowls-list");
  const empty = document.getElementById("bb-saved-bowls-empty");
  if (BOWLS.length === 0) {
    list.innerHTML = "";
    empty.style.display = "";
    return;
  }
  empty.style.display = "none";
  list.innerHTML = BOWLS
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((bowl) => {
      const totals = computeTotals(bowl.components);
      return `
      <div class="mgmt-card">
        <div class="mgmt-card-top">
          <div class="mgmt-card-name">${esc(bowl.name)}</div>
        </div>
        <div class="bb-bowl-row-macro"><span class="im-cal">${prefs.formatEnergy(totals.cal)}</span> · <span class="im-p">P ${totals.p.toFixed(0)}g</span> · <span class="im-c">C ${totals.c.toFixed(0)}g</span> · <span class="im-f">F ${totals.f.toFixed(0)}g</span> · ${bowl.components.length} item${bowl.components.length === 1 ? "" : "s"}</div>
        <div class="mgmt-card-actions">
          <button class="mgmt-edit-btn" onclick="window.bbOpenSavedBowl('${bowl.id}')">Open / Edit</button>
          <button class="mgmt-edit-btn" onclick="window.bbAddToNawtchFromSaved('${bowl.id}')">Add to Foods</button>
          <button class="mgmt-edit-btn" onclick="window.bbExportBowlPng('${bowl.id}')">Export PNG</button>
          <button class="remove-btn" onclick="window.bbDeleteBowl('${bowl.id}')">Delete</button>
        </div>
      </div>`;
    })
    .join("");
}

// ═══════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════
function addComponent({ name, per100g, sourceType, sourceRef }) {
  // Keep full precision here too — fmtAmount() rounds for display only, so a
  // 100g default stored exactly (not pre-rounded to e.g. 3.5oz) round-trips
  // cleanly no matter how many times the unit is toggled afterward.
  const amount = portionUnit === "oz" ? fromGrams(100, "oz") : 100;
  workingBowl.components.push({
    id: "comp_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    name,
    amount,
    unit: portionUnit,
    per100g,
    sourceType,
    sourceRef: sourceRef || null,
  });
  renderAll();
}

window.bbAddCommonFood = function (id) {
  const food = BOWL_FOODS.find((f) => f.id === id);
  if (!food) return;
  addComponent({
    name: food.name,
    per100g: { cal: food.cal, p: food.p, c: food.c, f: food.f },
    sourceType: "local",
    sourceRef: food.id,
  });
};

window.bbAddSearchResult = function (idx) {
  const list = window._bbLastSearchResults;
  const result = list && list[idx];
  if (!result) return;
  addComponent({
    name: result.name,
    per100g: result.per100g,
    sourceType: result.source === "local" ? "local" : "off",
    sourceRef: result.id,
  });
  document.getElementById("bb-search-input").value = "";
  document.getElementById("bb-search-results").innerHTML = "";
  document.getElementById("bb-search-hint").textContent = "";
};

window.bbRemoveComponent = function (id) {
  workingBowl.components = workingBowl.components.filter((c) => c.id !== id);
  renderAll();
};

window.bbAdjustAmount = function (id, direction) {
  const comp = workingBowl.components.find((c) => c.id === id);
  if (!comp) return;
  const step = comp.unit === "oz" ? STEP_OZ : STEP_G;
  comp.amount = Math.max(step, round1(comp.amount + direction * step));
  renderAll();
};

window.bbStartEditAmount = function (id) {
  editingAmountId = id;
  renderBowlList();
  const input = document.getElementById(`bb-amount-edit-${id}`);
  if (input) {
    input.focus();
    input.select();
  }
};

window.bbCommitAmount = function (id, value) {
  const comp = workingBowl.components.find((c) => c.id === id);
  editingAmountId = null;
  if (comp) {
    const parsed = parseFloat(value);
    comp.amount = parsed > 0 ? round1(parsed) : comp.amount;
  }
  renderAll();
};

window.bbSetUnit = async function (unit) {
  if (unit === portionUnit) return;
  workingBowl.components.forEach((comp) => {
    // Keep full precision on conversion — rounding here would compound with
    // each toggle (100g -> 3.5oz -> 99.2g -> ...) and drift from the true value.
    // Display-side rounding (fmtAmount) still keeps the UI clean.
    const grams = toGrams(comp.amount, comp.unit);
    comp.unit = unit;
    comp.amount = fromGrams(grams, unit);
  });
  portionUnit = unit;
  await prefs.setPortionUnit(unit);
  renderAll();
};

window.bbStartNewBowl = async function () {
  if (workingBowl.components.length > 0) {
    if (!(await showConfirm("Start a new bowl? Anything not saved will be lost.", "Start New"))) return;
  }
  workingBowl = newWorkingBowl();
  document.getElementById("bb-bowl-name-input").value = "";
  renderAll();
  renderSaveButtons();
};

window.bbOpenSavedBowl = function (id) {
  const bowl = BOWLS.find((b) => b.id === id);
  if (!bowl) return;
  workingBowl = {
    id: bowl.id,
    name: bowl.name,
    createdAt: bowl.createdAt,
    components: bowl.components.map((c) => ({ ...c, per100g: { ...c.per100g } })),
  };
  document.getElementById("bb-bowl-name-input").value = bowl.name;
  renderAll();
  renderSaveButtons();
  document.getElementById("bb-bowl-section").scrollIntoView({ behavior: "smooth", block: "start" });
};

// ═══════════════════════════════════════════════════════════════════
// EXPORT (PNG) — a purpose-built canvas card, not a screenshot of the live
// editing UI. Height is computed in a measure pass (real font metrics via a
// scratch canvas) before the real canvas is created, so long bowl names and
// ingredient lists wrap instead of getting cut off or overlapping.
// ═══════════════════════════════════════════════════════════════════
let _bbLogoImgPromise = null;
function loadBowlExportLogo() {
  if (!_bbLogoImgPromise) {
    _bbLogoImgPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "../../media/nawtch-logo.svg";
    });
  }
  return _bbLogoImgPromise;
}

function bbWrapLines(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function bbSlugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || "bowl";
}

// Exported cards show both units regardless of the working bowl's current
// portion-unit toggle, since a shared image shouldn't assume the viewer
// thinks in whichever unit the original editor happened to be using.
function bbFmtAmountBoth(comp) {
  const grams = toGrams(comp.amount, comp.unit);
  const oz = fromGrams(grams, "oz");
  return `${Math.round(grams)}g or ${round1(oz)}oz`;
}

// Builds the full list of draw operations and the exact canvas height they
// require — a single pass so measurement and drawing can never drift apart.
function bbLayoutCard(bowl, hasLogo) {
  const W = 1000;
  const PAD = 64;
  const contentW = W - PAD * 2;
  const amountColW = 230;
  const nameColW = contentW - amountColW;
  const mctx = document.createElement("canvas").getContext("2d");
  const totals = computeTotals(bowl.components);

  const ops = [];
  let y = PAD;

  if (hasLogo) ops.push({ type: "logo", x: PAD, y, w: 32, h: 32 });
  ops.push({ type: "text", text: "NAWTCH", x: PAD + (hasLogo ? 42 : 0), y: y + 8, font: "500 16px 'DM Mono', monospace", color: "#9fa5c4" });
  ops.push({ type: "text", text: "BOWL SUMMARY", x: W - PAD, y: y + 8, font: "500 16px 'DM Mono', monospace", color: "#9fa5c4", align: "right" });
  y += 64;

  ops.push({ type: "hr", y });
  y += 32;

  const titleFont = "800 52px Syne, sans-serif";
  mctx.font = titleFont;
  const titleLines = bbWrapLines(mctx, bowl.name || "Bowl", contentW);
  titleLines.forEach((line) => {
    ops.push({ type: "text", text: line, x: PAD, y, font: titleFont, color: "#e8eaf0" });
    y += 62;
  });

  const dateStr = new Date(bowl.updatedAt || bowl.createdAt || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  ops.push({
    type: "text",
    text: `${bowl.components.length} ingredient${bowl.components.length === 1 ? "" : "s"} · ${dateStr}`,
    x: PAD,
    y,
    font: "500 20px 'DM Mono', monospace",
    color: "#9fa5c4",
  });
  y += 52;

  ops.push({ type: "hr", y });
  y += 32;

  const rowNameFont = "600 26px Syne, sans-serif";
  mctx.font = rowNameFont;
  bowl.components.forEach((comp) => {
    const lines = bbWrapLines(mctx, comp.name, nameColW);
    lines.forEach((line, idx) => {
      ops.push({ type: "text", text: line, x: PAD, y, font: rowNameFont, color: "#e8eaf0" });
      if (idx === 0) {
        ops.push({ type: "text", text: bbFmtAmountBoth(comp), x: W - PAD, y, font: "500 22px 'DM Mono', monospace", color: "#9fa5c4", align: "right" });
      }
      y += 34;
    });
    y += 16;
  });

  ops.push({ type: "hr", y });
  y += 32;

  ops.push({ type: "text", text: "TOTAL", x: PAD, y, font: "600 18px 'DM Mono', monospace", color: "#9fa5c4" });
  y += 32;
  ops.push({ type: "text", text: prefs.formatEnergy(totals.cal), x: PAD, y, font: "800 56px Syne, sans-serif", color: "#c8f060" });
  y += 76;

  const macroFont = "600 24px Syne, sans-serif";
  mctx.font = macroFont;
  const macroParts = [
    { text: `Protein ${totals.p.toFixed(0)}g`, color: "#60f0a0" },
    { text: `Carbs ${totals.c.toFixed(0)}g`, color: "#f0d060" },
    { text: `Fat ${totals.f.toFixed(0)}g`, color: "#f09060" },
  ];
  let mx = PAD;
  macroParts.forEach((part) => {
    ops.push({ type: "text", text: part.text, x: mx, y, font: macroFont, color: part.color });
    mx += mctx.measureText(part.text).width + 32;
  });
  y += 64;

  ops.push({ type: "hr", y });
  y += 40;

  ops.push({ type: "text", text: "Built with Nawtch — nawtch.app", x: W / 2, y, font: "500 16px 'DM Mono', monospace", color: "#9fa5c4", align: "center" });
  y += 16 + PAD;

  return { W, height: Math.round(y), ops, PAD };
}

function bbDrawCard(bowl, logo) {
  const { W, height, ops, PAD } = bbLayoutCard(bowl, !!logo);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0e0f13";
  ctx.fillRect(0, 0, W, height);
  ctx.strokeStyle = "#2a2d3a";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, height - 2);
  ctx.textBaseline = "top";

  ops.forEach((op) => {
    if (op.type === "hr") {
      ctx.strokeStyle = "#2a2d3a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, op.y);
      ctx.lineTo(W - PAD, op.y);
      ctx.stroke();
    } else if (op.type === "logo") {
      ctx.drawImage(logo, op.x, op.y, op.w, op.h);
    } else if (op.type === "text") {
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align || "left";
      ctx.fillText(op.text, op.x, op.y);
      ctx.textAlign = "left";
    }
  });

  return canvas;
}

window.bbExportBowlPng = async function (id) {
  const bowl = BOWLS.find((b) => b.id === id);
  if (!bowl) return;
  if (!(await showConfirm("This will generate a PNG image of this bowl's ingredients and totals for you to save or share. Continue?", "Export PNG"))) return;
  await document.fonts.ready;
  const logo = await loadBowlExportLogo();
  const canvas = bbDrawCard(bowl, logo);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${bbSlugify(bowl.name || "bowl")}-nawtch.png`;
  a.click();
};

window.bbDeleteBowl = async function (id) {
  const bowl = BOWLS.find((b) => b.id === id);
  if (!bowl) return;
  if (!(await showConfirm(`Delete saved bowl "${bowl.name}"? Any food you already added to Nawtch from it is unaffected.`, "Delete"))) return;
  try {
    await deleteBowlFromDB(id);
  } catch (e) {
    showDbError();
    return;
  }
  const idx = BOWLS.findIndex((b) => b.id === id);
  if (idx >= 0) BOWLS.splice(idx, 1);
  if (workingBowl.id === id) {
    workingBowl = newWorkingBowl();
    document.getElementById("bb-bowl-name-input").value = "";
    renderAll();
    renderSaveButtons();
  }
  renderSavedBowls();
};

async function persistBowl(asNew) {
  const nameInput = document.getElementById("bb-bowl-name-input").value.trim();
  const name = nameInput || defaultBowlName();
  const now = Date.now();
  let bowl;
  if (workingBowl.id && !asNew) {
    bowl = { id: workingBowl.id, name, createdAt: workingBowl.createdAt || now, updatedAt: now, components: workingBowl.components };
  } else {
    bowl = { id: "bowl_" + now, name, createdAt: now, updatedAt: now, components: workingBowl.components };
  }
  try {
    await saveBowl(bowl);
  } catch (e) {
    showDbError();
    return false;
  }
  const idx = BOWLS.findIndex((b) => b.id === bowl.id);
  if (idx >= 0) BOWLS[idx] = bowl;
  else BOWLS.push(bowl);
  workingBowl.id = bowl.id;
  workingBowl.createdAt = bowl.createdAt;
  workingBowl.name = name;
  document.getElementById("bb-bowl-name-input").value = name;
  renderSavedBowls();
  renderSaveButtons();
  return { name };
}

window.bbSaveBowl = async function () {
  if (workingBowl.components.length === 0) {
    showAlert("Empty Bowl", "Add at least one item to your bowl before saving.");
    return;
  }
  if (!(await showConfirm("Save this bowl?", "Save"))) return;
  const result = await persistBowl(false);
  if (result) showAlert("Bowl Saved", `"${result.name}" was saved.`);
};

window.bbSaveBowlAsNew = async function () {
  if (workingBowl.components.length === 0) {
    showAlert("Empty Bowl", "Add at least one item to your bowl before saving.");
    return;
  }
  if (!(await showConfirm("Save this bowl as a new entry?", "Save as New"))) return;
  const result = await persistBowl(true);
  if (result) showAlert("Bowl Saved", `"${result.name}" was saved as a new bowl.`);
};

async function flattenToFood(name, components) {
  const totals = computeTotals(components);
  const finalName = name || defaultBowlName();
  if (!(await showConfirm(`Add "${finalName}" to your Foods catalog (${Math.round(totals.cal)} kcal)? This creates a new, independent food entry.`, "Add"))) return;
  const newItem = {
    id: "food_" + Date.now(),
    name: finalName,
    cal: Math.round(totals.cal),
    p: round1(totals.p),
    c: round1(totals.c),
    f: round1(totals.f),
    costPerServing: 0,
    target: 1,
    freq: "1 srv/day",
    inactive: false,
  };
  CORE_ITEMS.push(newItem);
  try {
    await saveCoreItem(newItem);
  } catch (e) {
    showDbError();
    return;
  }
  showAlert("Added to Nawtch", `"${finalName}" was added to your Foods catalog — log it any time from the Today page.`);
}

window.bbAddToNawtch = async function () {
  if (workingBowl.components.length === 0) {
    showAlert("Empty Bowl", "Add at least one item to your bowl first.");
    return;
  }
  const nameInput = document.getElementById("bb-bowl-name-input").value.trim();
  await flattenToFood(nameInput || workingBowl.name, workingBowl.components);
};

window.bbAddToNawtchFromSaved = async function (id) {
  const bowl = BOWLS.find((b) => b.id === id);
  if (!bowl) return;
  await flattenToFood(bowl.name, bowl.components);
};

function renderSaveButtons() {
  const wrap = document.getElementById("bb-save-as-new-wrap");
  if (!wrap) return;
  wrap.innerHTML = workingBowl.id
    ? `<button type="button" class="ghost-btn" onclick="window.bbSaveBowlAsNew()">Save as New</button>`
    : "";
  wrap.style.display = workingBowl.id ? "" : "none";
}

// ═══════════════════════════════════════════════════════════════════
// CUSTOM ITEM MODAL — reuses the same field set as the Today page's
// custom-item entry (name, calories, protein, carbs, fat), plus the amount
// those values are measured at, so it fits the amount/per100g model.
// ═══════════════════════════════════════════════════════════════════
function ensureCustomItemModal() {
  if (!document.getElementById("bb-custom-item-modal")) {
    const el = document.createElement("div");
    el.id = "bb-custom-item-modal";
    el.className = "pg-modal";
    el.addEventListener("click", (e) => {
      if (e.target === el) closeCustomItemModal();
    });
    document.body.appendChild(el);
  }
}

function openCustomItemModal() {
  ensureCustomItemModal();
  const energyUnit = prefs.getEnergyUnitSync();
  const modal = document.getElementById("bb-custom-item-modal");
  modal.innerHTML = `
    <div class="pg-modal-box pg-modal-box-lg">
      <div class="pg-modal-header">
        <div class="pg-modal-title">Add a Custom Item</div>
        <button class="pg-close-btn" onclick="window.bbCloseCustomItemModal()">×</button>
      </div>
      <div class="pg-modal-body">
        <div class="add-row add-row-1">
          <div class="field-group">
            <span class="field-label">Name</span>
            <input id="bb-ci-name" type="text" placeholder="e.g. Homemade Chili" />
          </div>
          <div class="field-group">
            <span class="field-label">Amount (${portionUnit})</span>
            <input id="bb-ci-amount" type="number" min="0.1" step="0.1" placeholder="100" value="100" />
          </div>
        </div>
        <div class="add-row add-row-2" style="margin-top:12px;">
          <div class="field-group">
            <span class="field-label">Calories (${energyUnit})</span>
            <input id="bb-ci-cal" type="number" placeholder="120" min="0" />
            <span class="field-hint">at that amount</span>
          </div>
          <div class="field-group">
            <span class="field-label">Protein (g)</span>
            <input id="bb-ci-p" type="number" placeholder="24" min="0" />
          </div>
          <div class="field-group">
            <span class="field-label">Carbs (g)</span>
            <input id="bb-ci-c" type="number" placeholder="0" min="0" />
          </div>
          <div class="field-group">
            <span class="field-label">Fat (g)</span>
            <input id="bb-ci-f" type="number" placeholder="2" min="0" />
          </div>
        </div>
      </div>
      <div class="pg-modal-footer">
        <div></div>
        <div style="display:flex;gap:8px;">
          <button class="ghost-btn" onclick="window.bbCloseCustomItemModal()">Cancel</button>
          <button class="add-btn" onclick="window.bbSubmitCustomItem()">+ Add to Bowl</button>
        </div>
      </div>
    </div>
  `;
  modal.classList.add("open");
}

window.bbCloseCustomItemModal = function () {
  const modal = document.getElementById("bb-custom-item-modal");
  if (modal) modal.classList.remove("open");
};

window.bbSubmitCustomItem = function () {
  const name = document.getElementById("bb-ci-name").value.trim();
  const amountRaw = Math.max(0.1, parseFloat(document.getElementById("bb-ci-amount").value) || 100);
  const calRaw = Math.max(0, parseFloat(document.getElementById("bb-ci-cal").value) || 0);
  const cal = prefs.displayUnitToKcal(calRaw, prefs.getEnergyUnitSync());
  const p = Math.max(0, parseFloat(document.getElementById("bb-ci-p").value) || 0);
  const c = Math.max(0, parseFloat(document.getElementById("bb-ci-c").value) || 0);
  const f = Math.max(0, parseFloat(document.getElementById("bb-ci-f").value) || 0);
  if (!name) return;
  const amountG = toGrams(amountRaw, portionUnit);
  const scale = 100 / amountG;
  addComponent({
    name,
    per100g: { cal: cal * scale, p: p * scale, c: c * scale, f: f * scale },
    sourceType: "custom",
    sourceRef: null,
  });
  window.bbCloseCustomItemModal();
};

// ═══════════════════════════════════════════════════════════════════
// SEARCH — local-first. The bundled database is matched instantly, for free,
// on every keystroke. Open Food Facts is only queried as a fallback when the
// local list has nothing, and keeps its own debounce/rate-limit since it's a
// real network call with a real per-IP cap.
// ═══════════════════════════════════════════════════════════════════
function searchLocalFoods(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const startsWith = [];
  const includes = [];
  for (const food of BOWL_FOODS) {
    const name = food.name.toLowerCase();
    if (name.startsWith(q)) startsWith.push(food);
    else if (name.includes(q)) includes.push(food);
  }
  return [...startsWith, ...includes].slice(0, 20).map((food) => ({
    source: "local",
    id: food.id,
    name: food.name,
    per100g: { cal: food.cal, p: food.p, c: food.c, f: food.f },
  }));
}

function wireSearch() {
  const input = document.getElementById("bb-search-input");
  const results = document.getElementById("bb-search-results");
  const hint = document.getElementById("bb-search-hint");

  function renderResults(found) {
    window._bbLastSearchResults = found;
    results.innerHTML = found
      .map(
        (r, idx) => `
        <div class="bb-search-result" onclick="window.bbAddSearchResult(${idx})">
          <span class="bb-search-result-name">${esc(r.name)}</span>
          <span class="bb-search-result-macro">${Math.round(r.per100g.cal)} kcal / 100g</span>
        </div>`
      )
      .join("");
  }

  input.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    const query = input.value.trim();

    if (!query) {
      results.innerHTML = "";
      hint.textContent = "Type to search our built-in food list";
      return;
    }

    const localMatches = searchLocalFoods(query);
    if (localMatches.length > 0) {
      hint.textContent = "";
      renderResults(localMatches);
      return;
    }

    results.innerHTML = "";
    if (query.length < 3) {
      hint.textContent = "Type at least 3 characters to search beyond our built-in list";
      return;
    }

    // Nothing local — fall back to Open Food Facts. Its search endpoint is
    // capped at 10 requests/min/IP, so wait for a real pause in typing rather
    // than firing on every keystroke.
    hint.textContent = "Waiting for you to finish typing…";
    searchDebounceTimer = setTimeout(async () => {
      hint.textContent = "Searching…";
      try {
        const found = await searchFoods(query);
        const normalized = found.map((r) => ({ source: "off", id: r.code, name: r.name, per100g: r.per100g }));
        hint.textContent = normalized.length ? "" : "No results — try a different search or add a custom item";
        renderResults(normalized);
      } catch (e) {
        hint.textContent = e.isRateLimit ? e.message : "Search failed — try again in a moment.";
      }
    }, 3000);
  });
}

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
async function init() {
  await openDB();
  const [, , , bowlFoods] = await Promise.all([
    loadCoreItems(),
    loadBowls(),
    prefs.getEnergyUnit(),
    fetch("./bowl-foods.json").then((r) => r.json()).catch(() => []),
  ]);
  BOWL_FOODS = bowlFoods;
  portionUnit = await prefs.getPortionUnit();

  renderTiles();
  renderAll();
  renderSaveButtons();
  renderSavedBowls();
  wireSearch();

  document.getElementById("bb-custom-item-btn").addEventListener("click", openCustomItemModal);
  document.getElementById("bb-save-bowl-btn").addEventListener("click", () => window.bbSaveBowl());
  document.getElementById("bb-add-to-nawtch-btn").addEventListener("click", () => window.bbAddToNawtch());
}

init();
