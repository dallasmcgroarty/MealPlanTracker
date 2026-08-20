import { dbGetAll, dbPut, dbDelete } from "./db.js";

// Saved plans for the Grocery Budget Calculator tool. Fully independent from
// Foods (coreitems) and Bowls — this tool only ever reads from Foods to
// prefill a new line item, it never writes back to it.
export let GROCERY_PLANS = [];

export async function loadGroceryPlans() {
  let dbPlans = [];
  try {
    dbPlans = await dbGetAll("groceryPlans");
  } catch (e) {
    dbPlans = [];
  }
  GROCERY_PLANS.length = 0;
  GROCERY_PLANS.push(...dbPlans);
}

export async function saveGroceryPlan(plan) {
  await dbPut("groceryPlans", plan);
}

export async function deleteGroceryPlanFromDB(id) {
  await dbDelete("groceryPlans", id);
}
