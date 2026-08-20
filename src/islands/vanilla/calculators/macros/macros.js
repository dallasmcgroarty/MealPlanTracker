import * as db from "../../../../lib/db.js";
import * as prefs from "../../../../lib/prefs.js";
import { showAlert } from "../../../../lib/ui.js";
import "../../../../lib/nav.js";
import "../../../../lib/settingsHint.js";
import { formatEnergyRange, takeMacroSource } from "../../../../lib/calculators/calc-shared.js";

const PRESETS = [
  { id: "highProtein", label: "High Protein", p: 40, c: 30, f: 30, desc: "Preserve muscle while eating less" },
  { id: "lowCarb", label: "Low Carb", p: 30, c: 20, f: 50, desc: "Fewer carbs, more fat for energy" },
  { id: "lowFat", label: "Low Fat", p: 25, c: 55, f: 20, desc: "Fewer fat calories, more carbs" },
  { id: "standard", label: "Standard", p: 20, c: 50, f: 30, desc: "Typical balanced diet, not training for muscle gain" },
];

// Populated at init(): either handed off from TDEE/BMR via sessionStorage, or
// falls back to the saved Settings calorie range.
let macroSource = { low: 1250, high: 1750, label: "your Settings target range" };
let macroMid = 0; // last-rendered base calories, used by the live custom-% updater
let selectedPresetId = "standard";
let customPct = { p: 20, c: 50, f: 30 };
let manualTargetVal = ""; // raw text of the optional calorie-target override field

function gramsFor(pct, mid, kcalPerG) {
  return Math.round((mid * pct) / 100 / kcalPerG);
}

function customResultHTML(p, c, f, mid) {
  const sum = p + c + f;
  const pg = gramsFor(p, mid, 4);
  const cg = gramsFor(c, mid, 4);
  const fg = gramsFor(f, mid, 9);
  const warn = sum !== 100 ? `<div style="color:var(--warn);font-family:'DM Mono',monospace;font-size:10px;margin-top:6px;">Adds up to ${sum}% — should be 100%</div>` : "";
  return `
    <div style="display:flex;gap:18px;font-family:'DM Mono',monospace;font-size:13px;margin-top:10px;flex-wrap:wrap;">
      <span class="day-p">${pg}g protein</span>
      <span class="day-c">${cg}g carbs</span>
      <span class="day-f">${fg}g fat</span>
    </div>
    ${warn}
  `;
}

function macroSourceLine(low, high, mid) {
  if (low === high) return `Based on ${macroSource.label}: ${prefs.formatEnergy(mid)}/day.`;
  return `Based on ${macroSource.label}: ${formatEnergyRange(low, high)}/day (avg ${prefs.formatEnergy(mid)}).`;
}

function renderMacrosTab() {
  const el = document.getElementById("calc-macros");
  const { low, high } = macroSource;
  const mid = Math.round((low + high) / 2);
  macroMid = mid;
  const unit = prefs.getEnergyUnitSync();

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Macro Breakdown</h2>
      <div class="settings-section-body">
        <p class="settings-desc">${macroSourceLine(low, high, mid)}</p>
        <div class="field-group" style="max-width:280px;margin:12px 0 4px;">
          <span class="field-label">OR Enter your own calorie target (${unit})</span>
          <div style="display:flex;gap:8px;">
            <input type="number" id="calc-macro-target" min="0" step="10" placeholder="e.g. ${unit === "kJ" ? "8400" : "2000"}" value="${manualTargetVal}" oninput="window.calcSetManualTarget(this.value)" />
            <button class="ghost-btn" onclick="window.calcUseManualTarget()">Use</button>
          </div>
        </div>
        <div style="overflow-x:auto;">
        <table class="days-table macro-table" style="margin-top:12px;">
          <thead><tr><th>Plan</th><th>Protein</th><th>Carbs</th><th>Fat</th><th></th></tr></thead>
          <tbody>
            ${PRESETS.map((preset) => {
              const pg = gramsFor(preset.p, mid, 4);
              const cg = gramsFor(preset.c, mid, 4);
              const fg = gramsFor(preset.f, mid, 9);
              const isSelected = selectedPresetId === preset.id;
              return `<tr style="${isSelected ? "background:var(--surface2);" : ""}">
                <td><span class="day-date">${preset.label}</span><br><span style="font-family:'DM Mono',monospace;font-size:12px;color:var(--muted);white-space:normal;">${preset.desc}</span></td>
                <td class="day-p" data-label="Protein">${pg}g <span style="color:var(--muted);">· ${preset.p}%</span></td>
                <td class="day-c" data-label="Carbs">${cg}g <span style="color:var(--muted);">· ${preset.c}%</span></td>
                <td class="day-f" data-label="Fat">${fg}g <span style="color:var(--muted);">· ${preset.f}%</span></td>
                <td><button class="ghost-btn" style="padding:4px 10px;" onclick="window.calcUsePreset('${preset.id}')">${isSelected ? "Selected" : "Use"}</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Adjust Your Own %</div>
      <div class="settings-section-body">
        <p class="settings-desc">Start from a plan above, or set your own split below — percentages should add up to 100%.</p>
        <div class="add-row add-row-2" style="margin-top:10px;">
          <div class="field-group">
            <span class="field-label">Protein %</span>
            <input type="number" id="calc-pct-p" min="0" max="100" step="1" value="${customPct.p}" oninput="window.calcUpdateCustom()" />
          </div>
          <div class="field-group">
            <span class="field-label">Carbs %</span>
            <input type="number" id="calc-pct-c" min="0" max="100" step="1" value="${customPct.c}" oninput="window.calcUpdateCustom()" />
          </div>
          <div class="field-group">
            <span class="field-label">Fat %</span>
            <input type="number" id="calc-pct-f" min="0" max="100" step="1" value="${customPct.f}" oninput="window.calcUpdateCustom()" />
          </div>
        </div>
        <div id="calc-custom-result">${customResultHTML(customPct.p, customPct.c, customPct.f, mid)}</div>
      </div>
    </div>
  `;
}

window.calcUsePreset = function (id) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return;
  selectedPresetId = id;
  customPct = { p: preset.p, c: preset.c, f: preset.f };
  renderMacrosTab();
};

window.calcUpdateCustom = function () {
  const p = parseFloat(document.getElementById("calc-pct-p").value) || 0;
  const c = parseFloat(document.getElementById("calc-pct-c").value) || 0;
  const f = parseFloat(document.getElementById("calc-pct-f").value) || 0;
  customPct = { p, c, f };
  document.getElementById("calc-custom-result").innerHTML = customResultHTML(p, c, f, macroMid);
};

window.calcSetManualTarget = function (v) {
  manualTargetVal = v;
};

window.calcUseManualTarget = function () {
  const raw = parseFloat(manualTargetVal);
  if (!raw || raw <= 0) return showAlert("Missing Info", "Enter a calorie target to use.");
  const kcal = Math.round(prefs.displayUnitToKcal(raw, prefs.getEnergyUnitSync()));
  macroSource = { low: kcal, high: kcal, label: "your entered calorie target" };
  renderMacrosTab();
};

async function init() {
  await db.openDB();
  await prefs.getEnergyUnit();
  const passed = takeMacroSource();
  if (passed) {
    macroSource = passed;
  } else {
    const range = await prefs.getCalRange();
    macroSource = { low: range.low, high: range.high, label: "your Settings target range" };
  }
  renderMacrosTab();
}

init();
