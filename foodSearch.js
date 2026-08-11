// Shared OpenFoodFacts text search — used by the Bowl Builder's food search
// box. Barcode-specific lookup lives in barcode.js (scanning mechanics); this
// module only covers searching by name, always normalizing results to
// per-100g macros so callers can scale by whatever portion the user enters.

// ═══════════════════════════════════════════════════════════════════
// SEARCH RATE LIMITING — OFF's own docs cap search endpoints (cgi/search.pl,
// api/v*/search) at 10 requests/min/IP and explicitly warn against using it
// for search-as-you-type. Same shape as barcode.js's lookup limiter, with a
// small safety margin under that cap: if 8 requests land within any rolling
// 60s window, lock out searching for 5 minutes before granting another batch
// of 8. Persisted to localStorage so a page refresh can't dodge the lockout.
// The caller (bowl-builder.js) also waits for a real pause in typing (3s)
// before firing a request at all, so normal use stays well under the cap.
// ═══════════════════════════════════════════════════════════════════
const SEARCH_RATE_LIMIT = 8;
const SEARCH_RATE_WINDOW_MS = 60 * 1000;
const SEARCH_LOCKOUT_MS = 5 * 60 * 1000;
const SEARCH_RATE_LS_KEY = 'mp_foodsearch_ratelimit_v1';

let _searchRequestTimes = [];
let _searchLockoutUntil = 0;

(function loadSearchRateLimitState() {
  try {
    const saved = JSON.parse(localStorage.getItem(SEARCH_RATE_LS_KEY));
    if (saved) {
      _searchRequestTimes = Array.isArray(saved.requestTimes) ? saved.requestTimes : [];
      _searchLockoutUntil = saved.lockoutUntil || 0;
    }
  } catch (e) {}
})();

function saveSearchRateLimitState() {
  try {
    localStorage.setItem(SEARCH_RATE_LS_KEY, JSON.stringify({
      requestTimes: _searchRequestTimes,
      lockoutUntil: _searchLockoutUntil,
    }));
  } catch (e) {}
}

function searchRateLimitWaitMs() {
  const now = Date.now();
  if (_searchLockoutUntil && now >= _searchLockoutUntil) {
    _searchLockoutUntil = 0;
    _searchRequestTimes = [];
    saveSearchRateLimitState();
  }
  if (_searchLockoutUntil) return _searchLockoutUntil - now;
  return 0;
}

function parseServingGrams(servingSize) {
  if (!servingSize) return null;
  const match = servingSize.match(/(\d+(?:\.\d+)?)\s*g/i);
  return match ? parseFloat(match[1]) : null;
}

// Always resolves to per-100g figures — from the 100g fields directly when
// present, otherwise scaled up from per-serving using a parsed gram serving
// size. Returns null if neither is usable (e.g. serving size given in an
// unparseable unit like "1 cup").
function per100gFromProduct(product) {
  const n = product.nutriments || {};
  if (n['energy-kcal_100g'] != null || n['proteins_100g'] != null) {
    return {
      cal: Math.round(n['energy-kcal_100g'] || 0),
      p: Math.round((n['proteins_100g'] || 0) * 10) / 10,
      c: Math.round((n['carbohydrates_100g'] || 0) * 10) / 10,
      f: Math.round((n['fat_100g'] || 0) * 10) / 10,
    };
  }
  const servingG = parseServingGrams(product.serving_size);
  if (!servingG || n['energy-kcal_serving'] == null) return null;
  const mult = 100 / servingG;
  return {
    cal: Math.round((n['energy-kcal_serving'] || 0) * mult),
    p: Math.round((n['proteins_serving'] || 0) * mult * 10) / 10,
    c: Math.round((n['carbohydrates_serving'] || 0) * mult * 10) / 10,
    f: Math.round((n['fat_serving'] || 0) * mult * 10) / 10,
  };
}

// Session-level cache so re-searching the same term doesn't re-hit the API.
const _searchCache = new Map();

export async function searchFoods(query) {
  const key = query.trim().toLowerCase();
  if (!key) return [];
  if (_searchCache.has(key)) return _searchCache.get(key);

  const waitMs = searchRateLimitWaitMs();
  if (waitMs > 0) {
    const waitMin = Math.ceil(waitMs / 60000);
    const err = new Error(`You must wait about ${waitMin} minute${waitMin === 1 ? '' : 's'} before searching again.`);
    err.isRateLimit = true;
    throw err;
  }
  const now = Date.now();
  _searchRequestTimes.push(now);
  _searchRequestTimes = _searchRequestTimes.filter((t) => now - t < SEARCH_RATE_WINDOW_MS);
  if (_searchRequestTimes.length >= SEARCH_RATE_LIMIT) {
    _searchLockoutUntil = now + SEARCH_LOCKOUT_MS;
  }
  saveSearchRateLimitState();

  // Note: the v2 REST endpoint (/api/v2/search) silently ignores search_terms
  // and just returns its generic default-order product list — the classic
  // cgi/search.pl endpoint is the one that actually does full-text search.
  // cc=us&lc=en biases results to English-named products sold in the US —
  // without it, results skew toward whatever's most-catalogued on OFF
  // worldwide (often French/European entries with non-English names).
  const resp = await fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=code,product_name,product_name_en,serving_size,nutriments&cc=us&lc=en`
  );
  if (!resp.ok) {
    _searchCache.set(key, []);
    return [];
  }
  const data = await resp.json();
  const products = Array.isArray(data.products) ? data.products : [];

  const results = [];
  for (const product of products) {
    // Prefer the English name explicitly — with lc=en, product_name is
    // usually already English, but product_name_en is the guaranteed source.
    const name = (product.product_name_en || product.product_name || '').trim();
    if (!name) continue;
    const per100g = per100gFromProduct(product);
    if (!per100g) continue;
    results.push({ code: product.code, name, per100g });
  }
  _searchCache.set(key, results);
  return results;
}
