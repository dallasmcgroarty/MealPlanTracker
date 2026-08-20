import { showAlert } from "../../../../lib/ui.js";
import "../../../../lib/nav.js";
import "../../../../lib/settingsHint.js";
import { CM_PER_IN, HEIGHT_MIN_IN, HEIGHT_MAX_IN, round1, heightOptionsHTML } from "../../../../lib/calculators/calc-shared.js";

let units = "imperial"; // 'imperial' (in) | 'metric' (cm)
let sex = null;
let heightVal = "";
let neckVal = "";
let waistVal = "";
let hipVal = "";
let bfResult = null; // %

function computeBodyFatPercent(sexVal, heightIn, neckIn, waistIn, hipIn) {
  if (sexVal === "male") {
    return 86.01 * Math.log10(waistIn - neckIn) - 70.041 * Math.log10(heightIn) + 36.76;
  }
  return 163.205 * Math.log10(waistIn + hipIn - neckIn) - 97.684 * Math.log10(heightIn) - 78.387;
}

function renderBodyFatTab() {
  const el = document.getElementById("calc-bodyfat");
  const unit = units === "metric" ? "cm" : "in";
  const heightUnit = units === "metric" ? "cm" : "ft/in";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Body Fat % Calculator (U.S. Navy Method)</h2>
      <div class="settings-section-body">
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:14px;">
          <div class="wt-toggle">
            <button class="wt-toggle-btn ${units === "imperial" ? "active" : ""}" onclick="window.calcBfSetUnits('imperial')">Imperial</button>
            <button class="wt-toggle-btn ${units === "metric" ? "active" : ""}" onclick="window.calcBfSetUnits('metric')">Metric</button>
          </div>
          <div class="field-group" style="margin-top: 6px;">
            <div class="field-label">Gender</div>
            <div class="wt-toggle">
              <button class="wt-toggle-btn ${sex === "female" ? "active" : ""}" onclick="window.calcBfSetSex('female')">Female</button>
              <button class="wt-toggle-btn ${sex === "male" ? "active" : ""}" onclick="window.calcBfSetSex('male')">Male</button>
            </div>
          </div>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Height (${heightUnit})</span>
            ${
              units === "metric"
                ? `<input type="number" id="calc-bf-height" min="0" step="0.1" placeholder="173" value="${heightVal}" oninput="window.calcBfSetHeight(this.value)" />`
                : `<select id="calc-bf-height" onchange="window.calcBfSetHeight(this.value)">${heightOptionsHTML(heightVal)}</select>`
            }
          </div>
          <div class="field-group">
            <span class="field-label">Neck (${unit})</span>
            <input type="number" id="calc-bf-neck" min="0" step="0.1" placeholder="${units === "metric" ? "38" : "15"}" value="${neckVal}" oninput="window.calcBfSetNeck(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Waist (${unit})</span>
            <input type="number" id="calc-bf-waist" min="0" step="0.1" placeholder="${units === "metric" ? "86" : "34"}" value="${waistVal}" oninput="window.calcBfSetWaist(this.value)" />
          </div>
          ${
            sex === "female"
              ? `<div class="field-group">
                  <span class="field-label">Hip (${unit})</span>
                  <input type="number" id="calc-bf-hip" min="0" step="0.1" placeholder="${units === "metric" ? "99" : "39"}" value="${hipVal}" oninput="window.calcBfSetHip(this.value)" />
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
  if (u === units) return;
  const toMetric = u === "metric";
  const conv = (val) => {
    const n = parseFloat(val);
    if (isNaN(n)) return val;
    return String(round1(toMetric ? n * CM_PER_IN : n / CM_PER_IN));
  };
  const h = parseFloat(heightVal);
  if (!isNaN(h)) {
    heightVal = toMetric
      ? String(round1(h * CM_PER_IN))
      : String(Math.min(HEIGHT_MAX_IN, Math.max(HEIGHT_MIN_IN, Math.round(h / CM_PER_IN))));
  }
  neckVal = conv(neckVal);
  waistVal = conv(waistVal);
  hipVal = conv(hipVal);
  units = u;
  renderBodyFatTab();
};
window.calcBfSetSex = function (v) {
  sex = v;
  renderBodyFatTab();
};
window.calcBfSetHeight = function (v) {
  heightVal = v;
};
window.calcBfSetNeck = function (v) {
  neckVal = v;
};
window.calcBfSetWaist = function (v) {
  waistVal = v;
};
window.calcBfSetHip = function (v) {
  hipVal = v;
};

window.calcRunBodyFat = function () {
  if (!sex) return showAlert("Missing Info", "Select your sex to calculate body fat %.");
  const heightRaw = parseFloat(heightVal);
  const neckRaw = parseFloat(neckVal);
  const waistRaw = parseFloat(waistVal);
  const hipRaw = parseFloat(hipVal);
  if (!heightRaw || heightRaw <= 0 || !neckRaw || neckRaw <= 0 || !waistRaw || waistRaw <= 0) {
    return showAlert("Missing Info", "Enter your height, neck, and waist measurements to calculate.");
  }
  if (sex === "female" && (!hipRaw || hipRaw <= 0)) {
    return showAlert("Missing Info", "Enter your hip measurement to calculate.");
  }
  const toIn = (v) => (units === "metric" ? v / CM_PER_IN : v);
  const heightIn = toIn(heightRaw);
  const neckIn = toIn(neckRaw);
  const waistIn = toIn(waistRaw);
  const hipIn = toIn(hipRaw);
  if (sex === "male" && waistIn <= neckIn) {
    return showAlert("Check Measurements", "Waist must be larger than neck for this formula to work.");
  }
  if (sex === "female" && waistIn + hipIn <= neckIn) {
    return showAlert("Check Measurements", "Waist + hip must be larger than neck for this formula to work.");
  }
  bfResult = round1(computeBodyFatPercent(sex, heightIn, neckIn, waistIn, hipIn));
  renderBodyFatTab();
};

renderBodyFatTab();
