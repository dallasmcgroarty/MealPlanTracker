import * as db from "../../../../lib/db.js";
import * as prefs from "../../../../lib/prefs.js";
import { showAlert } from "../../../../lib/ui.js";
import "../../../../lib/nav.js";
import "../../../../lib/settingsHint.js";
import { KG_PER_LB, round1 } from "../../../../lib/calculators/calc-shared.js";

// MET values sourced from the 2011 Compendium of Physical Activities
// (Ainsworth et al.) — see the page's citation block for exact codes/wording.
const ACTIVITIES = [
  { id: "walking", label: "Walking (moderate pace)", met: 3.5 },
  { id: "running6", label: "Running, 6 mph", met: 9.8 },
  { id: "running8", label: "Running, 8 mph", met: 11.8 },
  { id: "cycling", label: "Cycling, general", met: 7.5 },
  { id: "swimming", label: "Swimming, moderate laps", met: 5.8 },
  { id: "weightlifting", label: "Weightlifting, general", met: 3.5 },
  { id: "yoga", label: "Yoga (Hatha)", met: 2.5 },
  { id: "hiit", label: "HIIT / Circuit Training", met: 8.0 },
];

let units = "imperial"; // 'imperial' | 'metric'
let activityId = "walking";
let weightVal = "";
let durationVal = "";
let result = null; // { kcal, met, activityLabel, minutes }

function renderTab() {
  const el = document.getElementById("calc-calories-burned");
  const weightUnit = units === "metric" ? "kg" : "lb";
  const activity = ACTIVITIES.find((a) => a.id === activityId);

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Calories Burned Calculator</h2>
      <div class="settings-section-body">
        <div class="wt-toggle" style="margin-bottom:14px;">
          <button class="wt-toggle-btn ${units === "imperial" ? "active" : ""}" onclick="window.calcCbSetUnits('imperial')">Imperial</button>
          <button class="wt-toggle-btn ${units === "metric" ? "active" : ""}" onclick="window.calcCbSetUnits('metric')">Metric</button>
        </div>
        <div class="field-group" style="margin-bottom:14px;">
          <span class="field-label">Activity</span>
          <select id="calc-cb-activity" onchange="window.calcCbSetActivity(this.value)">
            ${ACTIVITIES.map((a) => `<option value="${a.id}" ${activityId === a.id ? "selected" : ""}>${a.label}</option>`).join("")}
          </select>
          <span class="field-hint" style="display:block;margin-top:6px;">
            ${
              activityId === "walking"
                ? `Walking here uses a general MET estimate (${activity.met} METs). For a more precise walking-specific number, try our <a href="../walking-calories/">Walking Calorie Calculator</a>.`
                : `${activity.met} METs · MET values are population averages — actual burn varies with fitness level and effort.`
            }
          </span>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Weight (${weightUnit})</span>
            <input type="number" id="calc-cb-weight" min="0" step="0.1" placeholder="${units === "metric" ? "70" : "155"}" value="${weightVal}" oninput="window.calcCbSetWeight(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Duration (minutes)</span>
            <input type="number" id="calc-cb-duration" min="0" step="1" placeholder="30" value="${durationVal}" oninput="window.calcCbSetDuration(this.value)" />
          </div>
        </div>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcCbRun()">Calculate</button>
      </div>
    </div>
    ${result ? renderResult() : ""}
  `;
}

function renderResult() {
  return `
    <div class="settings-section">
      <div class="settings-section-title">Estimated Calories Burned</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:1fr;margin-bottom:0;">
          <div class="total-card">
            <div class="val">${prefs.formatEnergy(result.kcal)}</div>
            <div class="lbl">${result.activityLabel}</div>
            <div class="sub">${result.met} METs · ${result.minutes} min</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.calcCbSetUnits = function (u) {
  if (u === units) return;
  const w = parseFloat(weightVal);
  if (!isNaN(w)) weightVal = String(round1(u === "metric" ? w * KG_PER_LB : w / KG_PER_LB));
  units = u;
  renderTab();
};
window.calcCbSetActivity = function (id) {
  activityId = id;
  renderTab();
};
window.calcCbSetWeight = function (v) {
  weightVal = v;
};
window.calcCbSetDuration = function (v) {
  durationVal = v;
};

window.calcCbRun = function () {
  const weightRaw = parseFloat(weightVal);
  const minutes = parseFloat(durationVal);
  if (!weightRaw || weightRaw <= 0 || !minutes || minutes <= 0) {
    return showAlert("Missing Info", "Enter your weight and workout duration to calculate.");
  }
  const weightKg = units === "metric" ? weightRaw : weightRaw * KG_PER_LB;
  const activity = ACTIVITIES.find((a) => a.id === activityId);
  const hours = minutes / 60;
  const kcal = Math.round(activity.met * weightKg * hours);
  result = { kcal, met: activity.met, activityLabel: activity.label, minutes };
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
