import * as db from "../db.js";
import { todayStr, weekStartFor } from "../dates.js";
import * as prefs from "../prefs.js";
import { esc, showConfirm } from "../ui.js";
import "../nav.js";
import "../settingsHint.js";

let calRange = { low: 1250, high: 1750 };
let calChartMode = "daily"; // 'daily' | 'weekly'
let costChartMode = "weekly"; // 'weekly' | 'monthly'
let _historyWeeksCache = null; // last-fetched "weeks" data, reused so the daily/weekly toggle can redraw without a full re-fetch

function fmtChartDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const yr = String(d.getFullYear()).slice(2);
  return `${mo}/${day}/${yr}`;
}

function computeCalorieChartData(weeks) {
  let allDays = [];
  weeks.forEach(week => {
    const days = week.days || {};
    Object.keys(days).forEach(date => {
      const d = days[date];
      if (d.cal > 0 || d.cost > 0) allDays.push({ date, ...d });
    });
  });
  allDays.sort((a, b) => a.date.localeCompare(b.date));
  const calLabels = allDays.map(d => d.date);
  const calData = allDays.map(d => d.cal);

  const sortedWeeks = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  let calWeekLabels = [], calWeekAvgData = [];
  sortedWeeks.forEach(w => {
    const days = w.days || {};
    const calVals = Object.values(days).map(d => d.cal || 0).filter(c => c > 0);
    if (!calVals.length) return;
    calWeekLabels.push(w.weekStart);
    calWeekAvgData.push(Math.round(calVals.reduce((s, c) => s + c, 0) / calVals.length));
  });

  return { calLabels, calData, calWeekLabels, calWeekAvgData };
}

function applyCaloriesChartOption({ calLabels, calData, calWeekLabels, calWeekAvgData }) {
  if (!window._echartCalories) return;
  const isCalWeekly = calChartMode === 'weekly';
  const calChartLabels = isCalWeekly ? calWeekLabels : calLabels;
  const calChartData = isCalWeekly ? calWeekAvgData : calData;
  const calChartTargetLow = calChartLabels.map(() => calRange.low);
  const calChartTargetHigh = calChartLabels.map(() => calRange.high);
  const calSeriesName = isCalWeekly ? 'Avg Calories' : 'Calories';
  window._echartCalories.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: params => {
        const p = params[0];
        const label = isCalWeekly ? `Week of ${fmtChartDate(p.axisValue)}` : fmtChartDate(p.axisValue);
        return `${label}<br/>${calSeriesName}: ${prefs.formatEnergy(p.value || 0)}`;
      }
    },
    grid: { left: 40, right: 20, top: 20, bottom: 55 },
    xAxis: {
      type: 'category',
      data: calChartLabels,
      axisLabel: {
        show: true, interval: 'auto', rotate: 35, fontSize: 10, color: '#7a7f96',
        formatter: fmtChartDate,
      },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: calChartData.length ? Math.ceil(Math.max(...calChartData, calRange.high) * 1.15 / 250) * 250 : 2000,
      splitLine: { show: false },
      axisLabel: { formatter: v => Math.round(prefs.kcalToDisplayUnit(v, prefs.getEnergyUnitSync())) },
    },
    series: [
      { name: calSeriesName, type: 'line', data: calChartData, smooth: true, symbolSize: 6,
        lineStyle: { color: '#60c8f0', width: 3 }, areaStyle: { color: 'rgba(96,200,240,0.12)' } },
      { name: `Target Low (${prefs.formatEnergy(calRange.low)})`, type: 'line', data: calChartTargetLow, smooth: true, symbol: 'none',
        tooltip: { show: false }, lineStyle: { color: '#60f0a0', type: 'dashed', width: 2 } },
      { name: `Target High (${prefs.formatEnergy(calRange.high)})`, type: 'line', data: calChartTargetHigh, smooth: true, symbol: 'none',
        tooltip: { show: false }, lineStyle: { color: '#f0a060', type: 'dashed', width: 2 } },
    ],
    legend: { show: false },
  });
}

function fmtMonthLabel(monthStr) { // "YYYY-MM"
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function computeCostChartData(weeks) {
  const sortedWeeks = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const weekLabels = sortedWeeks.map(w => w.weekStart);
  const weekCostData = sortedWeeks.map(w => {
    const days = w.days || {};
    return Object.values(days).reduce((s, d) => s + (d.cost || 0), 0);
  });

  const monthTotals = {};
  weeks.forEach(w => {
    const days = w.days || {};
    Object.keys(days).forEach(date => {
      const cost = days[date].cost || 0;
      if (!cost) return;
      const month = date.slice(0, 7);
      monthTotals[month] = (monthTotals[month] || 0) + cost;
    });
  });
  const monthLabels = Object.keys(monthTotals).sort();
  const monthCostData = monthLabels.map(m => Math.round(monthTotals[m] * 100) / 100);

  return { weekLabels, weekCostData, monthLabels, monthCostData };
}

function applyWeeklyCostChartOption({ weekLabels, weekCostData, monthLabels, monthCostData }) {
  if (!window._echartWeeklyCost) return;
  const isMonthly = costChartMode === 'monthly';
  const costChartLabels = isMonthly ? monthLabels : weekLabels;
  const costChartData = isMonthly ? monthCostData : weekCostData;
  const costLabelFmt = isMonthly ? fmtMonthLabel : fmtChartDate;
  window._echartWeeklyCost.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: params => {
        const p = params[0];
        if (isMonthly) return `${fmtMonthLabel(p.axisValue)}<br/>Cost: ${prefs.formatCurrency(p.value || 0)}`;
        const start = new Date(p.axisValue + 'T00:00:00');
        const end = new Date(p.axisValue + 'T00:00:00');
        end.setDate(end.getDate() + 6);
        const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${fmt(start)} – ${fmt(end)}<br/>Cost: ${prefs.formatCurrency(p.value || 0)}`;
      }
    },
    grid: { left: 40, right: 20, top: 20, bottom: 55 },
    xAxis: {
      type: 'category', data: costChartLabels,
      axisLabel: { show: true, interval: 'auto', rotate: 35, fontSize: 10, color: '#7a7f96', formatter: costLabelFmt },
      axisTick: { alignWithLabel: true },
    },
    yAxis: { type: 'value', min: 0, splitLine: { show: false } },
    series: [
      { name: 'Cost', type: 'bar', data: costChartData,
        itemStyle: { color: '#FF6B6B', borderRadius: [6, 6, 0, 0] },
        emphasis: { itemStyle: { color: '#c8f060' } },
        barWidth: '98%' },
    ],
    legend: { show: false },
  });
}

function formatDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDateShort(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isoDate(d) {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${da}`;
}

// ═══════════════════════════════════════════════════════════════════
// HISTORY RENDER
// ═══════════════════════════════════════════════════════════════════
async function renderHistory() {
  const chartBlock = document.getElementById("history-charts-overall");
  if (chartBlock) chartBlock.style.display = "none";

  const container = document.getElementById("history-content");
  container.innerHTML =
    "<div style=\"color:var(--muted);font-family:'DM Mono',monospace;font-size:12px;padding:20px 0;\">Loading...</div>";

  let weeks;
  try {
    weeks = await db.dbGetAll("weeks");
  } catch (e) {
    weeks = [];
  }

  if (!weeks || weeks.length === 0) {
    if (chartBlock) chartBlock.style.display = "none";
    container.innerHTML = '<div class="no-history">No history yet.<br><br>Your daily logs will appear here as you track over time.</div>';
    return;
  }

  let macroTotals = { p: 0, c: 0, f: 0 };
  weeks.forEach(week => {
    const days = week.days || {};
    Object.values(days).forEach(d => {
      if (d.cal > 0 || d.cost > 0) {
        macroTotals.p += d.p || 0;
        macroTotals.c += d.c || 0;
        macroTotals.f += d.f || 0;
      }
    });
  });

  _historyWeeksCache = weeks;
  const calorieChartData = computeCalorieChartData(weeks);
  const costChartData = computeCostChartData(weeks);

  if (chartBlock) {
    chartBlock.style.display = "block";
    if (window._echartCalories) window._echartCalories.dispose();
    if (window._echartWeeklyCost) window._echartWeeklyCost.dispose();
    if (window._echartMacros) window._echartMacros.dispose();

    function resizeECharts(chart, dom) {
      if (!chart || !dom) return;
      setTimeout(() => chart.resize(), 0);
      window.addEventListener('resize', () => chart.resize(), { passive: true });
    }

    const caloriesDom = document.getElementById("chart-calories");
    window._echartCalories = echarts.init(caloriesDom);
    applyCaloriesChartOption(calorieChartData);
    resizeECharts(window._echartCalories, caloriesDom);

    const weekDom = document.getElementById("chart-weekly-cost");
    window._echartWeeklyCost = echarts.init(weekDom);
    applyWeeklyCostChartOption(costChartData);
    resizeECharts(window._echartWeeklyCost, weekDom);

    const macrosDom = document.getElementById("chart-macros");
    window._echartMacros = echarts.init(macrosDom);
    window._echartMacros.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
      series: [{
        name: 'Macros', type: 'pie', radius: ['55%', '80%'], avoidLabelOverlap: true,
        label: { show: false }, emphasis: { label: { show: false } }, labelLine: { show: false },
        data: [
          { value: macroTotals.p, name: 'Protein', itemStyle: { color: '#60f0a0' } },
          { value: macroTotals.c, name: 'Carbs', itemStyle: { color: '#f0d060' } },
          { value: macroTotals.f, name: 'Fat', itemStyle: { color: '#f09060' } },
        ]
      }],
      legend: {
        show: true, type: 'scroll', orient: 'vertical', right: 0, bottom: 0,
        textStyle: { color: 'var(--text)', fontWeight: 'normal', fontSize: 12, textBorderColor: 'rgba(0,0,0,0.25)', textBorderWidth: 2 },
      },
    });
    resizeECharts(window._echartMacros, macrosDom);
  }

  weeks.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const monthMap = {};
  weeks.forEach((week) => {
    const weekEndDate = new Date(week.weekStart + "T00:00:00");
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const startMonth = week.weekStart.slice(0, 7);
    const endMonth = isoDate(weekEndDate).slice(0, 7);
    const crossMonth = endMonth !== startMonth;

    if (!monthMap[startMonth]) monthMap[startMonth] = [];
    const endMonthShort = crossMonth
      ? new Date(endMonth + '-01T00:00:00').toLocaleString("en-US", { month: "short" })
      : null;
    monthMap[startMonth].push({ week, displayMonth: startMonth, isPartial: crossMonth, badge: crossMonth ? `↓ into ${endMonthShort}` : null });

    if (crossMonth) {
      const startMonthShort = new Date(week.weekStart + "T00:00:00").toLocaleString("en-US", { month: "short" });
      if (!monthMap[endMonth]) monthMap[endMonth] = [];
      monthMap[endMonth].push({ week, displayMonth: endMonth, isPartial: true, badge: `↑ from ${startMonthShort}` });
    }
  });

  container.innerHTML = "";

  const monthKeys = Object.keys(monthMap).sort((a, b) => b.localeCompare(a));
  monthKeys.forEach((month) => {
    const monthWeeks = monthMap[month];
    let mStats = { days: 0, totalCal: 0, totalCost: 0, inRangeDays: 0, totalProtein: 0, totalCarb: 0, totalFat: 0 };
    monthWeeks.forEach(({ week: wk, displayMonth }) => {
      const days = wk.days || {};
      Object.entries(days).forEach(([date, day]) => {
        if (!date.startsWith(displayMonth)) return;
        if (day.cal > 0 || day.cost > 0) {
          mStats.days++;
          mStats.totalCal += day.cal || 0;
          mStats.totalCost += day.cost || 0;
          mStats.totalProtein += day.p || 0;
          mStats.totalCarb += day.c || 0;
          mStats.totalFat += day.f || 0;
          const dayCalLow = day.calLow ?? calRange.low;
          const dayCalHigh = day.calHigh ?? calRange.high;
          if (day.cal >= dayCalLow && day.cal <= dayCalHigh) mStats.inRangeDays++;
        }
      });
    });
    const [mYr, mMo] = month.split("-").map(Number);
    const todayMonth = todayStr().slice(0, 7);
    const totalDays = month === todayMonth
      ? parseInt(todayStr().slice(8, 10))
      : new Date(mYr, mMo, 0).getDate();

    const monthBlock = document.createElement("div");
    monthBlock.className = "month-block";
    const monthLabel = new Date(month + "-01T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" });
    monthBlock.innerHTML = `
      <div class="month-block-inner" style="
        border:1.5px solid var(--border);
        border-radius:12px;
        background:var(--bg2);
        box-shadow:0 1px 4px rgba(0,0,0,0.03);
        margin-bottom:18px;
        font-family:'DM Mono',monospace;
        overflow:hidden;
      ">
        <div class="month-header week-header" style="
          cursor:pointer;user-select:none;
          padding:16px 18px 12px 18px;
          border-bottom-right-radius: 0px;
          border-bottom-left-radius: 0px;
          background: var(--surface);
          display:flex;align-items:flex-start;gap:8px;flex-direction:column;
          font-family:'DM Mono',monospace;
        " data-month="${month}">
          <div class="month-header-label-row" style="display:flex;align-items:center;gap:10px;width:100%;justify-content:space-between;">
            <div class="month-label" style="font-size:16px;font-weight:700;letter-spacing:0.01em;color:var(--fg);font-family:'Syne', sans-serif,monospace;">${monthLabel}</div>
            <div class="month-chevron week-chevron" style="color:var(--muted);font-size:20px;transition:transform 0.2s;font-family:'DM Mono',monospace;">▼</div>
          </div>
          <div class="month-stats-scroll" style="position:relative;overflow-x:auto;width:100%;margin-top:2px;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
            <table style="margin-top:6px;font-size:12px;color:var(--muted);border-collapse:collapse;font-family:'DM Mono',monospace;min-width:500px;width:max-content;">
              <thead>
                <tr style="text-transform:uppercase;font-size:11px">
                  <th style="padding-right:18px;text-align:left;font-weight:500;">logged</th>
                  <th style="padding-right:18px;text-align:left;font-weight:500;">${prefs.getEnergyUnitSync()}/day</th>
                  <th style="padding-right:18px;text-align:left;font-weight:500;">${prefs.getCurrencySymbol()}/day</th>
                  <th style="padding-right:18px;text-align:left;font-weight:500;">Hit rate</th>
                  <th style="padding-right:18px;text-align:left;font-weight:500;">protein/day</th>
                  <th style="padding-right:18px;text-align:left;font-weight:500;">carbs/day</th>
                  <th style="text-align:left;font-weight:500;">fat/day</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding-right:18px;"><strong style="color:var(--muted);font-weight:600;">${mStats.days}</strong><span style="color:var(--muted);opacity:0.5;">/${totalDays} days</span></td>
                  <td style="padding-right:18px;">~<strong style="color:var(--protein);font-weight:600;">${mStats.days ? Math.round(prefs.kcalToDisplayUnit(mStats.totalCal / mStats.days, prefs.getEnergyUnitSync())) : 0}</strong></td>
                  <td style="padding-right:18px;">~<strong style="color:var(--accent);font-weight:600;">${prefs.formatCurrency(mStats.days ? mStats.totalCost / mStats.days : 0)}</strong></td>
                  <td style="padding-right:18px;">~<strong style="color:var(--protein);font-weight:600;">${mStats.days ? Math.round((mStats.inRangeDays / mStats.days) * 100) : 0}%</strong></td>
                  <td style="padding-right:18px;">~<strong style="color:var(--protein);font-weight:600;">${mStats.days ? Math.round(mStats.totalProtein / mStats.days) : 0}g</strong></td>
                  <td style="padding-right:18px;">~<strong style="color:var(--carbs);font-weight:600;">${mStats.days ? Math.round(mStats.totalCarb / mStats.days) : 0}g</strong></td>
                  <td>~<strong style="color:var(--fat);font-weight:600;">${mStats.days ? (mStats.totalFat / mStats.days).toFixed(1) : 0}g</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="month-weeks" style="display:none; margin-top: 12px;"></div>
      </div>
    `;

    const weeksContainer = monthBlock.querySelector('.month-weeks');
    monthWeeks.sort((a, b) => b.week.weekStart.localeCompare(a.week.weekStart));
    monthWeeks.forEach(({ week: wk, displayMonth, isPartial, badge }) => {
      const days = wk.days || {};
      const dayDates = Object.keys(days)
        .filter(d => !isPartial || d.startsWith(displayMonth))
        .sort((a, b) => b.localeCompare(a));
      if (dayDates.length === 0) return;

      const weekTotal = dayDates.reduce((s, d) => s + (days[d].cost || 0), 0);
      const weekCal = dayDates.reduce((s, d) => s + (days[d].cal || 0), 0);
      const avgCal = dayDates.length > 0 ? Math.round(weekCal / dayDates.length) : 0;
      const weekEnd = (() => {
        const d = new Date(wk.weekStart + "T00:00:00");
        d.setDate(d.getDate() + 6);
        return isoDate(d);
      })();
      const block = document.createElement("div");
      block.className = "week-block";
      const isCurrentWeek = wk.weekStart === weekStartFor(todayStr());
      block.innerHTML = `
        <div class="week-header" onclick="window.toggleWeek(this)">
        <div class="week-header-left">
            <div class="week-label">${formatDateShort(wk.weekStart)} – ${formatDateShort(weekEnd)} ${badge ? `<span class="partial-week-badge">${badge}</span>` : ""}${isCurrentWeek ? "<div style=\"font-size:10px;\"><span style=\"color:var(--accent);font-size:10px;font-family:'DM Mono', sans-serif;\">current</span></div>" : ""}</div>
            <div class="week-days-logged">${dayDates.length} day(s) logged${isPartial ? " this month" : ""}</div>
        </div>
        <div class="week-header-right">
            <div class="week-summary-stat">avg <span>${prefs.formatEnergy(avgCal)}</span>/day</div>
            <div class="week-summary-stat">total <span class="wcost">${prefs.formatCurrency(weekTotal)}</span></div>
            <div class="week-chevron">▼</div>
        </div>
        </div>
        <div class="week-days">
        <table class="days-table">
            <thead>
            <tr>
                <th>Date</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Cost</th>
            </tr>
            </thead>
            <tbody>
        ${dayDates
          .map((d) => {
            const day = days[d];
            const dayCalLow = day.calLow ?? calRange.low;
            const dayCalHigh = day.calHigh ?? calRange.high;
            const inRange = day.cal >= dayCalLow && day.cal <= dayCalHigh;
            const rangeLabel = day.cal === 0 ? "" : inRange
              ? '<br><span class="in-range">✓ in range</span>'
              : '<br><span class="out-range">⚠ out</span>';
            return `<tr class="day-row" onclick="window.openDayDetail('${d}')">
              <td><span class="day-date">${formatDate(d)}</span>${rangeLabel}</td>
              <td class="day-cal">${prefs.formatEnergy(day.cal)}</td>
              <td class="day-p">${Math.round(day.p)}g</td>
              <td class="day-c">${Math.round(day.c)}g</td>
              <td class="day-f">${day.f ? day.f.toFixed(1) : 0}g</td>
              <td class="day-cost">${prefs.formatCurrency(day.cost || 0)}</td>
            </tr>`;
          })
          .join("")}
            <tr class="week-total-row">
              <td class="week-total-label">${isPartial ? "Month Portion" : "Week Total"}</td>
              <td class="day-cal">${prefs.formatEnergy(weekCal)}</td>
              <td class="day-p">${Math.round(dayDates.reduce((s, d) => s + (days[d].p || 0), 0))}g</td>
              <td class="day-c">${Math.round(dayDates.reduce((s, d) => s + (days[d].c || 0), 0))}g</td>
              <td class="day-f">${dayDates.reduce((s, d) => s + (days[d].f || 0), 0).toFixed(1)}g</td>
              <td class="day-cost">${prefs.formatCurrency(weekTotal)}</td>
            </tr>
            </tbody>
        </table>
        </div>`;
      if (isCurrentWeek) block.classList.add("open");
      weeksContainer.appendChild(block);
    });
    container.appendChild(monthBlock);
  });

  const allMonthBlocks = container.querySelectorAll('.month-block');
  allMonthBlocks.forEach((mb, i) => {
    const header = mb.querySelector('.month-header');
    const weeksEl = mb.querySelector('.month-weeks');
    header.addEventListener('click', () => {
      allMonthBlocks.forEach((other, j) => {
        const otherWeeks = other.querySelector('.month-weeks');
        const otherChevron = other.querySelector('.month-chevron');
        if (i === j) {
          const open = otherWeeks.style.display === 'block';
          otherWeeks.style.display = open ? 'none' : 'block';
          otherChevron.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
        } else {
          otherWeeks.style.display = 'none';
          otherChevron.style.transform = 'rotate(0deg)';
        }
      });
    });
    weeksEl.style.display = 'none';
    const chevron = mb.querySelector('.month-chevron');
    chevron.style.transform = 'rotate(0deg)';
  });

  const scrollBlocks = container.querySelectorAll('.month-stats-scroll');
  scrollBlocks.forEach(block => {
    block.style.scrollbarWidth = 'none';
    block.style.msOverflowStyle = 'none';
    block.style.overflowY = 'hidden';
    block.classList.add('hide-scrollbar');
  });
}

window.toggleWeek = function (header) {
  header.parentElement.classList.toggle("open");
};

// ═══════════════════════════════════════════════════════════════════
// DAY DETAIL MODAL — "what did I eat" breakdown for a single day.
// Footer totals come from the "weeks" store entry already shown on the row
// (never re-summed from loggedItems), so they can never drift from what
// History already displays elsewhere. Item detail comes from the "days"
// store's loggedItems snapshot, which is undefined for days logged before
// this feature existed.
// ═══════════════════════════════════════════════════════════════════
function ensureDayDetailModal() {
  if (!document.getElementById("day-detail-modal")) {
    const el = document.createElement("div");
    el.id = "day-detail-modal";
    el.className = "pg-modal";
    el.addEventListener("click", (e) => {
      if (e.target === el) el.classList.remove("open");
    });
    document.body.appendChild(el);
  }
}

window.openDayDetail = async function (dateStr) {
  let summary = null;
  try {
    const week = await db.dbGet("weeks", weekStartFor(dateStr));
    summary = week && week.days ? week.days[dateStr] : null;
  } catch (e) {
    summary = null;
  }
  if (!summary) return;

  let day = null;
  try {
    day = await db.dbGet("days", dateStr);
  } catch (e) {
    day = null;
  }

  const dayCalLow = summary.calLow ?? calRange.low;
  const dayCalHigh = summary.calHigh ?? calRange.high;
  const inRange = summary.cal >= dayCalLow && summary.cal <= dayCalHigh;
  const rangeBadge = summary.cal === 0 ? "" : inRange
    ? '<span class="in-range">✓ in range</span>'
    : '<span class="out-range">⚠ out</span>';

  const loggedItems = day && day.loggedItems;
  const bodyHTML = loggedItems && loggedItems.length
    ? loggedItems
        .map(
          (item) => `
        <div class="day-detail-item">
          <div class="day-detail-item-top">
            <span class="day-detail-item-name">${esc(item.name)}</span>
            <span class="day-detail-item-servings">${item.servings}× serving${item.servings === 1 ? "" : "s"}</span>
          </div>
          <div class="day-detail-item-macros">
            <span class="im-cal">${prefs.formatEnergy(item.cal)}</span> ·
            <span class="im-p">P ${Math.round(item.p)}g</span> ·
            <span class="im-c">C ${Math.round(item.c)}g</span> ·
            <span class="im-f">F ${item.f.toFixed(1)}g</span> ·
            <span class="day-detail-item-cost">${prefs.formatCurrency(item.cost || 0)}</span>
          </div>
        </div>`
        )
        .join("")
    : `<p class="day-detail-unavailable">Detailed breakdown not available for entries logged before this feature.</p>`;

  ensureDayDetailModal();
  const modal = document.getElementById("day-detail-modal");
  modal.innerHTML = `
    <div class="pg-modal-box pg-modal-box-lg">
      <div class="pg-modal-header">
        <div>
          <div class="pg-modal-title">${formatDate(dateStr)}</div>
          <div class="pg-modal-subtitle">${rangeBadge}</div>
        </div>
        <button class="pg-close-btn" onclick="document.getElementById('day-detail-modal').classList.remove('open')">×</button>
      </div>
      <div class="pg-modal-body">${bodyHTML}</div>
      <div class="pg-modal-footer day-detail-footer">
        <div class="day-detail-totals">
          <span class="im-cal">${prefs.formatEnergy(summary.cal)}</span> ·
          <span class="im-p">P ${Math.round(summary.p)}g</span> ·
          <span class="im-c">C ${Math.round(summary.c)}g</span> ·
          <span class="im-f">F ${(summary.f || 0).toFixed(1)}g</span> ·
          <span class="day-detail-item-cost">${prefs.formatCurrency(summary.cost || 0)}</span>
        </div>
      </div>
    </div>
  `;
  modal.classList.add("open");
};

window.toggleStatsAccordion = function () {
  const wrap = document.getElementById("history-charts-overall");
  wrap.classList.toggle("open");
  if (wrap.classList.contains("open")) {
    setTimeout(() => {
      if (window._echartCalories) window._echartCalories.resize();
      if (window._echartWeeklyCost) window._echartWeeklyCost.resize();
      if (window._echartMacros) window._echartMacros.resize();
    }, 50);
  }
};

window.histSetCalChartMode = function (mode) {
  if (mode !== "daily" && mode !== "weekly") return;
  calChartMode = mode;
  document.getElementById("hist-cal-toggle-daily")?.classList.toggle("active", mode === "daily");
  document.getElementById("hist-cal-toggle-weekly")?.classList.toggle("active", mode === "weekly");
  const titleEl = document.getElementById("hist-cal-title");
  if (titleEl) titleEl.textContent = mode === "weekly" ? "Calories per Week" : "Calories per Day";
  if (window._echartCalories && _historyWeeksCache) {
    applyCaloriesChartOption(computeCalorieChartData(_historyWeeksCache));
  } else {
    renderHistory();
  }
};

window.histSetCostChartMode = function (mode) {
  if (mode !== "weekly" && mode !== "monthly") return;
  costChartMode = mode;
  document.getElementById("hist-cost-toggle-weekly")?.classList.toggle("active", mode === "weekly");
  document.getElementById("hist-cost-toggle-monthly")?.classList.toggle("active", mode === "monthly");
  const titleEl = document.getElementById("hist-cost-title");
  if (titleEl) titleEl.textContent = mode === "monthly" ? "Monthly Cost" : "Weekly Cost";
  if (window._echartWeeklyCost && _historyWeeksCache) {
    applyWeeklyCostChartOption(computeCostChartData(_historyWeeksCache));
  } else {
    renderHistory();
  }
};

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════
async function exportHistory(format) {
  document.querySelector(".export-dropdown")?.classList.remove("open");
  if (!await showConfirm(`Export history as ${format.toUpperCase()}?`, 'Export')) return;

  let allDays;
  try {
    allDays = await db.dbGetAll("days");
  } catch (e) {
    allDays = [];
  }
  if (!allDays || allDays.length === 0) {
    alert("No history to export.");
    return;
  }
  allDays.sort((a, b) => a.date.localeCompare(b.date));

  const timestamp = todayStr();
  let content, mime, filename;

  // Exports always use kcal (canonical storage unit), regardless of the
  // display setting, so files stay portable and unambiguous.
  if (format === "json") {
    const exportData = allDays.map(({ date, cal, p, c, f, cost }) => ({ date, calories_kcal: Math.round(cal), protein_g: p, carbs_g: c, fat_g: f, cost }));
    content = JSON.stringify(exportData, null, 2);
    mime = "application/json";
    filename = `Nawtch-history-${timestamp}.json`;
  } else {
    const rows = [["date", "calories_kcal", "protein_g", "carbs_g", "fat_g", "cost"]];
    allDays.forEach(({ date, cal, p, c, f, cost }) => {
      rows.push([date, Math.round(cal), Math.round(p), Math.round(c), f.toFixed(1), cost.toFixed(2)]);
    });
    content = rows.map(r => r.join(",")).join("\n");
    mime = "text/csv";
    filename = `Nawtch-history-${timestamp}.csv`;
  }

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportHistory = exportHistory;

window.toggleExportDropdown = function (e) {
  e.stopPropagation();
  const dd = e.currentTarget.closest(".export-dropdown");
  const wasOpen = dd.classList.contains("open");
  document.querySelectorAll(".export-dropdown.open").forEach(el => el.classList.remove("open"));
  if (!wasOpen) dd.classList.add("open");
};

document.addEventListener("click", () => {
  document.querySelectorAll(".export-dropdown.open").forEach(el => el.classList.remove("open"));
});

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
async function init() {
  await db.openDB();
  calRange = await prefs.getCalRange();
  await prefs.getEnergyUnit();
  await prefs.getCurrency();
  await renderHistory();
}

init();
