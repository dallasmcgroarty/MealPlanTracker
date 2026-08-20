import { showAlert } from "../../../../lib/ui.js";
import "../../../../lib/nav.js";
import "../../../../lib/settingsHint.js";
import { KG_PER_LB, round1, mlToFlOz } from "../../../../lib/calculators/calc-shared.js";

let units = "imperial";
let weightVal = "";
let exerciseVal = "";
let climate = "normal";
let waterResult = null;

// ~30–35 mL/kg/day is a common clinical rule of thumb for baseline fluid
// needs — not from IOM/EFSA, which set total-water Adequate Intakes instead
// (see the page's citations). We use the midpoint of that range.
const ML_PER_KG_BASE = 33;

// ACSM's fluid-replacement guidance during exercise is 600–1200 mL/hour;
// we use a conservative 700 mL/hour midpoint-low estimate spread per minute.
const ML_PER_MIN_EXERCISE = 700 / 60;

// Practical, conservative addition for hot climates — the IOM/NAM itself
// notes that people in hot climates or who are very physically active may
// need more than the baseline Adequate Intake figures. This is a rule-of-
// thumb addition, not a value taken directly from a specific study.
const ML_HOT_CLIMATE_ADD = 500;

function computeWaterMl(weightKg, exerciseMinutes, climateVal) {
  let total = weightKg * ML_PER_KG_BASE;
  total += exerciseMinutes * ML_PER_MIN_EXERCISE;
  if (climateVal === "hot") total += ML_HOT_CLIMATE_ADD;
  return total;
}

function renderWaterTab() {
  const el = document.getElementById("calc-water");
  const weightUnit = units === "metric" ? "kg" : "lb";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Water Intake Calculator</h2>
      <div class="settings-section-body">
        <div class="wt-toggle" style="margin-bottom:14px;">
          <button class="wt-toggle-btn ${units === "imperial" ? "active" : ""}" onclick="window.calcWaterSetUnits('imperial')">Imperial</button>
          <button class="wt-toggle-btn ${units === "metric" ? "active" : ""}" onclick="window.calcWaterSetUnits('metric')">Metric</button>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Body Weight (${weightUnit})</span>
            <input type="number" id="calc-water-weight" min="0" step="0.1" placeholder="${units === "metric" ? "70" : "155"}" value="${weightVal}" oninput="window.calcWaterSetWeight(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Exercise (min/day, optional)</span>
            <input type="number" id="calc-water-exercise" min="0" step="1" placeholder="0" value="${exerciseVal}" oninput="window.calcWaterSetExercise(this.value)" />
          </div>
        </div>
        <div class="field-group" style="margin-top:14px;">
          <span class="field-label">Climate</span>
          <div class="wt-toggle" style="width: fit-content; width: -webkit-fit-content;  width: -moz-fit-content;">
            <button class="wt-toggle-btn ${climate === "normal" ? "active" : ""}" onclick="window.calcWaterSetClimate('normal')">Normal</button>
            <button class="wt-toggle-btn ${climate === "hot" ? "active" : ""}" onclick="window.calcWaterSetClimate('hot')">Hot / Humid</button>
          </div>
        </div>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcRunWater()">Calculate</button>
      </div>
    </div>
    ${waterResult !== null ? renderWaterResult() : ""}
  `;
}

function renderWaterResult() {
  const liters = round1(waterResult / 1000);
  const flOz = Math.round(mlToFlOz(waterResult));
  const cups = round1(flOz / 8);
  return `
    <div class="settings-section">
      <div class="settings-section-title">Your Estimated Daily Water Intake</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:1fr 1fr;margin-bottom:0;">
          <div class="total-card">
            <div class="val">${liters}L</div>
            <div class="lbl">Liters / day</div>
            <div class="sub">Total water, all sources</div>
          </div>
          <div class="total-card">
            <div class="val">${flOz}</div>
            <div class="lbl">fl oz / day</div>
            <div class="sub">≈ ${cups} cups</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.calcWaterSetUnits = function (u) {
  if (u === units) return;
  const w = parseFloat(weightVal);
  if (!isNaN(w)) weightVal = String(round1(u === "metric" ? w * KG_PER_LB : w / KG_PER_LB));
  units = u;
  renderWaterTab();
};
window.calcWaterSetWeight = function (v) {
  weightVal = v;
};
window.calcWaterSetExercise = function (v) {
  exerciseVal = v;
};
window.calcWaterSetClimate = function (c) {
  climate = c;
  renderWaterTab();
};

window.calcRunWater = function () {
  const weightRaw = parseFloat(weightVal);
  if (!weightRaw || weightRaw <= 0) {
    return showAlert("Missing Info", "Enter your body weight to calculate.");
  }
  const exerciseMinutes = parseFloat(exerciseVal) || 0;
  if (exerciseMinutes < 0) {
    return showAlert("Invalid Input", "Exercise minutes can't be negative.");
  }
  const weightKg = units === "metric" ? weightRaw : weightRaw * KG_PER_LB;
  waterResult = computeWaterMl(weightKg, exerciseMinutes, climate);
  renderWaterTab();
};

renderWaterTab();
