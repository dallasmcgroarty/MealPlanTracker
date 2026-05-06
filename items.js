import { dbGetAll, dbPut, dbDelete } from "./db.js";

// Core and custom items state
export let CORE_ITEMS = [];
export let servings = {};
export let customItems = [];
export let TARGET_WEEKLY = 0;

// Load core items from IndexedDB and merge with JSON if present
export async function loadCoreItems() {
  let dbItems = [];
  let jsonItems = [];
  try {
    dbItems = await dbGetAll("coreitems");
  } catch (e) {
    dbItems = [];
  }
  try {
    const resp = await fetch("core_items.json");
    if (resp.ok) {
      jsonItems = await resp.json();
    } else {
      console.warn("core_items.json fetch failed", resp.status);
    }
  } catch (e) {
    console.warn("core_items.json fetch error", e);
    jsonItems = [];
  }
  const dbIds = new Set(dbItems.map(i => i.id));
  const merged = [...dbItems];
  jsonItems.forEach(j => {
    if (!dbIds.has(j.id)) merged.push(j);
  });
  CORE_ITEMS.length = 0;
  CORE_ITEMS.push(...merged);
  TARGET_WEEKLY = CORE_ITEMS.reduce(
    (sum, item) => sum + item.costPerServing * item.target * 7,
    0,
  );
  console.log("All items loaded");
}

// Save or update a core item in IndexedDB
export async function saveCoreItem(item) {
  await dbPut("coreitems", item);
}

// Delete a core item from IndexedDB
export async function deleteCoreItemFromDB(id) {
  await dbDelete("coreitems", id);
}

// Utility: get today's date string
export function todayStr() {
	return new Date().toLocaleDateString("en-CA");
}

// Utility: get week start for a date string
export function weekStartFor(dateStr) {
	const d = new Date(dateStr + "T00:00:00");
	const day = d.getDay();
	d.setDate(d.getDate() - day);
	return d.toLocaleDateString("en-CA");
}

// Compute totals for today
export function computeTotals() {
	let cal = 0, p = 0, c = 0, f = 0, cost = 0;
	CORE_ITEMS.forEach((item) => {
		const srv = servings[item.id] || 0;
		cal += item.cal * srv;
		p += item.p * srv;
		c += item.c * srv;
		f += item.f * srv;
		cost += item.costPerServing * srv;
	});
	customItems.forEach((item) => {
		cal += parseFloat(item.cal) || 0;
		p += parseFloat(item.p) || 0;
		c += parseFloat(item.c) || 0;
		f += parseFloat(item.f) || 0;
		cost += parseFloat(item.todayCost) || 0;
	});
	return { cal, p, c, f, cost };
}

// Target cost per day
export function targetCostPerDay() {
	return CORE_ITEMS.reduce(
		(s, item) => s + item.costPerServing * item.target,
		0,
	);
}

// Adjust serving for a core item
export function adjustServing(id, delta) {
	servings[id] = Math.max(0, (servings[id] || 0) + delta);
}

// Add a custom item
export function addCustomItem(item) {
	customItems.push(item);
}

// Remove a custom item
export function removeCustomItem(idx) {
	customItems.splice(idx, 1);
}
