// Shared calculator utilities — unit conversion, rounding, and the height
// dropdown builder used by more than one calculator page.
import * as prefs from "../prefs.js";

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const M_PER_MI = 1609.344;
export const ML_PER_FL_OZ = 29.5735;

export function mlToFlOz(ml) {
  return ml / ML_PER_FL_OZ;
}

// Height dropdown range for imperial units: 4ft 0in–7ft 0in, values in total inches.
export const HEIGHT_MIN_IN = 48;
export const HEIGHT_MAX_IN = 84;

export function round1(n) {
  return Math.round(n * 10) / 10;
}
export function round50(n) {
  return Math.round(n / 50) * 50;
}

export function heightOptionsHTML(selectedIn) {
  let html = `<option value="" ${!selectedIn ? "selected" : ""} disabled>Select height</option>`;
  for (let totalIn = HEIGHT_MIN_IN; totalIn <= HEIGHT_MAX_IN; totalIn++) {
    const ft = Math.floor(totalIn / 12);
    const inch = totalIn % 12;
    html += `<option value="${totalIn}" ${String(totalIn) === String(selectedIn) ? "selected" : ""}>${ft}ft ${inch}in</option>`;
  }
  return html;
}

export function computeBMR(sexVal, kg, cm, age) {
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return sexVal === "male" ? base + 5 : base - 161;
}

export function formatEnergyRange(lowKcal, highKcal) {
  const unit = prefs.getEnergyUnitSync();
  const low = Math.round(prefs.kcalToDisplayUnit(lowKcal, unit)).toLocaleString();
  const high = Math.round(prefs.kcalToDisplayUnit(highKcal, unit)).toLocaleString();
  return `${low}–${high} ${unit}`;
}

// Lets TDEE/BMR hand their calculated range (or single value, as low===high)
// to Macros across the full-page navigation between them. Consumed (removed)
// on read so a later direct visit to Macros falls back to the Settings range
// instead of reusing a stale value.
const MACRO_SOURCE_KEY = "nawtchCalcMacroSource";

export function sendToMacros(low, high, label) {
  try {
    sessionStorage.setItem(MACRO_SOURCE_KEY, JSON.stringify({ low, high, label }));
  } catch (e) {}
}

export function takeMacroSource() {
  try {
    const raw = sessionStorage.getItem(MACRO_SOURCE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(MACRO_SOURCE_KEY);
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
