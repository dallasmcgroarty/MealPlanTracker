import { showAlert } from "../../../../lib/ui.js";
import "../../../../lib/nav.js";
import "../../../../lib/settingsHint.js";
import { KG_PER_LB, M_PER_MI, round1 } from "../../../../lib/calculators/calc-shared.js";

const METHODS = [
  { id: "hr", label: "Resting Heart Rate" },
  { id: "cooper", label: "Cooper Run Test" },
  { id: "rockport", label: "Rockport Walk Test" },
];

let activeMethod = "hr"; // 'hr' | 'cooper' | 'rockport'

// Resting Heart Rate method state
let hrAgeVal = "";
let hrSex = null;
let hrRestVal = "";
let hrResult = null; // ml/kg/min

// Cooper 12-Minute Run Test state
let cooperUnit = "mi"; // 'mi' | 'm'
let cooperAgeVal = "";
let cooperSex = null;
let cooperDistanceVal = "";
let cooperResult = null; // ml/kg/min

// ═══════════════════════════════════════════════════════════════════
// AGE/SEX-NORMED FITNESS CATEGORY — shared by all three methods above,
// since they all produce the same ml/kg/min unit. Percentile points (5th/
// 10th/25th/50th/75th/90th/95th) sourced from ACSM's Guidelines for
// Exercise Testing and Prescription (11th ed.), Table 4.7 — see the page's
// "Understanding Your Fitness Category" explain block for the full
// citation and the category-boundary methodology.
// ═══════════════════════════════════════════════════════════════════
const PERCENTILE_POINTS = [5, 10, 25, 50, 75, 90, 95];
const VO2_NORMS = {
  male: {
    "20s": [29.0, 32.1, 40.1, 48.0, 55.2, 61.8, 66.3],
    "30s": [27.2, 30.2, 35.9, 42.4, 49.2, 56.5, 59.8],
    "40s": [24.2, 26.8, 31.9, 37.8, 45.0, 52.1, 55.6],
    "50s": [20.9, 22.8, 27.1, 32.6, 39.7, 45.6, 50.7],
    "60s": [17.4, 19.8, 23.7, 28.2, 34.5, 40.3, 43.0],
    "70s": [16.3, 17.1, 20.4, 24.4, 30.4, 36.6, 39.7],
  },
  female: {
    "20s": [21.7, 23.9, 30.5, 37.6, 44.7, 51.3, 56.0],
    "30s": [19.0, 20.9, 25.3, 30.2, 36.1, 41.4, 45.8],
    "40s": [17.0, 18.8, 22.1, 26.7, 32.4, 38.4, 41.7],
    "50s": [16.0, 17.3, 19.9, 23.4, 27.6, 32.0, 35.9],
    "60s": [13.4, 14.6, 17.2, 20.0, 23.8, 27.0, 29.4],
    "70s": [13.1, 13.6, 15.6, 18.3, 20.8, 23.1, 24.1],
  },
};

function ageBracket(age) {
  if (age < 30) return "20s";
  if (age < 40) return "30s";
  if (age < 50) return "40s";
  if (age < 60) return "50s";
  if (age < 70) return "60s";
  return "70s";
}

// Piecewise-linear interpolation across the 7 published percentile points;
// clamps to 5/95 outside the published range rather than extrapolating.
function estimatePercentile(value, points) {
  if (value <= points[0]) return 5;
  if (value >= points[points.length - 1]) return 95;
  for (let i = 0; i < points.length - 1; i++) {
    if (value <= points[i + 1]) {
      const pLo = PERCENTILE_POINTS[i];
      const pHi = PERCENTILE_POINTS[i + 1];
      const vLo = points[i];
      const vHi = points[i + 1];
      return pLo + ((value - vLo) / (vHi - vLo)) * (pHi - pLo);
    }
  }
  return 95;
}

// ACSM's category bands are percentile ranges, not fixed ml/kg/min cutoffs —
// the same category can mean a different number depending on age/sex bracket.
function categoryForPercentile(pct) {
  if (pct < 20) return "Poor";
  if (pct < 40) return "Fair";
  if (pct < 60) return "Average";
  if (pct < 80) return "Good";
  if (pct < 95) return "Excellent";
  return "Superior";
}

// Inverse of estimatePercentile() — given a target percentile, find the
// ml/kg/min value at that point via the same published points. Used to
// surface the actual category cutoffs (20th/40th/60th/80th/95th) rather
// than just a percentile rank.
function valueAtPercentile(targetPct, points) {
  for (let i = 0; i < PERCENTILE_POINTS.length - 1; i++) {
    const pLo = PERCENTILE_POINTS[i];
    const pHi = PERCENTILE_POINTS[i + 1];
    if (targetPct <= pHi) {
      const vLo = points[i];
      const vHi = points[i + 1];
      return vLo + ((targetPct - pLo) / (pHi - pLo)) * (vHi - vLo);
    }
  }
  return points[points.length - 1];
}

// Non-overlapping whole-number bands per category, derived from the same
// VO2_NORMS points as the bar above — not a second data source.
function categoryRanges(points) {
  const [b20, b40, b60, b80, b95] = [20, 40, 60, 80, 95].map((p) => Math.round(valueAtPercentile(p, points)));
  return [
    { name: "Poor", label: `<${b20}` },
    { name: "Fair", label: `${b20}–${b40 - 1}` },
    { name: "Average", label: `${b40}–${b60 - 1}` },
    { name: "Good", label: `${b60}–${b80 - 1}` },
    { name: "Excellent", label: `${b80}–${b95 - 1}` },
    { name: "Superior", label: `${b95}+` },
  ];
}

function renderBracketTable(sex, bracket, activeCategory) {
  const bracketLabel = bracket === "70s" ? "70+" : bracket;
  const ranges = categoryRanges(VO2_NORMS[sex][bracket]);
  return `
    <p class="settings-desc" style="margin-top:16px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;">
    <strong>
      Your bracket: ${sex === "male" ? "Male" : "Female"}, ${bracketLabel}
      </strong>
    </p>
    <div style="overflow-x:auto;">
    <table class="load-table" style="margin-top:8px;">
      <thead><tr>${ranges.map((r) => `<th>${r.name}</th>`).join("")}</tr></thead>
      <tbody>
        <tr>${ranges.map((r) => `<td class="${r.name === activeCategory ? "vo2-cat-active" : ""}">${r.label}</td>`).join("")}</tr>
      </tbody>
    </table>
    </div>
  `;
}

function renderFullReferenceTable() {
  const brackets = ["20s", "30s", "40s", "50s", "60s", "70s"];
  const sexTable = (sex) => `
    <div style="overflow-x:auto;">
    <table class="load-table" style="margin-top:8px;">
      <thead><tr><th>Age</th><th>Poor</th><th>Fair</th><th>Average</th><th>Good</th><th>Excellent</th><th>Superior</th></tr></thead>
      <tbody>
        ${brackets
          .map((b) => {
            const label = b === "70s" ? "70+" : b;
            const ranges = categoryRanges(VO2_NORMS[sex][b]);
            return `<tr><td>${label}</td>${ranges.map((r) => `<td>${r.label}</td>`).join("")}</tr>`;
          })
          .join("")}
      </tbody>
    </table>
    </div>
  `;
  return `
    <div class="info-banners" style="margin-top:14px;">
      <div class="info-banner">
        <div class="info-banner-header" onclick="this.parentElement.classList.toggle('open')">
          <span class="info-banner-label">See full reference table for all ages</span>
          <span class="info-banner-chevron">▼</span>
        </div>
        <div class="info-banner-body" style="padding:10px 14px 14px;">
          <div style="font-family:'DM Mono',monospace;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Men (ml/kg/min)</div>
          ${sexTable("male")}
          <div style="font-family:'DM Mono',monospace;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin:16px 0 4px;">Women (ml/kg/min)</div>
          ${sexTable("female")}
        </div>
      </div>
    </div>
  `;
}

function renderClassification(vo2, ageVal, sex) {
  const age = parseFloat(ageVal);
  if (!sex || !age || age <= 0) return "";
  const bracket = ageBracket(age);
  const bracketLabel = bracket === "70s" ? "70+" : bracket;
  const points = VO2_NORMS[sex][bracket];
  const pct = estimatePercentile(vo2, points);
  const category = categoryForPercentile(pct);

  return `
    <div class="settings-section">
      <div class="settings-section-title">Fitness Category</div>
      <div class="settings-section-body">
        <p class="settings-desc"><strong>${round1(vo2)} ml/kg/min — ${category}</strong> for your age and sex (${sex}, ${bracketLabel}).</p>
        <div class="vo2-scale">
          <div class="vo2-scale-marker" style="left:${round1(pct)}%;"></div>
        </div>
        <div class="vo2-scale-labels">
          <span>Poor</span><span>Fair</span><span>Average</span><span>Good</span><span>Excellent</span><span>Superior</span>
        </div>
        ${renderBracketTable(sex, bracket, category)}
        ${renderFullReferenceTable()}
        <p class="settings-desc" style="margin-top:12px;font-size:11px;color:var(--muted);">
          These are general population norms, not a personal verdict — individual context like training history and
          health conditions affects where any one person "should" fall on this scale.
        </p>
      </div>
    </div>
  `;
}

// Rockport 1-Mile Walk Test state
let rpUnits = "imperial"; // 'imperial' | 'metric'
let rpSex = null;
let rpAgeVal = "";
let rpWeightVal = "";
let rpTimeVal = ""; // minutes, decimal
let rpHrVal = "";
let rpResult = null; // ml/kg/min

function renderTabs() {
  const el = document.getElementById("vo2-tabs");
  el.innerHTML = `
    <nav class="nav-tabs" style="margin-bottom:16px;flex-wrap:wrap;">
      ${METHODS.map((m) => `<button class="nav-tab ${activeMethod === m.id ? "active" : ""}" onclick="window.calcVo2SetMethod('${m.id}')">${m.label}</button>`).join("")}
    </nav>
  `;
}

function renderPanel() {
  if (activeMethod === "hr") renderHrPanel();
  else if (activeMethod === "cooper") renderCooperPanel();
  else renderRockportPanel();
}

// ═══════════════════════════════════════════════════════════════════
// RESTING HEART RATE METHOD (Tanaka HRmax + Uth-Sørensen-Overgaard-Pedersen)
// ═══════════════════════════════════════════════════════════════════
function renderHrPanel() {
  const el = document.getElementById("vo2-panel");
  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Resting Heart Rate Method</h2>
      <div class="settings-section-body">
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:14px;">
          <div class="field-group">
            <div class="field-label">Sex</div>
            <div class="wt-toggle">
              <button class="wt-toggle-btn ${hrSex === "female" ? "active" : ""}" onclick="window.calcVo2HrSetSex('female')">Female</button>
              <button class="wt-toggle-btn ${hrSex === "male" ? "active" : ""}" onclick="window.calcVo2HrSetSex('male')">Male</button>
            </div>
          </div>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Age</span>
            <input type="number" id="vo2-hr-age" min="10" max="100" step="1" placeholder="30" value="${hrAgeVal}" oninput="window.calcVo2HrSetAge(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Resting Heart Rate (bpm)</span>
            <input type="number" id="vo2-hr-rest" min="30" max="120" step="1" placeholder="60" value="${hrRestVal}" oninput="window.calcVo2HrSetRest(this.value)" />
          </div>
        </div>
        <span class="field-hint" style="display:block;margin-top:10px;">Measure first thing in the morning, lying down, before caffeine, for the most consistent reading.</span>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcVo2HrRun()">Calculate</button>
      </div>
    </div>
    ${
      hrResult !== null
        ? `<div class="settings-section">
      <div class="settings-section-title">Estimated VO2 Max</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:1fr;margin-bottom:0;">
          <div class="total-card">
            <div class="val">${round1(hrResult)}</div>
            <div class="lbl">ml/kg/min</div>
            <div class="sub">resting heart rate method — least precise of the three</div>
          </div>
        </div>
      </div>
    </div>
    ${renderClassification(hrResult, hrAgeVal, hrSex)}`
        : ""
    }
  `;
}

window.calcVo2HrSetSex = function (v) {
  hrSex = v;
  renderPanel();
};
window.calcVo2HrSetAge = function (v) {
  hrAgeVal = v;
};
window.calcVo2HrSetRest = function (v) {
  hrRestVal = v;
};
window.calcVo2HrRun = function () {
  if (!hrSex) return showAlert("Missing Info", "Select your sex to calculate.");
  const age = parseFloat(hrAgeVal);
  const rest = parseFloat(hrRestVal);
  if (!age || age <= 0 || !rest || rest <= 0) {
    return showAlert("Missing Info", "Enter your age and resting heart rate to calculate.");
  }
  const hrMax = 208 - 0.7 * age;
  hrResult = 15.3 * (hrMax / rest);
  renderPanel();
};

// ═══════════════════════════════════════════════════════════════════
// COOPER 12-MINUTE RUN TEST
// ═══════════════════════════════════════════════════════════════════
function renderCooperPanel() {
  const el = document.getElementById("vo2-panel");
  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Cooper 12-Minute Run Test</h2>
      <div class="settings-section-body">
        <p class="settings-desc">Run at maximal, sustained effort for exactly 12 minutes, then enter the total distance you covered.</p>
        <div class="wt-toggle">
          <button class="wt-toggle-btn ${cooperUnit === "mi" ? "active" : ""}" onclick="window.calcVo2CooperSetUnit('mi')">Miles</button>
          <button class="wt-toggle-btn ${cooperUnit === "km" ? "active" : ""}" onclick="window.calcVo2CooperSetUnit('km')">Kilometers</button>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:10px 0 14px;">
          <div class="field-group">
            <div class="field-label">Sex</div>
            <div class="wt-toggle">
              <button class="wt-toggle-btn ${cooperSex === "female" ? "active" : ""}" onclick="window.calcVo2CooperSetSex('female')">Female</button>
              <button class="wt-toggle-btn ${cooperSex === "male" ? "active" : ""}" onclick="window.calcVo2CooperSetSex('male')">Male</button>
            </div>
          </div>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Age</span>
            <input type="number" id="vo2-cooper-age" min="10" max="100" step="1" placeholder="30" value="${cooperAgeVal}" oninput="window.calcVo2CooperSetAge(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Distance Covered (${cooperUnit === "mi" ? "miles" : "km"})</span>
            <input type="number" id="vo2-cooper-distance" min="0" step="0.01" placeholder="${cooperUnit === "mi" ? "1.5" : "2.4"}" value="${cooperDistanceVal}" oninput="window.calcVo2CooperSetDistance(this.value)" />
          </div>
        </div>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcVo2CooperRun()">Calculate</button>
      </div>
    </div>
    ${
      cooperResult !== null
        ? `<div class="settings-section">
      <div class="settings-section-title">Estimated VO2 Max</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:1fr;margin-bottom:0;">
          <div class="total-card">
            <div class="val">${round1(cooperResult)}</div>
            <div class="lbl">ml/kg/min</div>
            <div class="sub">Cooper 12-minute run test</div>
          </div>
        </div>
      </div>
    </div>
    ${renderClassification(cooperResult, cooperAgeVal, cooperSex)}`
        : ""
    }
  `;
}

window.calcVo2CooperSetSex = function (v) {
  cooperSex = v;
  renderPanel();
};
window.calcVo2CooperSetAge = function (v) {
  cooperAgeVal = v;
};
window.calcVo2CooperSetUnit = function (u) {
  if (u === cooperUnit) return;
  const d = parseFloat(cooperDistanceVal);
  if (!isNaN(d)) {
    // mi <-> km via meters-per-mile / 1000 meters-per-km
    cooperDistanceVal = String(round1(u === "km" ? d * (M_PER_MI / 1000) : d / (M_PER_MI / 1000)));
  }
  cooperUnit = u;
  renderPanel();
};
window.calcVo2CooperSetDistance = function (v) {
  cooperDistanceVal = v;
};
window.calcVo2CooperRun = function () {
  if (!cooperSex) return showAlert("Missing Info", "Select your sex to calculate.");
  const age = parseFloat(cooperAgeVal);
  const distanceRaw = parseFloat(cooperDistanceVal);
  if (!age || age <= 0 || !distanceRaw || distanceRaw <= 0) {
    return showAlert("Missing Info", "Enter your age and the distance you covered to calculate.");
  }
  const meters = cooperUnit === "mi" ? distanceRaw * M_PER_MI : distanceRaw * 1000;
  cooperResult = (meters - 504.9) / 44.73;
  renderPanel();
};

// ═══════════════════════════════════════════════════════════════════
// ROCKPORT 1-MILE WALK TEST
// ═══════════════════════════════════════════════════════════════════
function renderRockportPanel() {
  const el = document.getElementById("vo2-panel");
  const weightUnit = rpUnits === "metric" ? "kg" : "lb";

  el.innerHTML = `
    <div class="settings-section">
      <h2 class="settings-section-title">Rockport 1-Mile Walk Test</h2>
      <div class="settings-section-body">
        <p class="settings-desc">Walk one mile as fast as you can without running, then enter your time and heart rate immediately at the finish.</p>
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:10px 0 14px;">
          <div class="wt-toggle">
            <button class="wt-toggle-btn ${rpUnits === "imperial" ? "active" : ""}" onclick="window.calcVo2RpSetUnits('imperial')">Imperial</button>
            <button class="wt-toggle-btn ${rpUnits === "metric" ? "active" : ""}" onclick="window.calcVo2RpSetUnits('metric')">Metric</button>
          </div>
          <div class="field-group" style="margin-top: 6px;">
            <div class="field-label">Sex</div>
            <div class="wt-toggle">
              <button class="wt-toggle-btn ${rpSex === "female" ? "active" : ""}" onclick="window.calcVo2RpSetSex('female')">Female</button>
              <button class="wt-toggle-btn ${rpSex === "male" ? "active" : ""}" onclick="window.calcVo2RpSetSex('male')">Male</button>
            </div>
          </div>
        </div>
        <div class="add-row add-row-2">
          <div class="field-group">
            <span class="field-label">Age</span>
            <input type="number" id="vo2-rp-age" min="10" max="100" step="1" placeholder="30" value="${rpAgeVal}" oninput="window.calcVo2RpSetAge(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Weight (${weightUnit})</span>
            <input type="number" id="vo2-rp-weight" min="0" step="0.1" placeholder="${rpUnits === "metric" ? "70" : "155"}" value="${rpWeightVal}" oninput="window.calcVo2RpSetWeight(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Walk Time (minutes)</span>
            <input type="number" id="vo2-rp-time" min="0" step="0.01" placeholder="13.5" value="${rpTimeVal}" oninput="window.calcVo2RpSetTime(this.value)" />
          </div>
          <div class="field-group">
            <span class="field-label">Ending Heart Rate (bpm)</span>
            <input type="number" id="vo2-rp-hr" min="30" max="220" step="1" placeholder="150" value="${rpHrVal}" oninput="window.calcVo2RpSetHr(this.value)" />
          </div>
        </div>
        <span class="field-hint" style="display:block;margin-top:10px;">Walk time as decimal minutes — e.g. 13.5 for 13 min 30 sec. Take your heart rate immediately upon finishing.</span>
        <button class="add-btn" style="margin-top:16px;" onclick="window.calcVo2RpRun()">Calculate</button>
      </div>
    </div>
    ${
      rpResult !== null
        ? `<div class="settings-section">
      <div class="settings-section-title">Estimated VO2 Max</div>
      <div class="settings-section-body">
        <div class="totals-grid" style="grid-template-columns:1fr;margin-bottom:0;">
          <div class="total-card">
            <div class="val">${round1(rpResult)}</div>
            <div class="lbl">ml/kg/min</div>
            <div class="sub">Rockport 1-mile walk test</div>
          </div>
        </div>
      </div>
    </div>
    ${renderClassification(rpResult, rpAgeVal, rpSex)}`
        : ""
    }
  `;
}

window.calcVo2RpSetUnits = function (u) {
  if (u === rpUnits) return;
  const w = parseFloat(rpWeightVal);
  if (!isNaN(w)) rpWeightVal = String(round1(u === "metric" ? w * KG_PER_LB : w / KG_PER_LB));
  rpUnits = u;
  renderPanel();
};
window.calcVo2RpSetSex = function (v) {
  rpSex = v;
  renderPanel();
};
window.calcVo2RpSetAge = function (v) {
  rpAgeVal = v;
};
window.calcVo2RpSetWeight = function (v) {
  rpWeightVal = v;
};
window.calcVo2RpSetTime = function (v) {
  rpTimeVal = v;
};
window.calcVo2RpSetHr = function (v) {
  rpHrVal = v;
};
window.calcVo2RpRun = function () {
  if (!rpSex) return showAlert("Missing Info", "Select your sex to calculate.");
  const age = parseFloat(rpAgeVal);
  const weightRaw = parseFloat(rpWeightVal);
  const time = parseFloat(rpTimeVal);
  const hr = parseFloat(rpHrVal);
  if (!age || age <= 0 || !weightRaw || weightRaw <= 0 || !time || time <= 0 || !hr || hr <= 0) {
    return showAlert("Missing Info", "Enter your age, weight, walk time, and ending heart rate to calculate.");
  }
  const weightLb = rpUnits === "metric" ? weightRaw / KG_PER_LB : weightRaw;
  const sexVal = rpSex === "male" ? 1 : 0;
  rpResult = 132.853 - 0.0769 * weightLb - 0.3877 * age + 6.315 * sexVal - 3.2649 * time - 0.1565 * hr;
  renderPanel();
};

// ═══════════════════════════════════════════════════════════════════
// TAB SWITCHING — also toggles the three static, crawler-visible
// "How We Calculate This" explain blocks in the page HTML.
// ═══════════════════════════════════════════════════════════════════
window.calcVo2SetMethod = function (m) {
  activeMethod = m;
  renderTabs();
  renderPanel();
  METHODS.forEach((method) => {
    const explain = document.getElementById(`vo2-explain-${method.id}`);
    if (explain) explain.style.display = method.id === m ? "" : "none";
  });
};

renderTabs();
renderPanel();
