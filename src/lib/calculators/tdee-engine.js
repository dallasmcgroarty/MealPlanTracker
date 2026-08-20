// Shared TDEE/Calorie calculation + render engine — used by both
// /calculators/tdee/ and /calculators/calorie/, which are two differently
// framed front doors to the exact same Mifflin-St Jeor calculation. The only
// thing that varies per page is the section heading passed to
// initTdeeCalculator(); everything else (state, math, DOM handlers) is
// shared so the two pages can never drift out of sync on how they calculate.
import * as db from "../db.js";
import * as prefs from "../prefs.js";
import { showAlert, showConfirm } from "../ui.js";
import "../nav.js";
import "../settingsHint.js";
import { KG_PER_LB, CM_PER_IN, HEIGHT_MIN_IN, HEIGHT_MAX_IN, round1, round50, heightOptionsHTML, computeBMR, formatEnergyRange, sendToMacros } from "./calc-shared.js";

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

let sectionTitle = "Total Daily Energy Expenditure (TDEE) Calculator";

let units = "imperial"; // 'imperial' | 'metric'
let sex = null; // 'male' | 'female'
let ageVal = "";
let heightVal = "";
let weightVal = "";
let activity = "moderate";
let goal = "maintain";
let tdeeResult = null; // { bmr, tdee, low, high, goalLabel }

function renderTdeeTab() {
  const el = document.getElementById("calc-tdee");
  const heightUnit = units === "metric" ? "cm" : "ft/in";
  const weightUnit = units === "metric" ? "kg" : "lb";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">${sectionTitle}</h2>
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
          <span class="field-hint" style="display:block;margin-top:6px;">Lose: ~${prefs.formatEnergy(500)}/day deficit (≈1 lb/wk) · Gain: ~${prefs.formatEnergy(350)}/day surplus (≈0.5–0.7 lb/wk)</span>
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
            <div class="val">${prefs.formatEnergy(tdeeResult.bmr)}</div>
            <div class="lbl">BMR</div>
            <div class="sub">at rest</div>
          </div>
          <div class="total-card">
            <div class="val">${prefs.formatEnergy(tdeeResult.tdee)}</div>
            <div class="lbl">TDEE</div>
            <div class="sub">to maintain</div>
          </div>
          <div class="total-card tc-cal">
            <div class="val">${formatEnergyRange(tdeeResult.low, tdeeResult.high)}</div>
            <div class="lbl">Target Range</div>
            <div class="sub">${tdeeResult.goalLabel}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
          <button class="add-btn" onclick="window.calcApplyToSettings()">Apply to Settings</button>
          <a class="ghost-btn" href="../macros/" onclick="window.calcSendToMacros()">Use in Macros →</a>
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
  if (!(await showConfirm(`Set calorie range to ${formatEnergyRange(tdeeResult.low, tdeeResult.high)}?`, "Save"))) return;
  await prefs.setCalRange(tdeeResult.low, tdeeResult.high);
};

window.calcSendToMacros = function () {
  if (!tdeeResult) return;
  sendToMacros(tdeeResult.low, tdeeResult.high, "your calculated TDEE range");
};

export async function initTdeeCalculator(options = {}) {
  if (options.sectionTitle) sectionTitle = options.sectionTitle;

  await db.openDB();
  await prefs.getEnergyUnit();
  units = (await prefs.getWeightUnit()) === "kg" ? "metric" : "imperial";
  try {
    const weights = await db.dbGetAll("weights");
    if (weights && weights.length) {
      weights.sort((a, b) => a.date.localeCompare(b.date));
      const latestKg = weights[weights.length - 1].weightKg;
      weightVal = String(round1(units === "metric" ? latestKg : latestKg / KG_PER_LB));
    }
  } catch (e) {}

  renderTdeeTab();
}
