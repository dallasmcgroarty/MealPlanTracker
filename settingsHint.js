// One-time nudge toward the Settings button: 15s after the user confirms the
// welcome modal, a small accent-colored arrow appears above the footer gear
// icon and bounces until they visit Settings, then never shows again.
//
// This is a real multi-page app (full reloads, no client-side router), so a
// plain setTimeout can't carry the 15s wait across navigations. Instead the
// "welcome confirmed" moment is persisted as a timestamp (prefs.js), and every
// page independently works out how much of the 15s is left (or whether it has
// already elapsed) from that timestamp — so the countdown survives however
// many pages the user visits in between, which is what makes this "global."
import * as db from "./db.js";
import * as prefs from "./prefs.js";
import { currentPage } from "./nav.js";

const HINT_DELAY_MS = 15000;

function showArrow() {
  if (document.getElementById('settings-hint-arrow')) return;
  const footerBtn = document.querySelector('.footer-settings-btn');
  if (!footerBtn) return;
  const arrow = document.createElement('div');
  arrow.id = 'settings-hint-arrow';
  arrow.className = 'settings-hint-arrow';
  arrow.textContent = '↓';
  footerBtn.appendChild(arrow);
}

function removeArrow() {
  document.getElementById('settings-hint-arrow')?.remove();
}

async function syncArrow() {
  // Landing on Settings at all — whether via the button or a direct URL —
  // satisfies "clicked the settings button and loaded the settings page."
  if (currentPage() === 'settings') {
    await prefs.setSettingsVisited();
    return;
  }

  if (await prefs.getSettingsVisited()) {
    removeArrow(); // covers a bfcache-restored page that still had it showing
    return;
  }

  const startedAt = await prefs.getJourneyStartedAt();
  if (!startedAt) return; // welcome modal hasn't been confirmed yet

  const remaining = HINT_DELAY_MS - (Date.now() - startedAt);
  if (remaining <= 0) {
    showArrow();
    return;
  }
  setTimeout(async () => {
    if (!(await prefs.getSettingsVisited())) showArrow();
  }, remaining);
}

async function initSettingsHint() {
  await db.openDB();
  await syncArrow();
}

// Navigating with the browser/back-forward buttons (including a page that
// calls history.back() itself) often restores the previous page straight
// from the back-forward cache instead of reloading it — no script re-runs,
// so a Today page left mid-hint would otherwise keep showing a stale arrow
// forever even after Settings has since been visited. Re-sync on restore.
window.addEventListener('pageshow', async (e) => {
  if (!e.persisted) return;
  await db.openDB();
  await syncArrow();
});

initSettingsHint();
