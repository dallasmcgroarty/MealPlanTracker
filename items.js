import { dbGetAll, dbPut, dbDelete } from "./db.js";

// Core and custom items state
export let CORE_ITEMS = [];
export let servings = {};
export let customItems = [];
export let TARGET_WEEKLY = 0;

// Load core items from IndexedDB
export async function loadCoreItems() {
  let dbItems = [];
  try {
    dbItems = await dbGetAll("coreitems");
  } catch (e) {
    dbItems = [];
  }
  CORE_ITEMS.length = 0;
  CORE_ITEMS.push(...dbItems);
  TARGET_WEEKLY = CORE_ITEMS.reduce(
    (sum, item) => sum + item.costPerServing * item.target * 7,
    0,
  );
}

// Save or update a core item in IndexedDB
export async function saveCoreItem(item) {
  await dbPut("coreitems", item);
}

// Delete a core item from IndexedDB
export async function deleteCoreItemFromDB(id) {
  await dbDelete("coreitems", id);
}

function _isoDate(d) {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${da}`;
}

// Utility: get today's date string
export function todayStr() {
  return _isoDate(new Date());
}

// Utility: get week start for a date string
export function weekStartFor(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return _isoDate(d);
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

// Adjust serving for a core item (delta may be whole or half, e.g. 1, -1, 0.5, -0.5)
export function adjustServing(id, delta) {
	const next = Math.max(0, (servings[id] || 0) + delta);
	servings[id] = Math.round(next * 2) / 2; // guard against float drift, servings are always multiples of 0.5
}

// Add a custom item
export function addCustomItem(item) {
	customItems.push(item);
}

// Remove a custom item
export function removeCustomItem(idx) {
	customItems.splice(idx, 1);
}
