import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Isolated render review: no browser storage or external services are touched.
const reviewStorage = new Map();
globalThis.localStorage = {
  getItem: key => reviewStorage.get(key) ?? null,
  setItem: (key, value) => reviewStorage.set(key, value),
  removeItem: key => reviewStorage.delete(key),
};
reviewStorage.set('keepnet:v2:live', JSON.stringify({
  name: 'Review Angler', unitSystem: 'imperial', subscriptionTier: 'lite',
  sessions: [{ id: 'review-session', venueId: 'review-venue', venueName: 'Review Water', lat: 53, lon: -2, startedAt: '2026-10-04T10:00:00Z', endedAt: '2026-10-04T14:00:00Z' }],
  catches: [
    { id: 'review-catch', sessionId: 'review-session', species: 'Pike', weightLb: 4, weightOz: 2, bait: 'Lure', caughtAt: '2026-10-04T12:00:00Z' },
    { id: 'pike-best', sessionId: 'review-session', species: ' pike ', weightLb: 8, weightOz: 0, bait: 'Lure', caughtAt: '2026-10-04T13:00:00Z' },
    { id: 'carp-best', sessionId: 'review-session', species: 'Carp', weightLb: 12, weightOz: 5, bait: 'Boilie', caughtAt: '2026-10-04T13:30:00Z' },
    { id: 'unweighed', sessionId: 'review-session', species: 'Perch', weightLb: 0, weightOz: 0, bait: 'Worm', caughtAt: '2026-10-04T13:40:00Z' },
  ],
}));
const server = await createServer({
  ssr: { noExternal: ['leaflet'] },
  appType: 'custom', server: { middlewareMode: true },
  plugins: [{
    name: 'isolated-route-render-review', enforce: 'pre',
    resolveId(id) { if (id === 'leaflet') return '\0review-leaflet'; },
    load(id) { if (id === '\0review-leaflet') return 'export default {};'; },
    transform(source, id) {
      if (/src\/(store|auth|theme|cloud)\.ts$/.test(id.replaceAll('\\', '/'))) {
        // These are client stores. Read their snapshots for this static review only.
        const snapshot = id.replaceAll('\\', '/').endsWith('/src/auth.ts') ? 'globalThis.keepnetReviewAuth ?? getSnapshot()' : 'getSnapshot()';
        return source.replace("import { useSyncExternalStore } from 'react';", `const useSyncExternalStore = (_subscribe, getSnapshot) => ${snapshot};`);
      }
      if (id.replaceAll('\\', '/').endsWith('/src/App.tsx')) {
        return source.replace('BrowserRouter, Routes', 'MemoryRouter, Routes')
          .replace('<BrowserRouter>', '<MemoryRouter initialEntries={[globalThis.keepnetReviewRoute]}>')
          .replace('</BrowserRouter>', '</MemoryRouter>');
      }
    },
  }],
});
try {
  const { default: App } = await server.ssrLoadModule('/src/App.tsx');
  const routes = [
    ['/', 'Every cast, every catch, every story.'],
    ['/sessions', 'Journal'],
    ['/sessions?tab=catches', 'Pike'],
    ['/sessions/review-session', 'Review Water'],
    ['/catches/review-catch', 'Catch Details'],
    ['/catches/sample-pike-1', 'Catch Details'],
    ['/discover', 'For You'],
    ['/discover?search=1', 'Search catches, anglers, or waters'],
    ['/profile', 'Review Angler'],
    ['/settings', 'App Theme'],
    ['/achievements', 'Achievements'],
    ['/subscription', 'Keepnet Premium'],
    ['/fisheries', 'UK Fisheries'],
    ['/admin', 'Access Denied'],
  ];
  for (const [route, expected] of routes) {
    globalThis.keepnetReviewRoute = route;
    const html = renderToStaticMarkup(createElement(App));
    assert.ok(html.includes(expected), `${route} must render its main content`);
    if (route.startsWith('/catches/')) {
      assert.ok(!html.includes('class="top-bar"'), 'Catch details must not duplicate the logo header');
      assert.ok(html.includes('sticky-catch-footer'), 'Catch details retain the action footer');
    } else {
      assert.ok(html.includes('aria-label="Main navigation"'), `${route} retains navigation`);
    }
    if (route === '/discover') assert.ok(!html.includes('Close filters'), 'Feed starts without the search panel');
    if (route === '/discover?search=1') assert.ok(html.includes('Close filters'), 'Header search exposes feed filters');
    if (route === '/achievements') {
      assert.equal((html.match(/class="badge-collection-item /g) || []).length, 46);
      assert.equal((html.match(/id="selected-badge-detail"/g) || []).length, 1);
    }
    console.log(`PASS ${route}`);
  }
  const css = ['src/index.css', 'src/AchievementsPage.css', 'src/DesignSystem.css'].map(p=>readFileSync(p, 'utf8')).join('\n');
  const definitions = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m=>m[1]));
  for (const [, token] of css.matchAll(/var\((--[\w-]+)/g)) {
    if (token === '--badge-pointer') continue; // Set per selected row in JSX.
    assert.ok(definitions.has(token), `Missing colour or layout token ${token}`);
  }
  console.log('PASS shared CSS token coverage');
  // Review the signed-in dashboard and member pages using in-memory fixtures.
  globalThis.keepnetReviewAuth = { storageMode: 'local', user: { id: 'review-user', name: 'Review Angler', email: 'review@example.invalid', storageMode: 'local', isAdmin: true } };
  const { actions } = await server.ssrLoadModule('/src/store.ts');
  actions.setSubscription('premium');
  for (const [route, expected] of [['/', 'Time by the water.'], ['/fisheries', 'fisheries-map-container'], ['/settings', 'pref-theme-dark'], ['/subscription', 'Keepnet Premium'], ['/admin', 'Total Catch Reports']]) {
    globalThis.keepnetReviewRoute = route;
    const html = renderToStaticMarkup(createElement(App));
    assert.ok(html.includes(expected), `Signed-in member ${route} must render`);
    console.log(`PASS member ${route}`);
  }

  const { authActions } = await server.ssrLoadModule('/src/auth.ts');
  authActions.getCurrentUser = () => globalThis.keepnetReviewAuth?.user ?? null;
  const renderRoute = route => {
    globalThis.keepnetReviewRoute = route;
    return renderToStaticMarkup(createElement(App));
  };
  const regularUser = { id: 'review-user', name: 'Review Angler', email: 'review@example.invalid', storageMode: 'local' };
  for (const [label, tier, coupon, expiry, premium, admin] of [
    ['Lite', 'lite', null, null, false, false],
    ['Premium', 'premium', null, null, true, false],
    ['active trial', 'premium', 'KEEPNET1M', '2099-01-01T00:00:00Z', true, false],
    ['expired trial', 'premium', 'KEEPNET1M', '2000-01-01T00:00:00Z', false, false],
    ['administrator', 'lite', null, null, true, true],
  ]) {
    globalThis.keepnetReviewAuth = { storageMode: 'local', user: { ...regularUser, isAdmin: admin } };
    actions.setSubscription(tier, coupon, expiry);
    const profile = renderRoute('/profile');
    const membership = renderRoute('/subscription');
    const settings = renderRoute('/settings');
    const fisheries = renderRoute('/fisheries');
    const catchDetail = renderRoute('/catches/sample-pike-1');
    assert.equal(profile.includes('Manage Premium membership'), premium, label);
    assert.equal(profile.includes('1-Month Free Trial Available'), !premium, label);
    assert.equal(profile.includes('Keepnet Membership &amp; 1-Month Free Trial'), !premium, label);
    assert.equal(membership.includes('id="coupon-redemption-card"'), !premium, label);
    assert.equal(membership.includes('Redeem 1 Month Free Trial'), !premium, label);
    assert.equal(membership.includes('Subscription billing frequency'), !premium, label);
    assert.equal(settings.includes('Upgrade to Premium'), !premium, label);
    assert.equal(fisheries.includes('id="fisheries-start-trial-btn"'), !premium, label);
    assert.equal(catchDetail.includes('Unlock Premium'), !premium, label);
    assert.ok(profile.indexOf('profile-personal-bests') < profile.indexOf('profile-achievements-card'));
    assert.ok(profile.indexOf('profile-personal-bests') < profile.indexOf('profile-account-section'));
    assert.ok(profile.includes('View your biggest fish: Carp, 12 lb 5 oz'));
    assert.equal((profile.match(/class="personal-best-record"/g) || []).length, 2);
    assert.ok(profile.includes('href="/catches/pike-best"'));
    assert.ok(!profile.includes('href="/catches/unweighed"'));
    console.log(`PASS ${label}: membership prompts and personal bests`);
  }
  actions.clearAll(); // Clears the isolated in-memory fixture only.
  const emptyProfile = renderRoute('/profile');
  assert.ok(emptyProfile.includes('Your records start here'));
  assert.ok(!emptyProfile.includes('class="personal-best-feature'));
  assert.ok(emptyProfile.includes('profile-account-section'));
  console.log('PASS empty journal: personal bests empty state and separate settings');
} finally { await server.close(); }
