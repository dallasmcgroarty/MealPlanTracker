import * as db from "../../../lib/db.js";
import { todayStr, weekStartFor, daysBetween } from "../../../lib/dates.js";
import * as prefs from "../../../lib/prefs.js";
import * as weightGoals from "../../../lib/weightGoals.js";
import { showConfirm } from "../../../lib/ui.js";

// Weight is always stored normalized to kg. Display unit is a global setting
// (owned by prefs.js, shared with the Settings page).
export let WEIGHT_ENTRIES = []; // [{ date, weightKg }]
let weightUnit = "lb"; // 'lb' | 'kg'
let chartMode = "daily"; // 'daily' | 'weekly'
let activeGoal = null; // weightGoals "active-goal" record, or null
let latestCompletedGoal = null; // most recent unhidden completed-goal record, or null

const KG_PER_LB = 0.45359237;

export async function loadAll() {
  try {
    WEIGHT_ENTRIES = (await db.dbGetAll("weights")) || [];
  } catch (e) {
    WEIGHT_ENTRIES = [];
  }
  WEIGHT_ENTRIES.sort((a, b) => a.date.localeCompare(b.date));
  weightUnit = await prefs.getWeightUnit();
  activeGoal = await weightGoals.getActiveGoal();
  latestCompletedGoal = await weightGoals.getLatestCompletedGoal();
}

function kgToDisplay(kg) {
  return weightUnit === "lb" ? kg / KG_PER_LB : kg;
}

function displayToKg(val) {
  return weightUnit === "lb" ? val * KG_PER_LB : val;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatHeaderDate() {
  return new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function unitToggleHTML() {
  return `
    <button class="wt-toggle-btn ${weightUnit === "lb" ? "active" : ""}" onclick="window.wtSetUnit('lb')">lb</button>
    <button class="wt-toggle-btn ${weightUnit === "kg" ? "active" : ""}" onclick="window.wtSetUnit('kg')">kg</button>
  `;
}

window.wtSetUnit = async function (unit) {
  if (unit !== "lb" && unit !== "kg") return;
  if (unit === weightUnit) return;
  weightUnit = unit;
  await prefs.setWeightUnit(unit);
  const el = document.getElementById("wt-unit-toggle");
  if (el) el.innerHTML = unitToggleHTML();
  renderWeightTab();
};

function renderHeader() {
  const el = document.getElementById("wt-hdr-date");
  if (el) el.textContent = formatHeaderDate();
}

// ═══════════════════════════════════════════════════════════════════
// WEIGHT GOAL — countdown card, completed-goal banner, and the two
// modals (set-goal, congrats). All goal data lives in weightGoals.js;
// this file only renders it and reacts to wtSave.
// ═══════════════════════════════════════════════════════════════════
function directionLabel(direction) {
  return direction === "lose" ? "Lose" : "Gain";
}

function goalSectionHTML() {
  if (!activeGoal) {
    return `
    <div class="wt-goal-section">
      <div class="wt-goal-card">
        <button class="add-btn" onclick="window.openGoalModal()">Set a goal weight</button>
      </div>
    </div>
    `;
  }
  const targetDisplay = round1(kgToDisplay(activeGoal.targetWeightKg));
  const remaining = daysBetween(todayStr(), activeGoal.targetDate);
  let countdownHTML;
  if (remaining > 0) {
    countdownHTML = `<span class="wt-goal-countdown">${remaining} day${remaining === 1 ? "" : "s"} left</span>`;
  } else if (remaining === 0) {
    countdownHTML = `<span class="wt-goal-countdown">Due today</span>`;
  } else {
    countdownHTML = `<span class="wt-goal-countdown overdue">${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? "" : "s"} overdue</span>`;
  }
  return `
  <div class="wt-goal-section">
    <div class="wt-goal-card">
      <div class="wt-goal-info">
        <div class="wt-goal-target">Current goal is to ${directionLabel(activeGoal.direction)} ${targetDisplay} ${weightUnit}s</div>
        <div class="wt-goal-countdown-wrapper">You have a ${countdownHTML} to achieve it!</div>
      </div>
      <button class="wt-goal-delete" title="Delete goal" onclick="window.wgDeleteGoal()">🗑</button>
    </div>
  </div>
  `;
}

function completedBannerHTML() {
  if (!latestCompletedGoal) return "";
  const g = latestCompletedGoal;
  const startDisplay = round1(kgToDisplay(g.startWeightKg));
  const endDisplay = round1(kgToDisplay(g.endWeightKg));
  return `
  <div class="wt-goal-banner" id="wt-goal-banner-${g.id}">
    <button class="wt-goal-banner-close" title="Hide" onclick="window.wgHideBanner('${g.id}')">×</button>
    <div class="wt-goal-banner-title">🎉 Goal complete!</div>
    <div class="wt-goal-banner-body">
      ${g.direction === "lose" ? "Lost" : "Gained"} weight from ${startDisplay} ${weightUnit} to ${endDisplay} ${weightUnit}
      in ${g.daysTaken} day${g.daysTaken === 1 ? "" : "s"} (${formatDateShort(g.startDate)} – ${formatDateShort(g.endDate)}).
    </div>
  </div>
  `;
}

window.wgHideBanner = async function (id) {
  await weightGoals.hideCompletedGoal(id);
  if (latestCompletedGoal && latestCompletedGoal.id === id) latestCompletedGoal = null;
  const el = document.getElementById(`wt-goal-banner-${id}`);
  if (el) el.remove();
};

window.wgDeleteGoal = async function () {
  if (!(await showConfirm("Delete this weight goal? You'll need to start a new one.", "Delete"))) return;
  await weightGoals.deleteActiveGoal();
  activeGoal = null;
  renderWeightTab();
};

function ensureGoalModal() {
  if (!document.getElementById("goal-modal")) {
    const el = document.createElement("div");
    el.id = "goal-modal";
    el.className = "pg-modal";
    el.addEventListener("click", (e) => {
      if (e.target === el) el.classList.remove("open");
    });
    document.body.appendChild(el);
  }
}

window.openGoalModal = function () {
  ensureGoalModal();
  const modal = document.getElementById("goal-modal");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().slice(0, 10);
  modal.innerHTML = `
    <div class="pg-modal-box">wt-goal-banner
      <div class="pg-modal-header">
        <div class="pg-modal-title">Set a Goal Weight</div>
        <button class="pg-close-btn" onclick="document.getElementById('goal-modal').classList.remove('open')">×</button>
      </div>
      <div class="pg-modal-body" style="display: flex; gap: 8px; flex-direction: column;">
        <div class="field-group">
          <span class="field-label">Direction</span>
          <div class="wt-toggle" id="goal-direction-toggle" style="width: fit-content; width: -webkit-fit-content;  width: -moz-fit-content;">
            <button class="wt-toggle-btn active" id="goal-dir-lose" onclick="window.wgSetDirection('lose')">Lose</button>
            <button class="wt-toggle-btn" id="goal-dir-gain" onclick="window.wgSetDirection('gain')">Gain</button>
          </div>
        </div>
        <div class="field-group">
          <span class="field-label">Target weight (${weightUnit})</span>
          <input type="number" id="goal-target-input" min="0" step="0.1" placeholder="e.g. 150.0" />
        </div>
        <div class="field-group">
          <span class="field-label">Target date</span>
          <input type="date" id="goal-date-input" min="${minDate}" value="${minDate}" />
        </div>
        <button class="add-btn" style="margin-top:8px;" onclick="window.wgStartGoal()">Start Goal</button>
      </div>
    </div>
  `;
  modal.dataset.direction = "lose";
  modal.classList.add("open");
};

window.wgSetDirection = function (direction) {
  const modal = document.getElementById("goal-modal");
  if (!modal) return;
  modal.dataset.direction = direction;
  document.getElementById("goal-dir-lose").classList.toggle("active", direction === "lose");
  document.getElementById("goal-dir-gain").classList.toggle("active", direction === "gain");
};

window.wgStartGoal = async function () {
  const modal = document.getElementById("goal-modal");
  const targetInput = document.getElementById("goal-target-input");
  const dateInput = document.getElementById("goal-date-input");
  const targetVal = parseFloat(targetInput.value);
  const targetDate = dateInput.value;
  const direction = modal.dataset.direction === "gain" ? "gain" : "lose";
  const today = todayStr();
  if (!targetVal || targetVal <= 0) {
    targetInput.focus();
    return;
  }
  if (!targetDate || targetDate <= today) {
    dateInput.focus();
    return;
  }
  const targetWeightKg = displayToKg(round1(targetVal));
  const priorEntry = [...WEIGHT_ENTRIES].filter((e) => e.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const startWeightKg = priorEntry ? priorEntry.weightKg : null;
  activeGoal = await weightGoals.startGoal({ targetWeightKg, direction, targetDate, startWeightKg });
  modal.classList.remove("open");
  renderWeightTab();
};

function ensureCongratsModal() {
  if (!document.getElementById("congrats-modal")) {
    const el = document.createElement("div");
    el.id = "congrats-modal";
    el.className = "pg-modal";
    document.body.appendChild(el);
  }
}

let pendingCompletion = null; // { activeGoal, endWeightKg, endDate } awaiting congrats-close

function showCongratsModal(completionInfo) {
  pendingCompletion = completionInfo;
  const { activeGoal: goal, endWeightKg, endDate } = completionInfo;
  const daysTaken = daysBetween(goal.startDate, endDate);
  const targetDisplay = round1(kgToDisplay(goal.targetWeightKg));
  ensureCongratsModal();
  const modal = document.getElementById("congrats-modal");
  modal.innerHTML = `
    <div class="pg-modal-box">
      <div class="pg-modal-header">
        <div class="pg-modal-title">🎉 Congrats!</div>
      </div>
      <div class="pg-modal-body">
        <p>You reached your goal of ${targetDisplay} ${weightUnit} in ${daysTaken} day${daysTaken === 1 ? "" : "s"}.</p>
        <button class="add-btn" style="margin-top:12px;" onclick="window.wgCloseCongrats()">Nice!</button>
      </div>
    </div>
  `;
  modal.classList.add("open");
}

window.wgCloseCongrats = async function () {
  if (pendingCompletion) {
    const { activeGoal: goal, endWeightKg, endDate } = pendingCompletion;
    latestCompletedGoal = await weightGoals.completeGoal(goal, endWeightKg, endDate);
    activeGoal = null;
    pendingCompletion = null;
  }
  const modal = document.getElementById("congrats-modal");
  if (modal) modal.classList.remove("open");
  renderWeightTab();
};

// ═══════════════════════════════════════════════════════════════════
// WEIGHT TAB
// ═══════════════════════════════════════════════════════════════════
export function renderWeightTab() {
  const tab = document.getElementById("tab-weight");
  if (!tab) return;
  renderHeader();
  const today = todayStr();
  const todayEntry = WEIGHT_ENTRIES.find((e) => e.date === today);
  const hasAny = WEIGHT_ENTRIES.length > 0;
  const prefill = todayEntry ? round1(kgToDisplay(todayEntry.weightKg)) : "";

  tab.innerHTML = `
    ${
      hasAny
        ? `
    <div class="meter-section">
      <div class="section-header">
        <div class="section-title" style="margin-bottom:0;">Weight Over Time</div>
        <div class="wt-toggle" id="wt-range-toggle">
          <button class="wt-toggle-btn ${chartMode === "daily" ? "active" : ""}" onclick="window.wtSetChartMode('daily')">Daily</button>
          <button class="wt-toggle-btn ${chartMode === "weekly" ? "active" : ""}" onclick="window.wtSetChartMode('weekly')">Weekly</button>
        </div>
      </div>
      <div id="weight-chart" class="echart-container" style="height:220px;max-width:100%;"></div>
    </div>
    `
        : `
    <div class="meter-section">
      <div class="section-title" style="margin-bottom:8px;">Weight Over Time</div>
      <div class="no-history" style="padding:40px 0;">No weight logged yet.<br><br>Log today's weight below to start tracking your trend.</div>
    </div>
    `
    }

    ${completedBannerHTML()}
    ${goalSectionHTML()}

    <div class="items-section">
      <div class="section-header">
        <div class="section-title" style="margin-bottom:0;">Log Today's Weight</div>
        <div class="wt-toggle" id="wt-unit-toggle">${unitToggleHTML()}</div>
      </div>
      <div class="add-row" style="grid-template-columns: 1fr auto; align-items:flex-end;">
        <div class="field-group">
          <span class="field-label">Weight (${weightUnit})</span>
          <input type="number" id="wt-input" min="0" step="0.1" placeholder="e.g. 165.0" value="${prefill}" />
        </div>
        <button class="add-btn" onclick="window.wtSave()">${todayEntry ? "Update" : "Save"}</button>
      </div>
    </div>
  `;

  if (hasAny) renderChart();
}

function weeklyAggregate() {
  const buckets = {}; // weekStart -> { sum, count }
  WEIGHT_ENTRIES.forEach((e) => {
    const ws = weekStartFor(e.date);
    if (!buckets[ws]) buckets[ws] = { sum: 0, count: 0 };
    buckets[ws].sum += e.weightKg;
    buckets[ws].count += 1;
  });
  const weekStarts = Object.keys(buckets).sort();
  return {
    labels: weekStarts,
    values: weekStarts.map((ws) => buckets[ws].sum / buckets[ws].count),
  };
}

function renderChart() {
  const dom = document.getElementById("weight-chart");
  if (!dom || !window.echarts) return;
  if (window._echartWeight) window._echartWeight.dispose();
  window._echartWeight = echarts.init(dom);

  let labels, values, tooltipDateFmt;
  if (chartMode === "weekly") {
    const agg = weeklyAggregate();
    labels = agg.labels;
    values = agg.values.map((kg) => round1(kgToDisplay(kg)));
    tooltipDateFmt = (v) => `Week of ${formatDateShort(v)}`;
  } else {
    labels = WEIGHT_ENTRIES.map((e) => e.date);
    values = WEIGHT_ENTRIES.map((e) => round1(kgToDisplay(e.weightKg)));
    tooltipDateFmt = (v) => formatDateShort(v);
  }

  window._echartWeight.setOption({
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        const p = params[0];
        return `${tooltipDateFmt(p.axisValue)}<br/>Weight: ${p.value} ${weightUnit}`;
      },
    },
    grid: { left: 40, right: 20, top: 20, bottom: 55 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { show: true, interval: "auto", rotate: 35, fontSize: 10, color: "#7a7f96", formatter: formatDateShort },
      axisTick: { alignWithLabel: true },
    },
    yAxis: { type: "value", scale: true, splitLine: { show: false } },
    series: [
      { name: "Weight", type: "line", data: values, smooth: true, symbolSize: 6,
        lineStyle: { color: "#60c8f0", width: 3 }, areaStyle: { color: "rgba(96,200,240,0.12)" } },
    ],
    legend: { show: false },
  });
  setTimeout(() => window._echartWeight.resize(), 0);
  window.addEventListener("resize", () => window._echartWeight && window._echartWeight.resize(), { passive: true });
}

window.wtSetChartMode = (mode) => {
  if (mode !== "daily" && mode !== "weekly") return;
  chartMode = mode;
  renderWeightTab();
};

window.wtSave = async function () {
  const input = document.getElementById("wt-input");
  const val = parseFloat(input.value);
  if (!val || val <= 0) {
    input.focus();
    return;
  }
  const displayVal = round1(val);
  if (!(await showConfirm(`Save today's weight as ${displayVal} ${weightUnit}?`, "Save"))) return;

  const today = todayStr();
  const weightKg = displayToKg(displayVal);
  const existing = WEIGHT_ENTRIES.find((e) => e.date === today);
  const entry = { date: today, weightKg };
  try {
    await db.dbPut("weights", entry);
  } catch (e) {
    return;
  }
  if (existing) {
    existing.weightKg = weightKg;
  } else {
    WEIGHT_ENTRIES.push(entry);
    WEIGHT_ENTRIES.sort((a, b) => a.date.localeCompare(b.date));
  }

  if (activeGoal) {
    activeGoal = await weightGoals.resolveStartWeightIfPending(activeGoal, weightKg);
    if (weightGoals.checkGoalMet(activeGoal, weightKg)) {
      showCongratsModal({ activeGoal, endWeightKg: weightKg, endDate: today });
      return;
    }
  }
  renderWeightTab();
};

async function init() {
  await db.openDB();
  await loadAll();
  renderWeightTab();
}

init();
