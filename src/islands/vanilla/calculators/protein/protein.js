import * as db from "../../../../lib/db.js";
import * as prefs from "../../../../lib/prefs.js";
import { showAlert } from "../../../../lib/ui.js";
import "../../../../lib/nav.js";
import "../../../../lib/settingsHint.js";
import { KG_PER_LB, round1 } from "../../../../lib/calculators/calc-shared.js";

const TIERS = [
  {
    id: "sedentary",
    label: "Sedentary",
    low: 0.8,
    high: 1.2,
    desc: "Meets basic needs for adults with little structured exercise",
  },
  {
    id: "active",
    label: "Active / Gain Muscle",
    low: 1.6,
    high: 2.2,
    desc: "Supports muscle growth alongside regular resistance training",
  },
  {
    id: "cutting",
    label: "Cutting / Preserve Muscle",
    low: 1.6,
    high: 2.2,
    desc: "Helps protect lean mass while eating in a calorie deficit",
  },
  {
    id: "older",
    label: "Older Adult (65+)",
    low: 1.0,
    high: 1.6,
    desc: "A higher minimum to counter age-related anabolic resistance",
  },
];

let units = "imperial"; // 'imperial' | 'metric'
let weightVal = "";
let tierId = null;
let proteinResult = null; // { lowG, highG, tier }

function gramsRange(kg, low, high) {
  return { lowG: Math.round(kg * low), highG: Math.round(kg * high) };
}

function renderProteinTab() {
  const el = document.getElementById("calc-protein");
  const weightUnit = units === "metric" ? "kg" : "lb";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Protein Calculator</h2>
      <div class="settings-section-body">
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:14px;">
          <div class="wt-toggle">
            <button class="wt-toggle-btn ${units === "imperial" ? "active" : ""}" onclick="window.calcProteinSetUnits('imperial')">Imperial</button>
            <button class="wt-toggle-btn ${units === "metric" ? "active" : ""}" onclick="window.calcProteinSetUnits('metric')">Metric</button>
          </div>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Body Weight (${weightUnit})</span>
            <input type="number" id="calc-protein-weight" min="0" step="0.1" placeholder="${units === "metric" ? "70" : "155"}" value="${weightVal}" oninput="window.calcProteinSetWeight(this.value)" />
          </div>
        </div>
        <div class="field-group" style="margin-top:14px;">
          <span class="field-label">Activity / Goal</span>
          <div class="wt-toggle" style="flex-wrap:wrap;margin-top:6px;width: fit-content; width: -webkit-fit-content;  width: -moz-fit-content;">
            ${TIERS.map((tier) => `<button class="wt-toggle-btn ${tierId === tier.id ? "active" : ""}" title="${tier.desc}" onclick="window.calcProteinSetTier('${tier.id}')">${tier.label}</button>`).join("")}
          </div>
          <span class="field-hint" style="display:block;margin-top:6px;">${tierId ? `${TIERS.find((t) => t.id === tierId).desc} · ${TIERS.find((t) => t.id === tierId).low}–${TIERS.find((t) => t.id === tierId).high}g/kg/day` : "Select an option above to see what it means."}</span>
        </div>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcRunProtein()">Calculate</button>
      </div>
    </div>
    ${proteinResult !== null ? renderProteinResult() : ""}
  `;
}

function renderProteinResult() {
  const { lowG, highG, tier } = proteinResult;
  return `
    <div class="settings-section">
      <div class="settings-section-title">Your Protein Target</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:1fr;margin-bottom:0;">
          <div class="total-card">
            <div class="val">${lowG}–${highG}g</div>
            <div class="lbl">per day</div>
            <div class="sub">based on ${tier.label} (${tier.low}–${tier.high}g/kg/day)</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.calcProteinSetUnits = function (u) {
  if (u === units) return;
  const w = parseFloat(weightVal);
  if (!isNaN(w)) weightVal = String(round1(u === "metric" ? w * KG_PER_LB : w / KG_PER_LB));
  units = u;
  renderProteinTab();
};

window.calcProteinSetWeight = function (v) {
  weightVal = v;
};

window.calcProteinSetTier = function (id) {
  tierId = id;
  renderProteinTab();
};

window.calcRunProtein = function () {
  const weightRaw = parseFloat(weightVal);
  const tier = TIERS.find((t) => t.id === tierId);
  if (!weightRaw || weightRaw <= 0) return showAlert("Missing Info", "Enter your body weight to calculate.");
  if (!tier) return showAlert("Missing Info", "Select an activity/goal option to calculate.");
  const kg = units === "metric" ? weightRaw : weightRaw * KG_PER_LB;
  const { lowG, highG } = gramsRange(kg, tier.low, tier.high);
  proteinResult = { lowG, highG, tier };
  renderProteinTab();
};

async function init() {
  await db.openDB();
  await prefs.getEnergyUnit();
  renderProteinTab();
}

init();
