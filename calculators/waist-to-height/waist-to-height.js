import { showAlert } from "../../ui.js";
import "../../nav.js";
import "../../settingsHint.js";
import { CM_PER_IN, HEIGHT_MIN_IN, HEIGHT_MAX_IN, round1, heightOptionsHTML } from "../calc-shared.js";

let units = "imperial"; // 'imperial' (in) | 'metric' (cm)
let heightVal = "";
let waistVal = "";
let whtrResult = null; // ratio, e.g. 0.57

function computeWHtR(waist, height) {
  return waist / height;
}

function whtrCategory(r) {
  if (r < 0.5) return "Healthy central adiposity";
  if (r < 0.6) return "Increased central adiposity";
  return "High central adiposity";
}

function whtrRiskNote(r) {
  if (r < 0.5) return "No increased health risk (NICE)";
  if (r < 0.6) return "Increased health risk (NICE)";
  return "Further increased health risk (NICE)";
}

function renderWhtrTab() {
  const el = document.getElementById("calc-whtr");
  const unit = units === "metric" ? "cm" : "in";
  const heightUnit = units === "metric" ? "cm" : "ft/in";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Waist-to-Height Ratio Calculator</h2>
      <div class="settings-section-body">
        <div class="wt-toggle" style="margin-bottom:14px;">
          <button class="wt-toggle-btn ${units === "imperial" ? "active" : ""}" onclick="window.calcWhtrSetUnits('imperial')">Imperial</button>
          <button class="wt-toggle-btn ${units === "metric" ? "active" : ""}" onclick="window.calcWhtrSetUnits('metric')">Metric</button>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Height (${heightUnit})</span>
            ${
              units === "metric"
                ? `<input type="number" id="calc-whtr-height" min="0" step="0.1" placeholder="173" value="${heightVal}" oninput="window.calcWhtrSetHeight(this.value)" />`
                : `<select id="calc-whtr-height" onchange="window.calcWhtrSetHeight(this.value)">${heightOptionsHTML(heightVal)}</select>`
            }
          </div>
          <div class="field-group">
            <span class="field-label">Waist (${unit})</span>
            <input type="number" id="calc-whtr-waist" min="0" step="0.1" placeholder="${units === "metric" ? "86" : "34"}" value="${waistVal}" oninput="window.calcWhtrSetWaist(this.value)" />
          </div>
        </div>
        <span class="field-hint" style="display:block;margin-top:10px;">Waist: measured midway between the bottom of your ribs and the top of your hip bone — roughly at belly-button level. Breathe out naturally before reading the tape.</span>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcRunWhtr()">Calculate</button>
      </div>
    </div>
    ${whtrResult !== null ? renderWhtrResult() : ""}
  `;
}

function renderWhtrResult() {
  return `
    <div class="settings-section">
      <div class="settings-section-title">Your Waist-to-Height Ratio</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:1fr;margin-bottom:0;">
          <div class="total-card">
            <div class="val">${whtrResult.toFixed(2)}</div>
            <div class="lbl">${whtrCategory(whtrResult)}</div>
            <div class="sub">${whtrRiskNote(whtrResult)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.calcWhtrSetUnits = function (u) {
  if (u === units) return;
  const toMetric = u === "metric";
  const h = parseFloat(heightVal);
  if (!isNaN(h)) {
    heightVal = toMetric
      ? String(round1(h * CM_PER_IN))
      : String(Math.min(HEIGHT_MAX_IN, Math.max(HEIGHT_MIN_IN, Math.round(h / CM_PER_IN))));
  }
  const w = parseFloat(waistVal);
  if (!isNaN(w)) waistVal = String(round1(toMetric ? w * CM_PER_IN : w / CM_PER_IN));
  units = u;
  renderWhtrTab();
};
window.calcWhtrSetHeight = function (v) {
  heightVal = v;
};
window.calcWhtrSetWaist = function (v) {
  waistVal = v;
};

window.calcRunWhtr = function () {
  const heightRaw = parseFloat(heightVal);
  const waistRaw = parseFloat(waistVal);
  if (!heightRaw || heightRaw <= 0 || !waistRaw || waistRaw <= 0) {
    return showAlert("Missing Info", "Enter your height and waist measurement to calculate.");
  }
  // Same-unit ratio — no cross-unit conversion needed, height and waist are already in matching units.
  whtrResult = computeWHtR(waistRaw, heightRaw);
  renderWhtrTab();
};

renderWhtrTab();
