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
    <nav class="nav-tabs" style="margin-bottom:20px;flex-wrap:wrap;">
      <button class="nav-tab ${activeTab === "tdee" ? "active" : ""}" onclick="window.calcSetTab('tdee')">TDEE</button>
      <button class="nav-tab ${activeTab === "bmr" ? "active" : ""}" onclick="window.calcSetTab('bmr')">BMR</button>
      <button class="nav-tab ${activeTab === "macros" ? "active" : ""}" onclick="window.calcSetTab('macros')">Macros</button>
      <button class="nav-tab ${activeTab === "bodyfat" ? "active" : ""}" onclick="window.calcSetTab('bodyfat')">Body Fat %</button>
      <button class="nav-tab ${activeTab === "bmi" ? "active" : ""}" onclick="window.calcSetTab('bmi')">BMI</button>
      <button class="nav-tab ${activeTab === "ibw" ? "active" : ""}" onclick="window.calcSetTab('ibw')">Ideal Weight</button>
    </nav>
  `;
}

const CALC_TAB_IDS = ["tdee", "bmr", "macros", "bodyfat", "bmi", "ibw"];

window.calcSetTab = function (tab) {
  activeTab = tab;
  renderCalcTabs();
  CALC_TAB_IDS.forEach((id) => {
    const panel = document.getElementById(`calc-${id}`);
    if (panel) panel.style.display = tab === id ? "" : "none";
    const explain = document.getElementById(`calc-${id}-explain`);
    if (explain) explain.style.display = tab === id ? "" : "none";
  });
  if (tab === "macros") renderMacrosTab();
  if (tab === "bmr") renderBmrTab();
  if (tab === "bodyfat") renderBodyFatTab();
  if (tab === "bmi") renderBmiTab();
  if (tab === "ibw") renderIbwTab();
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
      <h2 class="settings-section-title">Total Daily Energy Expenditure (TDEE) Calculator</h2>
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
// BMR TAB — reuses computeBMR() (Mifflin-St Jeor) defined above for TDEE;
// this tab just surfaces BMR on its own without the activity/goal steps.
// ═══════════════════════════════════════════════════════════════════
let bmrUnits = "imperial"; // 'imperial' | 'metric'
let bmrSex = null;
let bmrAgeVal = "";
let bmrHeightVal = "";
let bmrWeightVal = "";
let bmrResult = null; // kcal/day

function renderBmrTab() {
  const el = document.getElementById("calc-bmr");
  const heightUnit = bmrUnits === "metric" ? "cm" : "ft/in";
  const weightUnit = bmrUnits === "metric" ? "kg" : "lb";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Basal Metabolic Rate (BMR) Calculator</h2>
      <div class="settings-section-body">
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:14px;">
          <div class="wt-toggle">
            <button class="wt-toggle-btn ${bmrUnits === "imperial" ? "active" : ""}" onclick="window.calcBmrSetUnits('imperial')">Imperial</button>
            <button class="wt-toggle-btn ${bmrUnits === "metric" ? "active" : ""}" onclick="window.calcBmrSetUnits('metric')">Metric</button>
          </div>
          <div class="field-group" style="margin-top: 6px;">
            <div class="field-label">Gender</div>
            <div class="wt-toggle">
              <button class="wt-toggle-btn ${bmrSex === "female" ? "active" : ""}" onclick="window.calcBmrSetSex('female')">Female</button>
              <button class="wt-toggle-btn ${bmrSex === "male" ? "active" : ""}" onclick="window.calcBmrSetSex('male')">Male</button>
            </div>
          </div>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Age</span>
            <input type="number" id="calc-bmr-age" min="10" max="100" step="1" placeholder="30" value="${bmrAgeVal}" oninput="window.calcBmrSetAge(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Height (${heightUnit})</span>
            ${
              bmrUnits === "metric"
                ? `<input type="number" id="calc-bmr-height" min="0" step="0.1" placeholder="173" value="${bmrHeightVal}" oninput="window.calcBmrSetHeight(this.value)" />`
                : `<select id="calc-bmr-height" onchange="window.calcBmrSetHeight(this.value)">${heightOptionsHTML(bmrHeightVal)}</select>`
            }
          </div>
          <div class="field-group">
            <span class="field-label">Weight (${weightUnit})</span>
            <input type="number" id="calc-bmr-weight" min="0" step="0.1" placeholder="${bmrUnits === "metric" ? "70" : "155"}" value="${bmrWeightVal}" oninput="window.calcBmrSetWeight(this.value)" />
          </div>
        </div>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcRunBmr()">Calculate</button>
      </div>
    </div>
    ${bmrResult !== null ? renderBmrResult() : ""}
  `;
}

function renderBmrResult() {
  return `
    <div class="settings-section">
      <div class="settings-section-title">Your BMR</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:1fr;margin-bottom:0;">
          <div class="total-card">
            <div class="val">${bmrResult.toLocaleString()}</div>
            <div class="lbl">kcal / day</div>
            <div class="sub">calories burned at complete rest</div>
          </div>
        </div>
        <div style="margin-top:16px;">
          <button class="ghost-btn" onclick="window.calcSetTab('tdee')">Use in TDEE →</button>
        </div>
      </div>
    </div>
  `;
}

window.calcBmrSetUnits = function (u) {
  if (u === bmrUnits) return;
  const h = parseFloat(bmrHeightVal);
  const w = parseFloat(bmrWeightVal);
  if (!isNaN(h)) {
    bmrHeightVal =
      u === "metric"
        ? String(round1(h * CM_PER_IN))
        : String(Math.min(HEIGHT_MAX_IN, Math.max(HEIGHT_MIN_IN, Math.round(h / CM_PER_IN))));
  }
  if (!isNaN(w)) bmrWeightVal = String(round1(u === "metric" ? w * KG_PER_LB : w / KG_PER_LB));
  bmrUnits = u;
  renderBmrTab();
};
window.calcBmrSetSex = function (v) {
  bmrSex = v;
  renderBmrTab();
};
window.calcBmrSetAge = function (v) {
  bmrAgeVal = v;
};
window.calcBmrSetHeight = function (v) {
  bmrHeightVal = v;
};
window.calcBmrSetWeight = function (v) {
  bmrWeightVal = v;
};

window.calcRunBmr = function () {
  const age = parseFloat(bmrAgeVal);
  const heightRaw = parseFloat(bmrHeightVal);
  const weightRaw = parseFloat(bmrWeightVal);
  if (!bmrSex) return showAlert("Missing Info", "Select your sex to calculate BMR.");
  if (!age || age <= 0 || !heightRaw || heightRaw <= 0 || !weightRaw || weightRaw <= 0) {
    return showAlert("Missing Info", "Enter your age, height, and weight to calculate.");
  }
  const heightCm = bmrUnits === "metric" ? heightRaw : heightRaw * CM_PER_IN;
  const weightKg = bmrUnits === "metric" ? weightRaw : weightRaw * KG_PER_LB;
  bmrResult = Math.round(computeBMR(bmrSex, weightKg, heightCm, age));
  renderBmrTab();
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
      <h2 class="settings-section-title">Macro Breakdown</h2>
      <div class="settings-section-body">
        <p class="settings-desc">Based on ${source}: ${low.toLocaleString()}–${high.toLocaleString()} kcal/day (avg ${mid.toLocaleString()} kcal).</p>
        <div style="overflow-x:auto;">
        <table class="days-table macro-table" style="margin-top:12px;">
          <thead><tr><th>Plan</th><th>Protein</th><th>Carbs</th><th>Fat</th><th></th></tr></thead>
          <tbody>
            ${PRESETS.map((preset) => {
              const pg = gramsFor(preset.p, mid, 4);
              const cg = gramsFor(preset.c, mid, 4);
              const fg = gramsFor(preset.f, mid, 9);
              const isSelected = selectedPresetId === preset.id;
              return `<tr style="${isSelected ? "background:var(--surface2);" : ""}">
                <td><span class="day-date">${preset.label}</span><br><span style="font-family:'DM Mono',monospace;font-size:12px;color:var(--muted);white-space:normal;">${preset.desc}</span></td>
                <td class="day-p" data-label="Protein">${pg}g <span style="color:var(--muted);">· ${preset.p}%</span></td>
                <td class="day-c" data-label="Carbs">${cg}g <span style="color:var(--muted);">· ${preset.c}%</span></td>
                <td class="day-f" data-label="Fat">${fg}g <span style="color:var(--muted);">· ${preset.f}%</span></td>
                <td><button class="ghost-btn" style="padding:4px 10px;" onclick="window.calcUsePreset('${preset.id}')">${isSelected ? "Selected" : "Use"}</button></td>
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
// BODY FAT % TAB — U.S. Navy circumference method (Hodgdon & Beckett, 1984)
// ═══════════════════════════════════════════════════════════════════
let bfUnits = "imperial"; // 'imperial' (in) | 'metric' (cm)
let bfSex = null;
let bfHeightVal = "";
let bfNeckVal = "";
let bfWaistVal = "";
let bfHipVal = "";
let bfResult = null; // %

function computeBodyFatPercent(sexVal, heightIn, neckIn, waistIn, hipIn) {
  if (sexVal === "male") {
    return 86.01 * Math.log10(waistIn - neckIn) - 70.041 * Math.log10(heightIn) + 36.76;
  }
  return 163.205 * Math.log10(waistIn + hipIn - neckIn) - 97.684 * Math.log10(heightIn) - 78.387;
}

function renderBodyFatTab() {
  const el = document.getElementById("calc-bodyfat");
  const unit = bfUnits === "metric" ? "cm" : "in";
  const heightUnit = bfUnits === "metric" ? "cm" : "ft/in";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Body Fat % Calculator (U.S. Navy Method)</h2>
      <div class="settings-section-body">
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:14px;">
          <div class="wt-toggle">
            <button class="wt-toggle-btn ${bfUnits === "imperial" ? "active" : ""}" onclick="window.calcBfSetUnits('imperial')">Imperial</button>
            <button class="wt-toggle-btn ${bfUnits === "metric" ? "active" : ""}" onclick="window.calcBfSetUnits('metric')">Metric</button>
          </div>
          <div class="field-group" style="margin-top: 6px;">
            <div class="field-label">Gender</div>
            <div class="wt-toggle">
              <button class="wt-toggle-btn ${bfSex === "female" ? "active" : ""}" onclick="window.calcBfSetSex('female')">Female</button>
              <button class="wt-toggle-btn ${bfSex === "male" ? "active" : ""}" onclick="window.calcBfSetSex('male')">Male</button>
            </div>
          </div>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Height (${heightUnit})</span>
            ${
              bfUnits === "metric"
                ? `<input type="number" id="calc-bf-height" min="0" step="0.1" placeholder="173" value="${bfHeightVal}" oninput="window.calcBfSetHeight(this.value)" />`
                : `<select id="calc-bf-height" onchange="window.calcBfSetHeight(this.value)">${heightOptionsHTML(bfHeightVal)}</select>`
            }
          </div>
          <div class="field-group">
            <span class="field-label">Neck (${unit})</span>
            <input type="number" id="calc-bf-neck" min="0" step="0.1" placeholder="${bfUnits === "metric" ? "38" : "15"}" value="${bfNeckVal}" oninput="window.calcBfSetNeck(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Waist (${unit})</span>
            <input type="number" id="calc-bf-waist" min="0" step="0.1" placeholder="${bfUnits === "metric" ? "86" : "34"}" value="${bfWaistVal}" oninput="window.calcBfSetWaist(this.value)" />
          </div>
          ${
            bfSex === "female"
              ? `<div class="field-group">
                  <span class="field-label">Hip (${unit})</span>
                  <input type="number" id="calc-bf-hip" min="0" step="0.1" placeholder="${bfUnits === "metric" ? "99" : "39"}" value="${bfHipVal}" oninput="window.calcBfSetHip(this.value)" />
                </div>`
              : ""
          }
        </div>
        <span class="field-hint" style="display:block;margin-top:10px;">Waist: measured at the navel. Neck: just below the larynx. Hip (women): at the widest point.</span>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcRunBodyFat()">Calculate</button>
      </div>
    </div>
    ${bfResult !== null ? renderBodyFatResult() : ""}
  `;
}

function renderBodyFatResult() {
  return `
    <div class="settings-section">
      <div class="settings-section-title">Estimated Body Fat %</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:1fr;margin-bottom:0;">
          <div class="total-card">
            <div class="val">${bfResult}%</div>
            <div class="lbl">body fat</div>
            <div class="sub">±3–4 percentage points typical error</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.calcBfSetUnits = function (u) {
  if (u === bfUnits) return;
  const toMetric = u === "metric";
  const conv = (val) => {
    const n = parseFloat(val);
    if (isNaN(n)) return val;
    return String(round1(toMetric ? n * CM_PER_IN : n / CM_PER_IN));
  };
  const h = parseFloat(bfHeightVal);
  if (!isNaN(h)) {
    bfHeightVal = toMetric
      ? String(round1(h * CM_PER_IN))
      : String(Math.min(HEIGHT_MAX_IN, Math.max(HEIGHT_MIN_IN, Math.round(h / CM_PER_IN))));
  }
  bfNeckVal = conv(bfNeckVal);
  bfWaistVal = conv(bfWaistVal);
  bfHipVal = conv(bfHipVal);
  bfUnits = u;
  renderBodyFatTab();
};
window.calcBfSetSex = function (v) {
  bfSex = v;
  renderBodyFatTab();
};
window.calcBfSetHeight = function (v) {
  bfHeightVal = v;
};
window.calcBfSetNeck = function (v) {
  bfNeckVal = v;
};
window.calcBfSetWaist = function (v) {
  bfWaistVal = v;
};
window.calcBfSetHip = function (v) {
  bfHipVal = v;
};

window.calcRunBodyFat = function () {
  if (!bfSex) return showAlert("Missing Info", "Select your sex to calculate body fat %.");
  const heightRaw = parseFloat(bfHeightVal);
  const neckRaw = parseFloat(bfNeckVal);
  const waistRaw = parseFloat(bfWaistVal);
  const hipRaw = parseFloat(bfHipVal);
  if (!heightRaw || heightRaw <= 0 || !neckRaw || neckRaw <= 0 || !waistRaw || waistRaw <= 0) {
    return showAlert("Missing Info", "Enter your height, neck, and waist measurements to calculate.");
  }
  if (bfSex === "female" && (!hipRaw || hipRaw <= 0)) {
    return showAlert("Missing Info", "Enter your hip measurement to calculate.");
  }
  const toIn = (v) => (bfUnits === "metric" ? v / CM_PER_IN : v);
  const heightIn = toIn(heightRaw);
  const neckIn = toIn(neckRaw);
  const waistIn = toIn(waistRaw);
  const hipIn = toIn(hipRaw);
  if (bfSex === "male" && waistIn <= neckIn) {
    return showAlert("Check Measurements", "Waist must be larger than neck for this formula to work.");
  }
  if (bfSex === "female" && waistIn + hipIn <= neckIn) {
    return showAlert("Check Measurements", "Waist + hip must be larger than neck for this formula to work.");
  }
  bfResult = round1(computeBodyFatPercent(bfSex, heightIn, neckIn, waistIn, hipIn));
  renderBodyFatTab();
};

// ═══════════════════════════════════════════════════════════════════
// BMI TAB
// ═══════════════════════════════════════════════════════════════════
let bmiUnits = "imperial";
let bmiHeightVal = "";
let bmiWeightVal = "";
let bmiResult = null;

function computeBmi(weightKg, heightCm) {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

function bmiCategory(bmi) {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Healthy Weight";
  if (bmi < 30) return "Overweight";
  return "Obesity";
}

function renderBmiTab() {
  const el = document.getElementById("calc-bmi");
  const heightUnit = bmiUnits === "metric" ? "cm" : "ft/in";
  const weightUnit = bmiUnits === "metric" ? "kg" : "lb";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">BMI Calculator</h2>
      <div class="settings-section-body">
        <div class="wt-toggle" style="margin-bottom:14px;">
          <button class="wt-toggle-btn ${bmiUnits === "imperial" ? "active" : ""}" onclick="window.calcBmiSetUnits('imperial')">Imperial</button>
          <button class="wt-toggle-btn ${bmiUnits === "metric" ? "active" : ""}" onclick="window.calcBmiSetUnits('metric')">Metric</button>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Height (${heightUnit})</span>
            ${
              bmiUnits === "metric"
                ? `<input type="number" id="calc-bmi-height" min="0" step="0.1" placeholder="173" value="${bmiHeightVal}" oninput="window.calcBmiSetHeight(this.value)" />`
                : `<select id="calc-bmi-height" onchange="window.calcBmiSetHeight(this.value)">${heightOptionsHTML(bmiHeightVal)}</select>`
            }
          </div>
          <div class="field-group">
            <span class="field-label">Weight (${weightUnit})</span>
            <input type="number" id="calc-bmi-weight" min="0" step="0.1" placeholder="${bmiUnits === "metric" ? "70" : "155"}" value="${bmiWeightVal}" oninput="window.calcBmiSetWeight(this.value)" />
          </div>
        </div>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcRunBmi()">Calculate</button>
      </div>
    </div>
    ${bmiResult !== null ? renderBmiResult() : ""}
  `;
}

function renderBmiResult() {
  return `
    <div class="settings-section">
      <div class="settings-section-title">Your BMI</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:1fr;margin-bottom:0;">
          <div class="total-card">
            <div class="val">${bmiResult.toFixed(1)}</div>
            <div class="lbl">${bmiCategory(bmiResult)}</div>
            <div class="sub">CDC adult BMI categories</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.calcBmiSetUnits = function (u) {
  if (u === bmiUnits) return;
  const h = parseFloat(bmiHeightVal);
  const w = parseFloat(bmiWeightVal);
  if (!isNaN(h)) {
    bmiHeightVal =
      u === "metric"
        ? String(round1(h * CM_PER_IN))
        : String(Math.min(HEIGHT_MAX_IN, Math.max(HEIGHT_MIN_IN, Math.round(h / CM_PER_IN))));
  }
  if (!isNaN(w)) bmiWeightVal = String(round1(u === "metric" ? w * KG_PER_LB : w / KG_PER_LB));
  bmiUnits = u;
  renderBmiTab();
};
window.calcBmiSetHeight = function (v) {
  bmiHeightVal = v;
};
window.calcBmiSetWeight = function (v) {
  bmiWeightVal = v;
};

window.calcRunBmi = function () {
  const heightRaw = parseFloat(bmiHeightVal);
  const weightRaw = parseFloat(bmiWeightVal);
  if (!heightRaw || heightRaw <= 0 || !weightRaw || weightRaw <= 0) {
    return showAlert("Missing Info", "Enter your height and weight to calculate.");
  }
  const heightCm = bmiUnits === "metric" ? heightRaw : heightRaw * CM_PER_IN;
  const weightKg = bmiUnits === "metric" ? weightRaw : weightRaw * KG_PER_LB;
  bmiResult = round1(computeBmi(weightKg, heightCm));
  renderBmiTab();
};

// ═══════════════════════════════════════════════════════════════════
// IDEAL BODY WEIGHT TAB — Devine formula (McCarron & Devine, 1974)
// ═══════════════════════════════════════════════════════════════════
let ibwUnits = "imperial";
let ibwSex = null;
let ibwHeightVal = "";
let ibwResult = null; // kg

function computeIBW(sexVal, heightIn) {
  const base = sexVal === "male" ? 50 : 45.5;
  const overInches = Math.max(0, heightIn - 60);
  return base + 2.3 * overInches;
}

function renderIbwTab() {
  const el = document.getElementById("calc-ibw");
  const heightUnit = ibwUnits === "metric" ? "cm" : "ft/in";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Ideal Body Weight Calculator</h2>
      <div class="settings-section-body">
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:14px;">
          <div class="wt-toggle">
            <button class="wt-toggle-btn ${ibwUnits === "imperial" ? "active" : ""}" onclick="window.calcIbwSetUnits('imperial')">Imperial</button>
            <button class="wt-toggle-btn ${ibwUnits === "metric" ? "active" : ""}" onclick="window.calcIbwSetUnits('metric')">Metric</button>
          </div>
          <div class="field-group" style="margin-top: 6px;">
            <div class="field-label">Gender</div>
            <div class="wt-toggle">
              <button class="wt-toggle-btn ${ibwSex === "female" ? "active" : ""}" onclick="window.calcIbwSetSex('female')">Female</button>
              <button class="wt-toggle-btn ${ibwSex === "male" ? "active" : ""}" onclick="window.calcIbwSetSex('male')">Male</button>
            </div>
          </div>
        </div>
        <div class="field-group">
          <span class="field-label">Height (${heightUnit})</span>
          ${
            ibwUnits === "metric"
              ? `<input type="number" id="calc-ibw-height" min="0" step="0.1" placeholder="173" value="${ibwHeightVal}" oninput="window.calcIbwSetHeight(this.value)" />`
              : `<select id="calc-ibw-height" onchange="window.calcIbwSetHeight(this.value)">${heightOptionsHTML(ibwHeightVal)}</select>`
          }
        </div>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcRunIbw()">Calculate</button>
      </div>
    </div>
    ${ibwResult !== null ? renderIbwResult() : ""}
  `;
}

function renderIbwResult() {
  const lb = ibwResult / KG_PER_LB;
  return `
    <div class="settings-section">
      <div class="settings-section-title">Reference Ideal Body Weight</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:0;">
          <div class="total-card">
            <div class="val">${round1(ibwResult)} kg</div>
            <div class="lbl">Devine formula</div>
          </div>
          <div class="total-card">
            <div class="val">${round1(lb)} lb</div>
            <div class="lbl">Devine formula</div>
          </div>
        </div>
        <div style="color:var(--muted);font-family:'DM Mono',monospace;font-size:11px;margin-top:10px;">
          A population-average reference, not a personalized target — actual healthy weight varies with frame size, muscle mass, and other factors.
        </div>
      </div>
    </div>
  `;
}

window.calcIbwSetUnits = function (u) {
  if (u === ibwUnits) return;
  const h = parseFloat(ibwHeightVal);
  if (!isNaN(h)) {
    ibwHeightVal =
      u === "metric"
        ? String(round1(h * CM_PER_IN))
        : String(Math.min(HEIGHT_MAX_IN, Math.max(HEIGHT_MIN_IN, Math.round(h / CM_PER_IN))));
  }
  ibwUnits = u;
  renderIbwTab();
};
window.calcIbwSetSex = function (v) {
  ibwSex = v;
  renderIbwTab();
};
window.calcIbwSetHeight = function (v) {
  ibwHeightVal = v;
};

window.calcRunIbw = function () {
  if (!ibwSex) return showAlert("Missing Info", "Select your sex to calculate ideal body weight.");
  const heightRaw = parseFloat(ibwHeightVal);
  if (!heightRaw || heightRaw <= 0) {
    return showAlert("Missing Info", "Enter your height to calculate.");
  }
  const heightIn = ibwUnits === "metric" ? heightRaw / CM_PER_IN : heightRaw;
  ibwResult = computeIBW(ibwSex, heightIn);
  renderIbwTab();
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
  renderBmrTab();
  renderMacrosTab();
  renderBodyFatTab();
  renderBmiTab();
  renderIbwTab();
}

init();
