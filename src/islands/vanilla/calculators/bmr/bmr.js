import * as db from "../../../../lib/db.js";
import * as prefs from "../../../../lib/prefs.js";
import { showAlert } from "../../../../lib/ui.js";
import "../../../../lib/nav.js";
import "../../../../lib/settingsHint.js";
import { KG_PER_LB, CM_PER_IN, HEIGHT_MIN_IN, HEIGHT_MAX_IN, round1, heightOptionsHTML, computeBMR, sendToMacros } from "../../../../lib/calculators/calc-shared.js";

let units = "imperial"; // 'imperial' | 'metric'
let sex = null;
let ageVal = "";
let heightVal = "";
let weightVal = "";
let bmrResult = null; // kcal/day

function renderBmrTab() {
  const el = document.getElementById("calc-bmr");
  const heightUnit = units === "metric" ? "cm" : "ft/in";
  const weightUnit = units === "metric" ? "kg" : "lb";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Basal Metabolic Rate (BMR) Calculator</h2>
      <div class="settings-section-body">
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:14px;">
          <div class="wt-toggle">
            <button class="wt-toggle-btn ${units === "imperial" ? "active" : ""}" onclick="window.calcBmrSetUnits('imperial')">Imperial</button>
            <button class="wt-toggle-btn ${units === "metric" ? "active" : ""}" onclick="window.calcBmrSetUnits('metric')">Metric</button>
          </div>
          <div class="field-group" style="margin-top: 6px;">
            <div class="field-label">Gender</div>
            <div class="wt-toggle">
              <button class="wt-toggle-btn ${sex === "female" ? "active" : ""}" onclick="window.calcBmrSetSex('female')">Female</button>
              <button class="wt-toggle-btn ${sex === "male" ? "active" : ""}" onclick="window.calcBmrSetSex('male')">Male</button>
            </div>
          </div>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Age</span>
            <input type="number" id="calc-bmr-age" min="10" max="100" step="1" placeholder="30" value="${ageVal}" oninput="window.calcBmrSetAge(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Height (${heightUnit})</span>
            ${
              units === "metric"
                ? `<input type="number" id="calc-bmr-height" min="0" step="0.1" placeholder="173" value="${heightVal}" oninput="window.calcBmrSetHeight(this.value)" />`
                : `<select id="calc-bmr-height" onchange="window.calcBmrSetHeight(this.value)">${heightOptionsHTML(heightVal)}</select>`
            }
          </div>
          <div class="field-group">
            <span class="field-label">Weight (${weightUnit})</span>
            <input type="number" id="calc-bmr-weight" min="0" step="0.1" placeholder="${units === "metric" ? "70" : "155"}" value="${weightVal}" oninput="window.calcBmrSetWeight(this.value)" />
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
            <div class="val">${prefs.formatEnergy(bmrResult)}</div>
            <div class="lbl">per day</div>
            <div class="sub">calories burned at complete rest</div>
          </div>
        </div>
        <div style="margin-top:16px;">
          <a class="ghost-btn" href="../macros/" onclick="window.calcBmrSendToMacros()">Use in Macros →</a>
        </div>
      </div>
    </div>
  `;
}

window.calcBmrSetUnits = function (u) {
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
  renderBmrTab();
};
window.calcBmrSetSex = function (v) {
  sex = v;
  renderBmrTab();
};
window.calcBmrSetAge = function (v) {
  ageVal = v;
};
window.calcBmrSetHeight = function (v) {
  heightVal = v;
};
window.calcBmrSetWeight = function (v) {
  weightVal = v;
};

window.calcRunBmr = function () {
  const age = parseFloat(ageVal);
  const heightRaw = parseFloat(heightVal);
  const weightRaw = parseFloat(weightVal);
  if (!sex) return showAlert("Missing Info", "Select your sex to calculate BMR.");
  if (!age || age <= 0 || !heightRaw || heightRaw <= 0 || !weightRaw || weightRaw <= 0) {
    return showAlert("Missing Info", "Enter your age, height, and weight to calculate.");
  }
  const heightCm = units === "metric" ? heightRaw : heightRaw * CM_PER_IN;
  const weightKg = units === "metric" ? weightRaw : weightRaw * KG_PER_LB;
  bmrResult = Math.round(computeBMR(sex, weightKg, heightCm, age));
  renderBmrTab();
};

window.calcBmrSendToMacros = function () {
  if (bmrResult === null) return;
  sendToMacros(bmrResult, bmrResult, "your calculated BMR");
};

async function init() {
  await db.openDB();
  await prefs.getEnergyUnit();
  renderBmrTab();
}

init();
