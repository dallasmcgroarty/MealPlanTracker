import { showAlert } from "../../ui.js";
import "../../nav.js";
import "../../settingsHint.js";
import { KG_PER_LB, CM_PER_IN, HEIGHT_MIN_IN, HEIGHT_MAX_IN, round1, heightOptionsHTML } from "../calc-shared.js";

let units = "imperial";
let sex = null;
let heightVal = "";
let ibwResult = null; // kg

function computeIBW(sexVal, heightIn) {
  const base = sexVal === "male" ? 50 : 45.5;
  const overInches = Math.max(0, heightIn - 60);
  return base + 2.3 * overInches;
}

function renderIbwTab() {
  const el = document.getElementById("calc-ibw");
  const heightUnit = units === "metric" ? "cm" : "ft/in";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Ideal Body Weight Calculator</h2>
      <div class="settings-section-body">
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:14px;">
          <div class="wt-toggle">
            <button class="wt-toggle-btn ${units === "imperial" ? "active" : ""}" onclick="window.calcIbwSetUnits('imperial')">Imperial</button>
            <button class="wt-toggle-btn ${units === "metric" ? "active" : ""}" onclick="window.calcIbwSetUnits('metric')">Metric</button>
          </div>
          <div class="field-group" style="margin-top: 6px;">
            <div class="field-label">Gender</div>
            <div class="wt-toggle">
              <button class="wt-toggle-btn ${sex === "female" ? "active" : ""}" onclick="window.calcIbwSetSex('female')">Female</button>
              <button class="wt-toggle-btn ${sex === "male" ? "active" : ""}" onclick="window.calcIbwSetSex('male')">Male</button>
            </div>
          </div>
        </div>
        <div class="field-group">
          <span class="field-label">Height (${heightUnit})</span>
          ${
            units === "metric"
              ? `<input type="number" id="calc-ibw-height" min="0" step="0.1" placeholder="173" value="${heightVal}" oninput="window.calcIbwSetHeight(this.value)" />`
              : `<select id="calc-ibw-height" onchange="window.calcIbwSetHeight(this.value)">${heightOptionsHTML(heightVal)}</select>`
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
  if (u === units) return;
  const h = parseFloat(heightVal);
  if (!isNaN(h)) {
    heightVal =
      u === "metric"
        ? String(round1(h * CM_PER_IN))
        : String(Math.min(HEIGHT_MAX_IN, Math.max(HEIGHT_MIN_IN, Math.round(h / CM_PER_IN))));
  }
  units = u;
  renderIbwTab();
};
window.calcIbwSetSex = function (v) {
  sex = v;
  renderIbwTab();
};
window.calcIbwSetHeight = function (v) {
  heightVal = v;
};

window.calcRunIbw = function () {
  if (!sex) return showAlert("Missing Info", "Select your sex to calculate ideal body weight.");
  const heightRaw = parseFloat(heightVal);
  if (!heightRaw || heightRaw <= 0) {
    return showAlert("Missing Info", "Enter your height to calculate.");
  }
  const heightIn = units === "metric" ? heightRaw / CM_PER_IN : heightRaw;
  ibwResult = computeIBW(sex, heightIn);
  renderIbwTab();
};

renderIbwTab();
