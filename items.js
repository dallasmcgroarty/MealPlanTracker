import { dbGetAll, dbPut, dbDelete } from "./db.js";

// The saved-foods catalog — shared by the Today page (which logs servings
// against it) and the Foods page (which manages it). Today's own logging-
// session state (servings, custom items, totals) lives in today.js, not here.
export let CORE_ITEMS = [];

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
}

// Save or update a core item in IndexedDB
export async function saveCoreItem(item) {
  await dbPut("coreitems", item);
}

// Delete a core item from IndexedDB
export async function deleteCoreItemFromDB(id) {
  await dbDelete("coreitems", id);
}
