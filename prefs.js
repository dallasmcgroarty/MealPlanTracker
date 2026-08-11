// Shared preferences module — owns every key in the IndexedDB "settings" store.
// Any page that needs the calorie range, weight unit, or first-run flag reads/
// writes it through here instead of touching db.js's settings store directly,
// so no two pages can drift out of sync on what a key means or how it's shaped.
import { dbGet, dbPut } from "./db.js";

const DEFAULT_CAL_RANGE = { low: 1250, high: 1750 };

export async function getCalRange() {
  try {
    const saved = await dbGet("settings", "calRange");
    if (saved) return { low: saved.low, high: saved.high };
  } catch (e) {}
  return { ...DEFAULT_CAL_RANGE };
}

export async function setCalRange(low, high) {
  await dbPut("settings", { key: "calRange", low, high });
}

export async function getWeightUnit() {
  try {
    const saved = await dbGet("settings", "weightUnit");
    if (saved && saved.value) return saved.value;
  } catch (e) {}
  return "lb";
}

export async function setWeightUnit(unit) {
  if (unit !== "lb" && unit !== "kg") return;
  await dbPut("settings", { key: "weightUnit", value: unit });
}

export async function getPortionUnit() {
  try {
    const saved = await dbGet("settings", "portionUnit");
    if (saved && saved.value) return saved.value;
  } catch (e) {}
  return "g";
}

export async function setPortionUnit(unit) {
  if (unit !== "g" && unit !== "oz") return;
  await dbPut("settings", { key: "portionUnit", value: unit });
}

// ═══════════════════════════════════════════════════════════════════
// ENERGY UNIT — energy is always stored normalized to kcal (same
// convention as weight-in-kg above). Display unit is a global setting.
// cachedEnergyUnit lets formatEnergy() read synchronously during render;
// each page must `await getEnergyUnit()` once during init to warm it,
// same as weight.js caches weightUnit locally after loadAll().
// ═══════════════════════════════════════════════════════════════════
const KJ_PER_KCAL = 4.184;
let cachedEnergyUnit = null;

export async function getEnergyUnit() {
  if (cachedEnergyUnit) return cachedEnergyUnit;
  try {
    const saved = await dbGet("settings", "energyUnit");
    cachedEnergyUnit = (saved && saved.value) || "kcal";
  } catch (e) {
    cachedEnergyUnit = "kcal";
  }
  return cachedEnergyUnit;
}

export async function setEnergyUnit(unit) {
  if (unit !== "kcal" && unit !== "kJ") return;
  cachedEnergyUnit = unit;
  await dbPut("settings", { key: "energyUnit", value: unit });
}

// Synchronous — relies on getEnergyUnit() having been awaited earlier
// this page load so cachedEnergyUnit is warm.
export function getEnergyUnitSync() {
  return cachedEnergyUnit || "kcal";
}

export function kcalToDisplayUnit(kcalValue, unit) {
  return unit === "kJ" ? kcalValue * KJ_PER_KCAL : kcalValue;
}

export function displayUnitToKcal(value, unit) {
  return unit === "kJ" ? value / KJ_PER_KCAL : value;
}

// Synchronous — relies on getEnergyUnit() having been awaited earlier
// this page load so cachedEnergyUnit is warm.
export function formatEnergy(kcalValue) {
  const unit = cachedEnergyUnit || "kcal";
  if (unit === "kJ") return `${Math.round(kcalValue * KJ_PER_KCAL)} kJ`;
  return `${Math.round(kcalValue)} kcal`;
}

// ═══════════════════════════════════════════════════════════════════
// CURRENCY — display label only, no rate conversion. A dollar amount
// entered under one currency setting reads back unchanged under another;
// only the symbol shown next to it changes. Same cache-then-sync-read
// pattern as energy unit above.
// ═══════════════════════════════════════════════════════════════════
export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "SGD", "PHP", "MYR", "HKD"];
export const CURRENCY_SYMBOLS = {
  USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$",
  SGD: "S$", PHP: "₱", MYR: "RM", HKD: "HK$",
};
let cachedCurrency = null;

export async function getCurrency() {
  if (cachedCurrency) return cachedCurrency;
  try {
    const saved = await dbGet("settings", "currency");
    cachedCurrency = (saved && saved.value && CURRENCIES.includes(saved.value)) ? saved.value : "USD";
  } catch (e) {
    cachedCurrency = "USD";
  }
  return cachedCurrency;
}

export async function setCurrency(code) {
  if (!CURRENCIES.includes(code)) return;
  cachedCurrency = code;
  await dbPut("settings", { key: "currency", value: code });
}

// Synchronous — relies on getCurrency() having been awaited earlier
// this page load so cachedCurrency is warm.
export function getCurrencySymbol() {
  return CURRENCY_SYMBOLS[cachedCurrency || "USD"];
}

export function formatCurrency(amount) {
  return `${getCurrencySymbol()}${(amount || 0).toFixed(2)}`;
}

export async function getJourneyStarted() {
  try {
    const flag = await dbGet("settings", "journeyStarted");
    return !!flag;
  } catch (e) {
    return true; // if settings can't be read, don't block on the welcome modal
  }
}

export async function setJourneyStarted() {
  await dbPut("settings", { key: "journeyStarted", value: true, at: Date.now() });
}

// Timestamp (ms) of when the welcome modal was confirmed — used to time the
// settings-button hint. Returns null if the journey hasn't started yet.
// Backfills a timestamp once for pre-existing records that predate this field
// so the hint doesn't wait on a start time that was never recorded.
export async function getJourneyStartedAt() {
  try {
    const saved = await dbGet("settings", "journeyStarted");
    if (!saved) return null;
    if (saved.at) return saved.at;
    const at = Date.now();
    await dbPut("settings", { key: "journeyStarted", value: true, at });
    return at;
  } catch (e) {
    return null;
  }
}

// Whether the user has ever loaded the Settings page — gates the one-time
// settings-button hint arrow.
export async function getSettingsVisited() {
  try {
    const saved = await dbGet("settings", "settingsVisited");
    return !!(saved && saved.value);
  } catch (e) {
    return false;
  }
}

export async function setSettingsVisited() {
  await dbPut("settings", { key: "settingsVisited", value: true });
}
