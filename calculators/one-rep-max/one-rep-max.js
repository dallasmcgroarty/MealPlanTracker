import { showAlert } from "../../ui.js";
import "../../nav.js";
import "../../settingsHint.js";
import { KG_PER_LB, round1 } from "../calc-shared.js";

let units = "imperial"; // 'imperial' | 'metric' — label only, math is unit-agnostic
let weightVal = "";
let repsVal = "";
let result = null; // { epley, brzycki, avg, reps }

// NSCA training load chart (Landers, 1984) — % of 1RM by target rep count.
const LOAD_PERCENTAGES = [
  { reps: 1, pct: 100 },
  { reps: 2, pct: 95 },
  { reps: 3, pct: 93 },
  { reps: 4, pct: 90 },
  { reps: 5, pct: 87 },
  { reps: 6, pct: 85 },
  { reps: 7, pct: 83 },
  { reps: 8, pct: 80 },
  { reps: 9, pct: 77 },
  { reps: 10, pct: 75 },
  { reps: 12, pct: 70 },
];

function roundToIncrement(value, increment) {
  return Math.round(value / increment) * increment;
}

function renderTab() {
  const el = document.getElementById("calc-orm");
  const weightUnit = units === "metric" ? "kg" : "lb";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">One Rep Max Calculator</h2>
      <div class="settings-section-body">
        <div class="wt-toggle" style="margin-bottom:14px;">
          <button class="wt-toggle-btn ${units === "imperial" ? "active" : ""}" onclick="window.calcOrmSetUnits('imperial')">Imperial</button>
          <button class="wt-toggle-btn ${units === "metric" ? "active" : ""}" onclick="window.calcOrmSetUnits('metric')">Metric</button>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Weight Lifted (${weightUnit})</span>
            <input type="number" id="calc-orm-weight" min="0" step="0.5" placeholder="${units === "metric" ? "100" : "225"}" value="${weightVal}" oninput="window.calcOrmSetWeight(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Reps Performed</span>
            <input type="number" id="calc-orm-reps" min="1" max="36" step="1" placeholder="5" value="${repsVal}" oninput="window.calcOrmSetReps(this.value)" />
          </div>
        </div>
        <span class="field-hint" style="display:block;margin-top:10px;">For the most reliable estimate, use a recent set of 1–6 reps taken close to failure.</span>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcOrmRun()">Calculate</button>
      </div>
    </div>
    ${result ? renderResult() : ""}
  `;
}

function renderResult() {
  const unit = units === "metric" ? "kg" : "lb";
  const warn =
    result.reps > 10
      ? `<div style="color:var(--warn);font-family:'DM Mono',monospace;font-size:11px;margin-top:10px;">Both formulas are most reliable for sets of 1–10 reps — accuracy drops the higher your rep count goes.</div>`
      : "";
  return `
    <div class="settings-section">
      <div class="settings-section-title">Estimated One-Rep Max</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:0;">
          <div class="total-card">
            <div class="val">${round1(result.epley)} ${unit}</div>
            <div class="lbl">Epley</div>
          </div>
          <div class="total-card">
            <div class="val">${round1(result.brzycki)} ${unit}</div>
            <div class="lbl">Brzycki</div>
          </div>
          <div class="total-card tc-cal">
            <div class="val">${round1(result.avg)} ${unit}</div>
            <div class="lbl">Average</div>
          </div>
        </div>
        ${warn}
      </div>
    </div>
    ${renderLoadTable(result.avg, unit)}
  `;
}

function renderLoadTable(oneRepMax, unit) {
  const increment = unit === "kg" ? 1 : 2.5;
  return `
    <div class="settings-section">
      <div class="settings-section-title">Training Load Table</div>
      <div class="settings-section-body">
        <p class="settings-desc">
          Based on the average of your Epley and Brzycki estimates (${round1(oneRepMax)} ${unit}). Lower reps
          (1–5) at higher percentages build strength; moderate reps (6–10) target hypertrophy. Treat anything above
          ~90% as a max-effort lift — use a spotter or safety equipment.
        </p>
        <div style="overflow-x:auto;">
        <table class="load-table" style="margin-top:12px;">
          <thead><tr><th>Reps</th><th>% of 1RM</th><th>Weight</th></tr></thead>
          <tbody>
            ${LOAD_PERCENTAGES.map((row) => {
              const weight = roundToIncrement(oneRepMax * (row.pct / 100), increment);
              return `<tr><td>${row.reps}</td><td>${row.pct}%</td><td>${weight} ${unit}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  `;
}

window.calcOrmSetUnits = function (u) {
  if (u === units) return;
  const w = parseFloat(weightVal);
  if (!isNaN(w)) weightVal = String(round1(u === "metric" ? w * KG_PER_LB : w / KG_PER_LB));
  units = u;
  renderTab();
};
window.calcOrmSetWeight = function (v) {
  weightVal = v;
};
window.calcOrmSetReps = function (v) {
  repsVal = v;
};

window.calcOrmRun = function () {
  const weight = parseFloat(weightVal);
  const reps = parseFloat(repsVal);
  if (!weight || weight <= 0 || !reps || reps <= 0) {
    return showAlert("Missing Info", "Enter the weight lifted and reps performed to calculate.");
  }
  if (reps >= 37) {
    return showAlert("Rep Count Too High", "The Brzycki formula is undefined at 37+ reps — enter a lower rep count for a reliable estimate.");
  }
  const epley = weight * (1 + reps / 30);
  const brzycki = (weight * 36) / (37 - reps);
  result = { epley, brzycki, avg: (epley + brzycki) / 2, reps };
  renderTab();
};

renderTab();
