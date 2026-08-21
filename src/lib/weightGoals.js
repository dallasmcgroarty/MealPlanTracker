// Weight-goal-by-date module — owns the "weightGoals" IndexedDB store.
// Only the Weight page/island imports this; no other page reads or writes
// goal data. Two record shapes share the store, distinguished by `kind`:
//   - the single active goal, always stored under the fixed id "active-goal"
//   - completed-goal records, one per finished goal, id "completed-<ms>"
import { dbGet, dbGetAll, dbPut, dbDelete } from "./db.js";
import { todayStr, daysBetween } from "./dates.js";

const ACTIVE_ID = "active-goal";

export async function getActiveGoal() {
  try {
    return (await dbGet("weightGoals", ACTIVE_ID)) || null;
  } catch (e) {
    return null;
  }
}

export async function startGoal({ targetWeightKg, direction, targetDate, startWeightKg }) {
  const goal = {
    id: ACTIVE_ID,
    kind: "active",
    targetWeightKg,
    direction,
    startDate: todayStr(),
    targetDate,
    startWeightKg: startWeightKg ?? null,
  };
  await dbPut("weightGoals", goal);
  return goal;
}

export async function deleteActiveGoal() {
  await dbDelete("weightGoals", ACTIVE_ID);
}

// If the goal was started before any weight had been logged, the first
// entry logged afterward becomes the baseline. No-op once a start weight
// is already recorded.
export async function resolveStartWeightIfPending(activeGoal, weightKg) {
  if (!activeGoal || activeGoal.startWeightKg != null) return activeGoal;
  const updated = { ...activeGoal, startWeightKg: weightKg };
  await dbPut("weightGoals", updated);
  return updated;
}

export function checkGoalMet(activeGoal, weightKg) {
  if (!activeGoal || activeGoal.startWeightKg == null) return false;
  return activeGoal.direction === "lose"
    ? weightKg <= activeGoal.targetWeightKg
    : weightKg >= activeGoal.targetWeightKg;
}

export async function completeGoal(activeGoal, endWeightKg, endDate) {
  const completed = {
    id: `completed-${Date.now()}`,
    kind: "completed",
    direction: activeGoal.direction,
    targetWeightKg: activeGoal.targetWeightKg,
    startDate: activeGoal.startDate,
    endDate,
    daysTaken: daysBetween(activeGoal.startDate, endDate),
    startWeightKg: activeGoal.startWeightKg,
    endWeightKg,
    hidden: false,
  };
  await dbPut("weightGoals", completed);
  await dbDelete("weightGoals", ACTIVE_ID);
  return completed;
}

export async function getLatestCompletedGoal() {
  let all;
  try {
    all = (await dbGetAll("weightGoals")) || [];
  } catch (e) {
    return null;
  }
  const completed = all
    .filter((g) => g.kind === "completed" && !g.hidden)
    .sort((a, b) => b.endDate.localeCompare(a.endDate));
  return completed[0] || null;
}

export async function hideCompletedGoal(id) {
  const goal = await dbGet("weightGoals", id);
  if (!goal) return;
  goal.hidden = true;
  await dbPut("weightGoals", goal);
}
