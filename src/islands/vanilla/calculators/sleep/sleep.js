import { showAlert } from "../../../../lib/ui.js";
import "../../../../lib/nav.js";
import "../../../../lib/settingsHint.js";

// Average time it takes a healthy adult to actually fall asleep after going
// to bed ("sleep onset latency"). Commonly cited as roughly 10-20 minutes;
// we use 15 as the midpoint, matching most published sleep-cycle calculators.
const SLEEP_ONSET_MIN = 15;
// Average length of one full sleep cycle, in minutes (NINDS: 90-110 minutes).
const CYCLE_MIN = 90;
const CYCLE_OPTIONS = [4, 5, 6];
const MIN_PER_DAY = 24 * 60;

let mode = "wake"; // "wake" = "I want to wake up at", "bed" = "I'm going to bed at"
let timeVal = ""; // HH:MM from a <input type="time">
let results = null; // array of { cycles, hours, clockMinutes }

function parseTimeToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function formatClock(totalMinutes) {
  const minutes = mod(totalMinutes, MIN_PER_DAY);
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// Pure calc: given an anchor time (wake time or bedtime, in minutes-of-day)
// and the mode, return the suggested bedtimes/wake times for 4/5/6 cycles.
function computeSleepTimes(anchorMinutes, calcMode) {
  return CYCLE_OPTIONS.map((cycles) => {
    const sleepMin = cycles * CYCLE_MIN;
    const clockMinutes =
      calcMode === "wake"
        ? anchorMinutes - SLEEP_ONSET_MIN - sleepMin
        : anchorMinutes + SLEEP_ONSET_MIN + sleepMin;
    return { cycles, hours: sleepMin / 60, clockMinutes };
  });
}

function renderSleepTab() {
  const el = document.getElementById("calc-sleep");
  const isWake = mode === "wake";
  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Sleep Cycle Calculator</h2>
      <div class="settings-section-body">
        <div class="wt-toggle" style="margin-bottom:14px;">
          <button class="wt-toggle-btn ${isWake ? "active" : ""}" onclick="window.calcSleepSetMode('wake')">I want to wake up at&hellip;</button>
          <button class="wt-toggle-btn ${!isWake ? "active" : ""}" onclick="window.calcSleepSetMode('bed')">I'm going to bed at&hellip;</button>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">${isWake ? "Wake-up time" : "Bedtime"}</span>
            <input type="time" id="calc-sleep-time" value="${timeVal}" oninput="window.calcSleepSetTime(this.value)" />
          </div>
        </div>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcRunSleep()">Calculate</button>
      </div>
    </div>
    ${results !== null ? renderSleepResults() : ""}
  `;
}

function renderSleepResults() {
  const isWake = mode === "wake";
  const cardsHTML = results
    .map(
      (r) => `
      <div class="total-card">
        <div class="val">${formatClock(r.clockMinutes)}</div>
        <div class="lbl">${r.cycles} cycles</div>
        <div class="sub">${r.hours}h of sleep</div>
      </div>
    `
    )
    .join("");
  return `
    <div class="settings-section">
      <div class="settings-section-title">${isWake ? "Suggested Bedtimes" : "Suggested Wake-Up Times"}</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:repeat(3, 1fr);">
          ${cardsHTML}
        </div>
        <p class="field-hint" style="margin:0;">Based on ~90-minute sleep cycles and about 15 minutes to fall asleep. Waking up at the end of a cycle (rather than mid-cycle) tends to feel less groggy.</p>
      </div>
    </div>
  `;
}

window.calcSleepSetMode = function (m) {
  if (m === mode) return;
  mode = m;
  results = null;
  renderSleepTab();
};

window.calcSleepSetTime = function (v) {
  timeVal = v;
};

window.calcRunSleep = function () {
  const anchorMinutes = parseTimeToMinutes(timeVal);
  if (anchorMinutes === null) {
    return showAlert("Missing Info", "Enter a valid time to calculate.");
  }
  results = computeSleepTimes(anchorMinutes, mode);
  renderSleepTab();
};

renderSleepTab();
