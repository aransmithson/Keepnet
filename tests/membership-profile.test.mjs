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
  appType: 'custom', server: { middlewareMode: true, hmr: false },
  plugins: [{
    name: 'isolated-route-render-review', enforce: 'pre',
    resolveId(id) { if (id === 'leaflet') return '\0review-leaflet'; },
    load(id) { if (id === '\0review-leaflet') return 'export default {};'; },
    transform(source, id) {
      if (/src\/(store|auth|theme|cloud|journalSync)\.ts$/.test(id.replaceAll('\\', '/'))) {
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
  const { authActions } = await server.ssrLoadModule('/src/auth.ts');
  authActions.getCurrentUser = () => globalThis.keepnetReviewAuth?.user ?? null;
  const routes = [
    ['/', 'Time by the water.'],
    ['/sessions', 'Fishing Sessions'],
    ['/sessions?tab=catches', 'Pike'],
    ['/sessions/review-session', 'Review Water'],
    ['/catches/review-catch', 'Catch Details'],
    ['/catches/unavailable-record', 'Loading catch'],
    ['/discover', 'For You'],
    ['/discover?search=1', 'Search catches, anglers or waters'],
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
      if (route === '/catches/review-catch') assert.ok(html.includes('sticky-catch-footer'), 'Available catch details retain the action footer');
      else assert.ok(html.includes('Return to catches'), 'Unknown catches show an explicit loading state and return link');
    } else {
      assert.ok(html.includes('aria-label="Main navigation"'), `${route} retains navigation`);
    }
    if (route === '/discover') assert.ok(!html.includes('Close filters'), 'Feed starts without the search panel');
    if (route === '/discover?search=1') assert.ok(html.includes('Hide search'), 'Header search exposes feed filters');
    if (route === '/achievements') {
      assert.equal((html.match(/class="badge-collection-item /g) || []).length, 46);
      assert.equal((html.match(/id="selected-badge-detail"/g) || []).length, 1);
    }
    console.log(`PASS ${route}`);
  }
  const css = ['src/index.css', 'src/AchievementsPage.css', 'src/DesignSystem.css', 'src/SessionsPage.css', 'src/HomeDashboard.css'].map(p=>readFileSync(p, 'utf8')).join('\n');
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
  for (const [route, expected] of [['/', 'Time by the water.'], ['/fisheries', 'fisheries-map-container'], ['/settings', 'pref-theme-dark'], ['/subscription', 'Your membership'], ['/admin', 'Total Catch Reports']]) {
    globalThis.keepnetReviewRoute = route;
    const html = renderToStaticMarkup(createElement(App));
    assert.ok(html.includes(expected), `Signed-in member ${route} must render`);
    console.log(`PASS member ${route}`);
  }

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
    const catchDetail = renderRoute('/catches/review-catch');
    assert.equal(profile.includes('Premium membership details'), premium, label);
    assert.equal(profile.includes('1-Month Free Trial Available'), !premium, label);
    assert.equal(profile.includes('Keepnet Membership &amp; 1-Month Free Trial'), !premium, label);
    assert.equal(membership.includes('id="coupon-redemption-card"'), !premium, label);
    assert.equal(membership.includes('Try Premium for a month'), !premium, label);
    assert.ok(!membership.includes('Subscription billing frequency'), 'No unsupported billing controls');
    assert.equal(settings.includes('View Premium trial'), !premium, label);
    assert.equal(fisheries.includes('id="fisheries-start-trial-btn"'), !premium, label);
    assert.ok(!catchDetail.includes('Unlock Premium'), 'Private catches do not show commenting upsells');
    assert.ok(profile.indexOf('profile-personal-bests') < profile.indexOf('profile-achievements-card'));
    assert.ok(profile.indexOf('profile-personal-bests') < profile.indexOf('profile-account-section'));
    assert.ok(profile.includes('View your biggest fish: Carp, 12 lb 5 oz'));
    assert.equal((profile.match(/class="personal-best-record"/g) || []).length, 2);
    assert.ok(profile.includes('href="/catches/pike-best"'));
    assert.ok(!profile.includes('href="/catches/unweighed"'));
    console.log(`PASS ${label}: membership prompts and personal bests`);
  }
  const journal = JSON.parse(reviewStorage.get('keepnet:v2:live'));
  const original = journal.sessions[0];
  actions.replaceWithRemoteData(journal.sessions, journal.catches.map(catchItem => ({
    ...catchItem,
    ...(catchItem.id === 'unweighed' ? { isShared: true, likesCount: 12, image: '/images/perch.jpg', images: ['/images/perch.jpg', '/images/chub.jpg'] } : {}),
    ...(catchItem.id === 'carp-best' ? { isShared: true, isConfidential: true } : {}),
  })));
  const home = renderRoute('/');
  assert.equal((home.match(/class="home-catch-card"/g) || []).length, 3);
  assert.ok(home.indexOf('home-catch-unweighed') < home.indexOf('home-catch-carp-best'));
  assert.ok(!home.includes('id="home-catch-review-catch"'));
  assert.ok(home.includes('class="home-catch-photo-count"'));
  assert.ok(home.includes('Like Perch catch, 12 likes'));
  assert.ok(home.includes('/catches/unweighed#comments-section'));
  assert.ok(home.includes('View all catches'));
  const privateHomeCard = home.match(/<article[^>]*id="home-catch-carp-best"[\s\S]*?<\/article>/)?.[0];
  assert.ok(privateHomeCard?.includes('Private'));
  assert.ok(!privateHomeCard?.includes('home-catch-reactions'));
  assert.ok(home.includes('New Fishing Session'));
  assert.ok(!home.includes('id="home-log-catch-btn"'));
  actions.updateSession(original.id, { endedAt: undefined });
  const activeHome = renderRoute('/');
  assert.ok(activeHome.includes('id="active-session-card"'));
  assert.ok(activeHome.includes('id="home-log-catch-btn"'));
  assert.ok(!activeHome.includes('id="start-session-btn"'));
  assert.ok(activeHome.indexOf('Time by the water.') < activeHome.indexOf('id="active-session-card"'));
  actions.replaceWithRemoteData(journal.sessions, journal.catches);
  console.log('PASS home: recent catches, photo counts, privacy, social links and active session');

  actions.replaceWithRemoteData([
    { ...original, id: 'older-session', venueName: 'Older Water', startedAt: '2026-09-30T10:00:00Z' },
    { ...original, id: 'no-gps', venueName: 'No GPS Water', startedAt: '2026-10-02T10:00:00Z', lat: 0, lon: 0 },
    { ...original, id: 'confidential', venueName: 'Secret Water', startedAt: '2026-10-03T10:00:00Z', isShared: true, isConfidential: true },
    original,
    { ...original, id: 'latest-session', venueName: 'Latest Water', startedAt: '2026-10-05T10:00:00Z', photo: '/images/hero-river.jpg', isShared: true },
  ], journal.catches);
  const recentSessions = renderRoute('/sessions');
  assert.equal((recentSessions.match(/class="session-journal-card"/g) || []).length, 4);
  assert.ok(recentSessions.indexOf('Latest Water') < recentSessions.indexOf('Review Water'));
  assert.ok(!recentSessions.includes('Older Water'));
  assert.ok(recentSessions.includes('View all'));
  assert.ok(recentSessions.includes('Start a new session'));
  assert.ok(recentSessions.includes('Not logged'));
  const secretCard = recentSessions.match(/<article[^>]*id="session-confidential"[\s\S]*?<\/article>/)?.[0];
  assert.ok(secretCard?.includes('Private'));
  assert.ok(!secretCard?.includes('Shared'));
  const allSessions = renderRoute('/sessions?view=all');
  assert.equal((allSessions.match(/class="session-journal-card"/g) || []).length, 5);
  assert.ok(allSessions.includes('Older Water'));
  const calendar = renderRoute('/sessions?tab=calendar&month=2026-10&date=2026-10-04');
  assert.ok(calendar.includes('October 2026'));
  assert.equal((calendar.match(/class="session-journal-card"/g) || []).length, 1);
  assert.ok(calendar.includes('Review Water'));
  const earlierMonth = renderRoute('/sessions?tab=calendar&month=2026-09');
  assert.equal((earlierMonth.match(/class="session-journal-card"/g) || []).length, 1);
  assert.ok(earlierMonth.includes('Older Water'));
  const emptyDay = renderRoute('/sessions?tab=calendar&month=2026-10&date=2026-10-01');
  assert.ok(emptyDay.includes('No sessions in this view'));
  const map = renderRoute('/sessions?tab=map');
  assert.ok(map.includes('session-journal-map'));
  assert.equal((map.match(/class="session-journal-card"/g) || []).length, 4);
  assert.ok(!map.includes('No GPS Water'));
  const filteredCatches = renderRoute('/sessions?tab=catches&session=latest-session');
  assert.ok(filteredCatches.includes('No catches recorded'));
  assert.ok(!filteredCatches.includes('catch-item'));
  console.log('PASS sessions: recent/all, date filters, map locations, privacy and catch history');

  actions.clearAll(); // Clears the isolated in-memory fixture only.
  const emptyHome = renderRoute('/');
  assert.ok(emptyHome.includes('No catches logged yet'));
  assert.ok(emptyHome.includes('New Fishing Session'));
  assert.ok(!emptyHome.includes('class="home-catch-card"'));
  globalThis.keepnetReviewAuth = { storageMode: 'local', user: null };
  assert.ok(renderRoute('/').includes('Every cast, every catch, every story.'));
  assert.ok(renderRoute('/sessions').includes('No sessions yet'));
  assert.ok(renderRoute('/sessions?tab=map').includes('No locations recorded yet'));
  const emptyProfile = renderRoute('/profile');
  assert.ok(emptyProfile.includes('Your records start here'));
  assert.ok(!emptyProfile.includes('class="personal-best-feature'));
  assert.ok(emptyProfile.includes('profile-account-section'));
  console.log('PASS empty journal: personal bests empty state and separate settings');
} finally { await server.close(); }
