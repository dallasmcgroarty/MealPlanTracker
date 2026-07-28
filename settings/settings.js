import * as db from "../db.js";
import { todayStr } from "../dates.js";
import * as prefs from "../prefs.js";
import { showConfirm } from "../ui.js";
import "../nav.js";
import "../settingsHint.js";

// ═══════════════════════════════════════════════════════════════════
// CALORIE RANGE
// ═══════════════════════════════════════════════════════════════════
async function renderCalRangeInputs() {
  const range = await prefs.getCalRange();
  document.getElementById("settings-cal-low").value = range.low;
  document.getElementById("settings-cal-high").value = range.high;
}

async function saveCalRangeFromSettings() {
  const current = await prefs.getCalRange();
  const low = parseInt(document.getElementById("settings-cal-low").value) || current.low;
  const high = parseInt(document.getElementById("settings-cal-high").value) || current.high;
  if (low >= high) return;
  if (!await showConfirm(`Set calorie range to ${low.toLocaleString()} – ${high.toLocaleString()} kcal?`, 'Save')) return;
  await prefs.setCalRange(low, high);
}
window.saveCalRangeFromSettings = saveCalRangeFromSettings;

// ═══════════════════════════════════════════════════════════════════
// WEIGHT UNIT
// ═══════════════════════════════════════════════════════════════════
function unitToggleHTML(unit) {
  return `
    <button class="wt-toggle-btn ${unit === "lb" ? "active" : ""}" onclick="window.settingsSetUnit('lb')">lb</button>
    <button class="wt-toggle-btn ${unit === "kg" ? "active" : ""}" onclick="window.settingsSetUnit('kg')">kg</button>
  `;
}

async function renderUnitToggle() {
  const unit = await prefs.getWeightUnit();
  const el = document.getElementById("settings-wt-unit-toggle");
  if (el) el.innerHTML = unitToggleHTML(unit);
}

window.settingsSetUnit = async function (unit) {
  await prefs.setWeightUnit(unit);
  renderUnitToggle();
};

// ═══════════════════════════════════════════════════════════════════
// FULL BACKUP EXPORT / IMPORT
// ═══════════════════════════════════════════════════════════════════
const ALL_STORES = ["days", "weeks", "coreitems", "settings", "programs", "exercises", "weights"];

async function exportFullBackup() {
  if (!await showConfirm("Export all data as a backup JSON file?", "Export")) return;

  const timestamp = todayStr();
  const stores = {};
  for (const name of ALL_STORES) {
    try {
      stores[name] = await db.dbGetAll(name);
    } catch (_) {
      stores[name] = [];
    }
  }

  const content = JSON.stringify({ version: 1, exportedAt: timestamp, stores });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  a.download = `Nawtch-backup-${timestamp}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportFullBackup = exportFullBackup;

async function handleImportFile(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;

  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (_) {
    alert("Could not read file. Make sure it's a valid Nawtch backup (.json).");
    return;
  }

  if (!backup.version || !backup.stores) {
    alert("Invalid backup format. This doesn't look like a Nawtch backup file.");
    return;
  }

  if (!await showConfirm(
    "This will overwrite ALL existing data — foods, programs, exercises, history, and settings. This cannot be undone.",
    "Restore"
  )) return;

  try {
    for (const name of ALL_STORES) {
      await db.dbClear(name);
      for (const record of (backup.stores[name] || [])) {
        await db.dbPut(name, record);
      }
    }
    localStorage.removeItem(db.LS_TODAY);
    localStorage.removeItem(db.LS_WEEK);
  } catch (err) {
    alert("Import failed: " + err.message);
    return;
  }

  location.reload();
}
window.handleImportFile = handleImportFile;

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
async function init() {
  await db.openDB();
  await renderCalRangeInputs();
  await renderUnitToggle();
}

init();
