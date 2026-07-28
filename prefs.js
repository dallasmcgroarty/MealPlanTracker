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
