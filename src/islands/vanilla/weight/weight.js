import * as db from "../../../lib/db.js";
import { todayStr, weekStartFor } from "../../../lib/dates.js";
import * as prefs from "../../../lib/prefs.js";
import { showConfirm } from "../../../lib/ui.js";

// Weight is always stored normalized to kg. Display unit is a global setting
// (owned by prefs.js, shared with the Settings page).
export let WEIGHT_ENTRIES = []; // [{ date, weightKg }]
let weightUnit = "lb"; // 'lb' | 'kg'
let chartMode = "daily"; // 'daily' | 'weekly'

const KG_PER_LB = 0.45359237;

export async function loadAll() {
  try {
    WEIGHT_ENTRIES = (await db.dbGetAll("weights")) || [];
  } catch (e) {
    WEIGHT_ENTRIES = [];
  }
  WEIGHT_ENTRIES.sort((a, b) => a.date.localeCompare(b.date));
  weightUnit = await prefs.getWeightUnit();
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
  renderWeightTab();
};

async function init() {
  await db.openDB();
  await loadAll();
  renderWeightTab();
}

init();
