// Shared nav highlighting — recomputes which nav link is "active" fresh on
// every page load from the current URL, instead of relying on in-memory SPA
// state. Every page now lives at its own index.html (e.g. /foods/index.html),
// so "active" can't be matched by filename anymore — every page's filename is
// identical. Instead each nav/footer link carries a stable data-page
// attribute, and we work out the current page from the URL's folder segment.
const KNOWN_PAGES = ['foods', 'weight', 'programs', 'history', 'settings', 'guides', 'calculators', 'diets', 'tools', 'supplements', 'privacy', 'terms'];

export function currentPage() {
  const segments = location.pathname.split('/').filter(Boolean);
  for (const seg of segments) {
    if (KNOWN_PAGES.includes(seg)) return seg;
  }
  return 'today'; // root index.html, or nothing matched
}

export function initNav() {
  const here = currentPage();
  document.querySelectorAll('.nav-tab, .footer-settings-btn').forEach((link) => {
    const isActive = link.dataset.page === here;
    link.classList.toggle('active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

initNav();
