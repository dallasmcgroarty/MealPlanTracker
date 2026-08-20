import * as db from "../../../../lib/db.js";
import * as prefs from "../../../../lib/prefs.js";
import { showAlert } from "../../../../lib/ui.js";
import "../../../../lib/nav.js";
import "../../../../lib/settingsHint.js";
import { KG_PER_LB, M_PER_MI, round1 } from "../../../../lib/calculators/calc-shared.js";

let units = "imperial"; // 'imperial' (mi, lb) | 'metric' (km, kg)
let distanceVal = "";
let timeVal = ""; // minutes
let weightVal = "";
let result = null; // { kcal, speedMph, inRange }

function renderTab() {
  const el = document.getElementById("calc-walking");
  const distanceUnit = units === "metric" ? "km" : "mi";
  const weightUnit = units === "metric" ? "kg" : "lb";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Walking Calorie Calculator</h2>
      <div class="settings-section-body">
        <div class="wt-toggle" style="margin-bottom:14px;">
          <button class="wt-toggle-btn ${units === "imperial" ? "active" : ""}" onclick="window.calcWalkSetUnits('imperial')">Imperial</button>
          <button class="wt-toggle-btn ${units === "metric" ? "active" : ""}" onclick="window.calcWalkSetUnits('metric')">Metric</button>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Distance (${distanceUnit})</span>
            <input type="number" id="calc-walk-distance" min="0" step="0.01" placeholder="${units === "metric" ? "3.2" : "2"}" value="${distanceVal}" oninput="window.calcWalkSetDistance(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Time (minutes)</span>
            <input type="number" id="calc-walk-time" min="0" step="1" placeholder="30" value="${timeVal}" oninput="window.calcWalkSetTime(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Weight (${weightUnit})</span>
            <input type="number" id="calc-walk-weight" min="0" step="0.1" placeholder="${units === "metric" ? "70" : "155"}" value="${weightVal}" oninput="window.calcWalkSetWeight(this.value)" />
          </div>
        </div>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcWalkRun()">Calculate</button>
      </div>
    </div>
    ${result ? renderResult() : ""}
  `;
}

function renderResult() {
  const warn = !result.inRange
    ? `<div style="color:var(--warn);font-family:'DM Mono',monospace;font-size:11px;margin-top:10px;">
        Your pace (${round1(result.speedMph)} mph) falls outside the ~1.9–3.7 mph range this formula is validated
        for — treat this estimate with extra caution, or try our <a href="../calories-burned/">Calories Burned Calculator</a> instead.
      </div>`
    : "";
  return `
    <div class="settings-section">
      <div class="settings-section-title">Estimated Calories Burned</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:1fr;margin-bottom:0;">
          <div class="total-card">
            <div class="val">${prefs.formatEnergy(result.kcal)}</div>
            <div class="lbl">walking</div>
            <div class="sub">at ${round1(result.speedMph)} mph</div>
          </div>
        </div>
        ${warn}
      </div>
    </div>
  `;
}

window.calcWalkSetUnits = function (u) {
  if (u === units) return;
  const d = parseFloat(distanceVal);
  const w = parseFloat(weightVal);
  if (!isNaN(d)) {
    // mi <-> km via meters-per-mile / 1000 meters-per-km
    distanceVal = String(round1(u === "metric" ? d * (M_PER_MI / 1000) : d / (M_PER_MI / 1000)));
  }
  if (!isNaN(w)) weightVal = String(round1(u === "metric" ? w * KG_PER_LB : w / KG_PER_LB));
  units = u;
  renderTab();
};
window.calcWalkSetDistance = function (v) {
  distanceVal = v;
};
window.calcWalkSetTime = function (v) {
  timeVal = v;
};
window.calcWalkSetWeight = function (v) {
  weightVal = v;
};

window.calcWalkRun = function () {
  const distanceRaw = parseFloat(distanceVal);
  const minutes = parseFloat(timeVal);
  const weightRaw = parseFloat(weightVal);
  if (!distanceRaw || distanceRaw <= 0 || !minutes || minutes <= 0 || !weightRaw || weightRaw <= 0) {
    return showAlert("Missing Info", "Enter your distance, time, and weight to calculate.");
  }
  const meters = units === "metric" ? distanceRaw * 1000 : distanceRaw * M_PER_MI;
  const weightKg = units === "metric" ? weightRaw : weightRaw * KG_PER_LB;
  const speedMPerMin = meters / minutes;
  const vo2MlKgMin = 0.1 * speedMPerMin + 3.5;
  const vo2LMin = (vo2MlKgMin * weightKg) / 1000;
  const kcalPerMin = vo2LMin * 5;
  const kcal = Math.round(kcalPerMin * minutes);
  const speedMph = (speedMPerMin * 60) / M_PER_MI;
  const inRange = speedMPerMin >= 50 && speedMPerMin <= 100;
  result = { kcal, speedMph, inRange };
  renderTab();
};

async function init() {
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

  renderTab();
}

init();
