import { dbGetAll, dbPut, dbDelete } from "./db.js";

// The saved-bowls catalog — used by the Bowl Builder tool. Unlike a
// flattened coreitem (combined macros only), each bowl keeps its full list
// of components (food ref + portion) so it can be reopened and edited.
export let BOWLS = [];

// Load bowls from IndexedDB
export async function loadBowls() {
  let dbItems = [];
  try {
    dbItems = await dbGetAll("bowls");
  } catch (e) {
    dbItems = [];
  }
  BOWLS.length = 0;
  BOWLS.push(...dbItems);
}

// Save or update a bowl in IndexedDB
export async function saveBowl(bowl) {
  await dbPut("bowls", bowl);
}

// Delete a bowl from IndexedDB
export async function deleteBowlFromDB(id) {
  await dbDelete("bowls", id);
}
