import * as db from "../db.js";
import * as prefs from "../prefs.js";
import { showAlert, showConfirm } from "../ui.js";
import "../nav.js";
import "../settingsHint.js";

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

const ACTIVITY_LEVELS = [
  { id: "sedentary", label: "Sedentary", mult: 1.2, desc: "Little or no exercise, office job" },
  { id: "light", label: "Light", mult: 1.375, desc: "Exercise 1–3 days/wk" },
  { id: "moderate", label: "Moderate", mult: 1.55, desc: "Exercise 3–5 days/wk" },
  { id: "active", label: "Heavy Exercise", mult: 1.725, desc: "Exercise 6–7 days/wk" },
  { id: "veryActive", label: "Athlete", mult: 1.9, desc: "Hard exercise + physical job or intense training regimen (2x per day)" },
];

const GOALS = [
  { id: "lose", label: "Lose Weight", delta: -500, band: 150 },
  { id: "maintain", label: "Stay the Same", delta: 0, band: 100 },
  { id: "gain", label: "Gain Weight", delta: 350, band: 150 },
];

const PRESETS = [
  { id: "highProtein", label: "High Protein", p: 40, c: 30, f: 30, desc: "Preserve muscle while eating less" },
  { id: "lowCarb", label: "Low Carb", p: 30, c: 20, f: 50, desc: "Fewer carbs, more fat for energy" },
  { id: "lowFat", label: "Low Fat", p: 25, c: 55, f: 20, desc: "Fewer fat calories, more carbs" },
  { id: "standard", label: "Standard", p: 20, c: 50, f: 30, desc: "Typical balanced diet, not training for muscle gain" },
];

// ═══════════════════════════════════════════════════════════════════
// STATE — session-only, same as chartMode/halfStepMode elsewhere; nothing
// here is persisted except via the explicit "Apply to Settings" action.
// ═══════════════════════════════════════════════════════════════════
let activeTab = "tdee"; // 'tdee' | 'macros'
let units = "imperial"; // 'imperial' | 'metric'
let sex = null; // 'male' | 'female'
let ageVal = "";
let heightVal = "";
let weightVal = "";
let activity = "moderate";
let goal = "maintain";
let tdeeResult = null; // { bmr, tdee, low, high, goalLabel }

let macroMid = 0; // last-rendered macro base calories, used by the live custom-% updater
let selectedPresetId = "standard";
let customPct = { p: 20, c: 50, f: 30 };

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round50(n) {
  return Math.round(n / 50) * 50;
}

function computeBMR(sexVal, kg, cm, age) {
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return sexVal === "male" ? base + 5 : base - 161;
}

// Height dropdown range for imperial units: 4ft 0in–7ft 0in, values in total inches.
const HEIGHT_MIN_IN = 48;
const HEIGHT_MAX_IN = 84;

function heightOptionsHTML(selectedIn) {
  let html = `<option value="" ${!selectedIn ? "selected" : ""} disabled>Select height</option>`;
  for (let totalIn = HEIGHT_MIN_IN; totalIn <= HEIGHT_MAX_IN; totalIn++) {
    const ft = Math.floor(totalIn / 12);
    const inch = totalIn % 12;
    html += `<option value="${totalIn}" ${String(totalIn) === String(selectedIn) ? "selected" : ""}>${ft}ft ${inch}in</option>`;
  }
  return html;
}

// ═══════════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════════
function renderCalcTabs() {
  const el = document.getElementById("calc-tabs-container");
  el.innerHTML = `
    <nav class="nav-tabs" style="margin-bottom:20px;">
      <button class="nav-tab ${activeTab === "tdee" ? "active" : ""}" onclick="window.calcSetTab('tdee')">TDEE</button>
      <button class="nav-tab ${activeTab === "macros" ? "active" : ""}" onclick="window.calcSetTab('macros')">Macros</button>
    </nav>
  `;
}

window.calcSetTab = function (tab) {
  activeTab = tab;
  renderCalcTabs();
  document.getElementById("calc-tdee").style.display = tab === "tdee" ? "" : "none";
  document.getElementById("calc-tdee-explain").style.display = tab === "tdee" ? "" : "none";
  document.getElementById("calc-macros").style.display = tab === "macros" ? "" : "none";
  if (tab === "macros") renderMacrosTab();
};

// ═══════════════════════════════════════════════════════════════════
// TDEE TAB
// ═══════════════════════════════════════════════════════════════════
function renderTdeeTab() {
  const el = document.getElementById("calc-tdee");
  const heightUnit = units === "metric" ? "cm" : "ft/in";
  const weightUnit = units === "metric" ? "kg" : "lb";

  el.innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">Total Daily Energy Expenditure (TDEE) Calculator</div>
      <div class="settings-section-body">
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:14px;">
          <div class="wt-toggle">
            <button class="wt-toggle-btn ${units === "imperial" ? "active" : ""}" onclick="window.calcSetUnits('imperial')">Imperial</button>
            <button class="wt-toggle-btn ${units === "metric" ? "active" : ""}" onclick="window.calcSetUnits('metric')">Metric</button>
          </div>
          <div class="field-group" style="margin-top: 6px;">
            <div class="field-label">Gender</div>
            <div class="wt-toggle">
              <button class="wt-toggle-btn ${sex === "female" ? "active" : ""}" onclick="window.calcSetSex('female')">Female</button>
              <button class="wt-toggle-btn ${sex === "male" ? "active" : ""}" onclick="window.calcSetSex('male')">Male</button>
            </div>
          </div>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Age</span>
            <input type="number" id="calc-age" min="10" max="100" step="1" placeholder="30" value="${ageVal}" oninput="window.calcSetAge(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Height (${heightUnit})</span>
            ${
              units === "metric"
                ? `<input type="number" id="calc-height" min="0" step="0.1" placeholder="173" value="${heightVal}" oninput="window.calcSetHeight(this.value)" />`
                : `<select id="calc-height" onchange="window.calcSetHeight(this.value)">${heightOptionsHTML(heightVal)}</select>`
            }
          </div>
          <div class="field-group">
            <span class="field-label">Weight (${weightUnit})</span>
            <input type="number" id="calc-weight" min="0" step="0.1" placeholder="${units === "metric" ? "70" : "155"}" value="${weightVal}" oninput="window.calcSetWeight(this.value)" />
          </div>
        </div>

        <div style="margin-top:14px;">
          <span class="field-label" style="display:block;margin-bottom:6px;">Activity Level</span>
          <div class="wt-toggle" style="flex-wrap:wrap;">
            ${ACTIVITY_LEVELS.map((a) => `<button class="wt-toggle-btn ${activity === a.id ? "active" : ""}" title="${a.desc}" onclick="window.calcSetActivity('${a.id}')">${a.label}</button>`).join("")}
          </div>
          <span class="field-hint" style="display:block;margin-top:6px;">${ACTIVITY_LEVELS.find((a) => a.id === activity).desc}</span>
        </div>

        <div style="margin-top:14px;">
          <span class="field-label" style="display:block;margin-bottom:6px;">Goal</span>
          <div class="wt-toggle">
            ${GOALS.map((g) => `<button class="wt-toggle-btn ${goal === g.id ? "active" : ""}" onclick="window.calcSetGoal('${g.id}')">${g.label}</button>`).join("")}
          </div>
          <span class="field-hint" style="display:block;margin-top:6px;">Lose: ~500 kcal/day deficit (≈1 lb/wk) · Gain: ~350 kcal/day surplus (≈0.5–0.7 lb/wk)</span>
        </div>

        <button class="add-btn" style="margin-top:16px;" onclick="window.calcRunTdee()">Calculate</button>
      </div>
    </div>
    ${tdeeResult ? renderTdeeResult() : ""}
  `;
}

function renderTdeeResult() {
  return `
    <div class="settings-section">
      <div class="settings-section-title">Recommended Range</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:0;">
          <div class="total-card">
            <div class="val">${tdeeResult.bmr.toLocaleString()}</div>
            <div class="lbl">BMR</div>
            <div class="sub">at rest</div>
          </div>
          <div class="total-card">
            <div class="val">${tdeeResult.tdee.toLocaleString()}</div>
            <div class="lbl">TDEE</div>
            <div class="sub">to maintain</div>
          </div>
          <div class="total-card tc-cal">
            <div class="val">${tdeeResult.low.toLocaleString()}–${tdeeResult.high.toLocaleString()}</div>
            <div class="lbl">Target Range</div>
            <div class="sub">${tdeeResult.goalLabel}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
          <button class="add-btn" onclick="window.calcApplyToSettings()">Apply to Settings</button>
          <button class="ghost-btn" onclick="window.calcSetTab('macros')">Use in Macros →</button>
        </div>
      </div>
    </div>
  `;
}

window.calcSetUnits = function (u) {
  if (u === units) return;
  const h = parseFloat(heightVal);
  const w = parseFloat(weightVal);
  if (!isNaN(h)) {
    heightVal =
      u === "metric"
        ? String(round1(h * CM_PER_IN))
        : String(Math.min(HEIGHT_MAX_IN, Math.max(HEIGHT_MIN_IN, Math.round(h / CM_PER_IN))));
  }
  if (!isNaN(w)) weightVal = String(round1(u === "metric" ? w * KG_PER_LB : w / KG_PER_LB));
  units = u;
  renderTdeeTab();
};
window.calcSetSex = function (v) {
  sex = v;
  renderTdeeTab();
};
window.calcSetAge = function (v) {
  ageVal = v;
};
window.calcSetHeight = function (v) {
  heightVal = v;
};
window.calcSetWeight = function (v) {
  weightVal = v;
};
window.calcSetActivity = function (id) {
  activity = id;
  renderTdeeTab();
};
window.calcSetGoal = function (id) {
  goal = id;
  renderTdeeTab();
};

window.calcRunTdee = function () {
  const age = parseFloat(ageVal);
  const heightRaw = parseFloat(heightVal);
  const weightRaw = parseFloat(weightVal);
  if (!sex) return showAlert("Missing Info", "Select your sex to calculate BMR.");
  if (!age || age <= 0 || !heightRaw || heightRaw <= 0 || !weightRaw || weightRaw <= 0) {
    return showAlert("Missing Info", "Enter your age, height, and weight to calculate.");
  }
  const heightCm = units === "metric" ? heightRaw : heightRaw * CM_PER_IN;
  const weightKg = units === "metric" ? weightRaw : weightRaw * KG_PER_LB;
  const bmr = computeBMR(sex, weightKg, heightCm, age);
  const activityDef = ACTIVITY_LEVELS.find((a) => a.id === activity);
  const goalDef = GOALS.find((g) => g.id === goal);
  const tdee = bmr * activityDef.mult;
  const center = tdee + goalDef.delta;
  tdeeResult = {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    low: round50(center - goalDef.band),
    high: round50(center + goalDef.band),
    goalLabel: goalDef.label,
  };
  renderTdeeTab();
};

window.calcApplyToSettings = async function () {
  if (!tdeeResult) return;
  if (!(await showConfirm(`Set calorie range to ${tdeeResult.low.toLocaleString()} – ${tdeeResult.high.toLocaleString()} kcal?`, "Save"))) return;
  await prefs.setCalRange(tdeeResult.low, tdeeResult.high);
};

// ═══════════════════════════════════════════════════════════════════
// MACROS TAB
// ═══════════════════════════════════════════════════════════════════
function gramsFor(pct, mid, kcalPerG) {
  return Math.round((mid * pct) / 100 / kcalPerG);
}

function customResultHTML(p, c, f, mid) {
  const sum = p + c + f;
  const pg = gramsFor(p, mid, 4);
  const cg = gramsFor(c, mid, 4);
  const fg = gramsFor(f, mid, 9);
  const warn = sum !== 100 ? `<div style="color:var(--warn);font-family:'DM Mono',monospace;font-size:10px;margin-top:6px;">Adds up to ${sum}% — should be 100%</div>` : "";
  return `
    <div style="display:flex;gap:18px;font-family:'DM Mono',monospace;font-size:13px;margin-top:10px;flex-wrap:wrap;">
      <span class="day-p">${pg}g protein</span>
      <span class="day-c">${cg}g carbs</span>
      <span class="day-f">${fg}g fat</span>
    </div>
    ${warn}
  `;
}

async function renderMacrosTab() {
  const el = document.getElementById("calc-macros");
  let low, high, source;
  if (tdeeResult) {
    low = tdeeResult.low;
    high = tdeeResult.high;
    source = "your calculated TDEE range";
  } else {
    const range = await prefs.getCalRange();
    low = range.low;
    high = range.high;
    source = "your Settings target range";
  }
  const mid = Math.round((low + high) / 2);
  macroMid = mid;

  el.innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">Macro Breakdown</div>
      <div class="settings-section-body">
        <p class="settings-desc">Based on ${source}: ${low.toLocaleString()}–${high.toLocaleString()} kcal/day (avg ${mid.toLocaleString()} kcal).</p>
        <div style="overflow-x:auto;">
        <table class="days-table" style="margin-top:12px;">
          <thead><tr><th>Plan</th><th>Protein</th><th>Carbs</th><th>Fat</th><th></th></tr></thead>
          <tbody>
            ${PRESETS.map((preset) => {
              const pg = gramsFor(preset.p, mid, 4);
              const cg = gramsFor(preset.c, mid, 4);
              const fg = gramsFor(preset.f, mid, 9);
              const isSelected = selectedPresetId === preset.id;
              return `<tr style="${isSelected ? "background:var(--surface2);" : ""}">
                <td><span class="day-date">${preset.label}</span><br><span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);white-space:normal;">${preset.desc}</span></td>
                <td class="day-p">${pg}g <span style="color:var(--muted);">· ${preset.p}%</span></td>
                <td class="day-c">${cg}g <span style="color:var(--muted);">· ${preset.c}%</span></td>
                <td class="day-f">${fg}g <span style="color:var(--muted);">· ${preset.f}%</span></td>
                <td><button class="ghost-btn" style="padding:4px 10px;font-size:10px;" onclick="window.calcUsePreset('${preset.id}')">${isSelected ? "Selected" : "Use"}</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Adjust Your Own %</div>
      <div class="settings-section-body">
        <p class="settings-desc">Start from a plan above, or set your own split below — percentages should add up to 100%.</p>
        <div class="add-row add-row-2" style="margin-top:10px;">
          <div class="field-group">
            <span class="field-label">Protein %</span>
            <input type="number" id="calc-pct-p" min="0" max="100" step="1" value="${customPct.p}" oninput="window.calcUpdateCustom()" />
          </div>
          <div class="field-group">
            <span class="field-label">Carbs %</span>
            <input type="number" id="calc-pct-c" min="0" max="100" step="1" value="${customPct.c}" oninput="window.calcUpdateCustom()" />
          </div>
          <div class="field-group">
            <span class="field-label">Fat %</span>
            <input type="number" id="calc-pct-f" min="0" max="100" step="1" value="${customPct.f}" oninput="window.calcUpdateCustom()" />
          </div>
        </div>
        <div id="calc-custom-result">${customResultHTML(customPct.p, customPct.c, customPct.f, mid)}</div>
      </div>
    </div>
  `;
}

window.calcUsePreset = function (id) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return;
  selectedPresetId = id;
  customPct = { p: preset.p, c: preset.c, f: preset.f };
  renderMacrosTab();
};

window.calcUpdateCustom = function () {
  const p = parseFloat(document.getElementById("calc-pct-p").value) || 0;
  const c = parseFloat(document.getElementById("calc-pct-c").value) || 0;
  const f = parseFloat(document.getElementById("calc-pct-f").value) || 0;
  customPct = { p, c, f };
  document.getElementById("calc-custom-result").innerHTML = customResultHTML(p, c, f, macroMid);
};

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
async function init() {
  await db.openDB();
  units = (await prefs.getWeightUnit()) === "kg" ? "metric" : "imperial";
  try {
    const weights = await db.dbGetAll("weights");
    if (weights && weights.length) {
      weights.sort((a, b) => a.date.localeCompare(b.date));
      const latestKg = weights[weights.length - 1].weightKg;
      weightVal = String(round1(units === "metric" ? latestKg : latestKg / KG_PER_LB));
    }
  } catch (e) {}

  renderCalcTabs();
  renderTdeeTab();
  renderMacrosTab();
}

init();
