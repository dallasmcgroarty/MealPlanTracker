import { showAlert } from "../../../../lib/ui.js";
import "../../../../lib/nav.js";
import "../../../../lib/settingsHint.js";
import { KG_PER_LB, CM_PER_IN, HEIGHT_MIN_IN, HEIGHT_MAX_IN, round1, heightOptionsHTML } from "../../../../lib/calculators/calc-shared.js";

let units = "imperial";
let heightVal = "";
let weightVal = "";
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
  const heightUnit = units === "metric" ? "cm" : "ft/in";
  const weightUnit = units === "metric" ? "kg" : "lb";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">BMI Calculator</h2>
      <div class="settings-section-body">
        <div class="wt-toggle" style="margin-bottom:14px;">
          <button class="wt-toggle-btn ${units === "imperial" ? "active" : ""}" onclick="window.calcBmiSetUnits('imperial')">Imperial</button>
          <button class="wt-toggle-btn ${units === "metric" ? "active" : ""}" onclick="window.calcBmiSetUnits('metric')">Metric</button>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Height (${heightUnit})</span>
            ${
              units === "metric"
                ? `<input type="number" id="calc-bmi-height" min="0" step="0.1" placeholder="173" value="${heightVal}" oninput="window.calcBmiSetHeight(this.value)" />`
                : `<select id="calc-bmi-height" onchange="window.calcBmiSetHeight(this.value)">${heightOptionsHTML(heightVal)}</select>`
            }
          </div>
          <div class="field-group">
            <span class="field-label">Weight (${weightUnit})</span>
            <input type="number" id="calc-bmi-weight" min="0" step="0.1" placeholder="${units === "metric" ? "70" : "155"}" value="${weightVal}" oninput="window.calcBmiSetWeight(this.value)" />
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
  renderBmiTab();
};
window.calcBmiSetHeight = function (v) {
  heightVal = v;
};
window.calcBmiSetWeight = function (v) {
  weightVal = v;
};

window.calcRunBmi = function () {
  const heightRaw = parseFloat(heightVal);
  const weightRaw = parseFloat(weightVal);
  if (!heightRaw || heightRaw <= 0 || !weightRaw || weightRaw <= 0) {
    return showAlert("Missing Info", "Enter your height and weight to calculate.");
  }
  const heightCm = units === "metric" ? heightRaw : heightRaw * CM_PER_IN;
  const weightKg = units === "metric" ? weightRaw : weightRaw * KG_PER_LB;
  bmiResult = round1(computeBmi(weightKg, heightCm));
  renderBmiTab();
};

renderBmiTab();
