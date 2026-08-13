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
  const unit = await prefs.getEnergyUnit();
  document.getElementById("settings-cal-low-label").textContent = `Floor (${unit})`;
  document.getElementById("settings-cal-high-label").textContent = `Ceiling (${unit})`;
  document.getElementById("settings-cal-low").value = Math.round(prefs.kcalToDisplayUnit(range.low, unit));
  document.getElementById("settings-cal-high").value = Math.round(prefs.kcalToDisplayUnit(range.high, unit));
}

async function saveCalRangeFromSettings() {
  const unit = await prefs.getEnergyUnit();
  const current = await prefs.getCalRange();
  const lowRaw = parseFloat(document.getElementById("settings-cal-low").value);
  const highRaw = parseFloat(document.getElementById("settings-cal-high").value);
  const low = Number.isFinite(lowRaw) ? Math.round(prefs.displayUnitToKcal(lowRaw, unit)) : current.low;
  const high = Number.isFinite(highRaw) ? Math.round(prefs.displayUnitToKcal(highRaw, unit)) : current.high;
  if (low >= high) return;
  if (!await showConfirm(`Set calorie range to ${prefs.formatEnergy(low)} – ${prefs.formatEnergy(high)}?`, 'Save')) return;
  await prefs.setCalRange(low, high);
  await renderCalRangeInputs();
}
window.saveCalRangeFromSettings = saveCalRangeFromSettings;

// ═══════════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════════
function themeToggleHTML(theme) {
  return `
    <button class="wt-toggle-btn ${theme === "light" ? "active" : ""}" onclick="window.settingsSetTheme('light')">Light</button>
    <button class="wt-toggle-btn ${theme === "dark" ? "active" : ""}" onclick="window.settingsSetTheme('dark')">Dark</button>
    <button class="wt-toggle-btn ${theme === "system" ? "active" : ""}" onclick="window.settingsSetTheme('system')">System</button>
  `;
}

async function renderThemeToggle() {
  const theme = await prefs.getTheme();
  const el = document.getElementById("settings-theme-toggle");
  if (el) el.innerHTML = themeToggleHTML(theme);
}

window.settingsSetTheme = async function (theme) {
  await prefs.setTheme(theme);
  renderThemeToggle();
};

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
// ENERGY UNIT
// ═══════════════════════════════════════════════════════════════════
function energyUnitToggleHTML(unit) {
  return `
    <button class="wt-toggle-btn ${unit === "kcal" ? "active" : ""}" onclick="window.settingsSetEnergyUnit('kcal')">kcal</button>
    <button class="wt-toggle-btn ${unit === "kJ" ? "active" : ""}" onclick="window.settingsSetEnergyUnit('kJ')">kJ</button>
  `;
}

async function renderEnergyUnitToggle() {
  const unit = await prefs.getEnergyUnit();
  const el = document.getElementById("settings-energy-unit-toggle");
  if (el) el.innerHTML = energyUnitToggleHTML(unit);
}

window.settingsSetEnergyUnit = async function (unit) {
  await prefs.setEnergyUnit(unit);
  await renderEnergyUnitToggle();
  await renderCalRangeInputs();
};

// ═══════════════════════════════════════════════════════════════════
// CURRENCY
// ═══════════════════════════════════════════════════════════════════
function currencyMenuHTML(currency) {
  return prefs.CURRENCIES.map((code) =>
    `<button style="${currency === code ? "background:var(--surface2);color:var(--text);font-weight:600;" : ""}" onclick="window.settingsSetCurrency('${code}')">${prefs.CURRENCY_SYMBOLS[code]} ${code}${currency === code ? " ✓" : ""}</button>`
  ).join("");
}

async function renderCurrencyToggle() {
  const currency = await prefs.getCurrency();
  const trigger = document.getElementById("settings-currency-trigger");
  const menu = document.getElementById("settings-currency-menu");
  if (trigger) trigger.textContent = `${currency} (${prefs.CURRENCY_SYMBOLS[currency]}) ▾`;
  if (menu) menu.innerHTML = currencyMenuHTML(currency);
}

window.settingsSetCurrency = async function (code) {
  await prefs.setCurrency(code);
  document.getElementById("settings-currency-dropdown")?.classList.remove("open");
  await renderCurrencyToggle();
};

window.toggleCurrencyDropdown = function (e) {
  e.stopPropagation();
  const dd = e.currentTarget.closest(".export-dropdown");
  const wasOpen = dd.classList.contains("open");
  document.querySelectorAll(".export-dropdown.open").forEach(el => el.classList.remove("open"));
  if (!wasOpen) dd.classList.add("open");
};

document.addEventListener("click", () => {
  document.querySelectorAll(".export-dropdown.open").forEach(el => el.classList.remove("open"));
});

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
    // Restored theme lives in the "settings" store now, but the FOUC-prevention
    // bootstrap script reads localStorage — mirror it so the reload below (and
    // every page after) reflects the restored value instead of the stale one.
    const restoredTheme = (backup.stores.settings || []).find((r) => r.key === "theme");
    if (restoredTheme) localStorage.setItem(prefs.THEME_LS_KEY, restoredTheme.value);
    else localStorage.removeItem(prefs.THEME_LS_KEY);
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
  await prefs.getEnergyUnit();
  await renderCalRangeInputs();
  await renderThemeToggle();
  await renderUnitToggle();
  await renderEnergyUnitToggle();
  await renderCurrencyToggle();
}

init();
