// Shared date helpers — used by any page that deals with "today" or week buckets
// (Today, History, Weight). Kept separate from items.js so pages that don't
// touch the food catalog (Weight, History) don't need to pull that in too.

function isoDate(d) {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${da}`;
}

export function todayStr() {
  return isoDate(new Date());
}

export function weekStartFor(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return isoDate(d);
}

// Whole-day difference (b - a) in days, e.g. daysBetween(today, targetDate)
// for a countdown or daysBetween(startDate, endDate) for elapsed time.
export function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA + "T00:00:00");
  const b = new Date(dateStrB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
