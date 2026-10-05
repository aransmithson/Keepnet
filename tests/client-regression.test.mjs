import assert from 'node:assert/strict';
import { createServer } from 'vite';

const user = (id, storageMode = 'cloud') => ({ id, email: `${id.toLowerCase()}@example.invalid`, name: `Angler ${id}`, nickname: `Angler ${id}`, storageMode, createdAt: '2026-01-01T00:00:00Z', isAdmin: false });
const session = (id, owner = 'A', extra = {}) => ({ id, userId: owner, venueId: 'review-water', venueName: `Water ${id}`, lat: 53, lon: -2, startedAt: '2026-10-05T10:00:00Z', ...extra });
const catchItem = (id, parent = 'session-A', owner = 'A', extra = {}) => ({ id, sessionId: parent, userId: owner, species: 'Carp', weightLb: 9, weightOz: 0, bait: 'Worm', caughtAt: '2026-10-05T11:00:00Z', ...extra });
const photo = 'data:image/jpeg;base64,QUJD';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };
const cases = [];
const test = (label, run) => cases.push([label, run]);

async function harness({ account = null, values = {}, failScopedWrites = false } = {}) {
  const previous = Object.fromEntries(['localStorage', 'sessionStorage', 'window', 'fetch'].map(key => [key, globalThis[key]]));
  const memory = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  const sessionMemory = new Map();
  if (account) {
    memory.set('keepnet:current_user', JSON.stringify({ user: account, storageMode: account.storageMode }));
    memory.set('keepnet:auth_token', `token-${account.id}`);
  }
  const storageFaults = { failScopedWrites };
  const storage = source => ({ getItem: key => source.get(key) ?? null, setItem: (key, value) => {
    if (source === memory && storageFaults.failScopedWrites && key.startsWith('keepnet:v3:')) throw new DOMException('Isolated full device storage fixture', 'QuotaExceededError');
    source.set(key, String(value));
  }, removeItem: key => source.delete(key) });
  globalThis.localStorage = storage(memory); globalThis.sessionStorage = storage(sessionMemory);
  globalThis.window = new EventTarget();
  const remoteSessions = new Map(), remoteCatches = new Map(), removed = new Map();
  const accounts = new Map([['a@example.invalid', user('A')], ['b@example.invalid', user('B')], ['local@example.invalid', user('local', 'local')]]);
  const h = { memory, sessionMemory, storageFaults, requests: [], remoteSessions, remoteCatches, removed, accounts, offline: false, override: null };
  globalThis.fetch = async (url, options = {}) => {
    const request = { url: String(url), options, body: options.body ? JSON.parse(options.body) : undefined };
    h.requests.push(request);
    if (h.override) { const response = await h.override(request); if (response !== undefined) return response; }
    if (h.offline) throw new Error('Isolated offline fixture');
    if (url === '/api/auth/login') {
      const account = accounts.get(request.body.email);
      return account ? Response.json({ success: true, token: `token-${account.id}`, user: account }) : Response.json({ success: false, error: 'Invalid login' }, { status: 401 });
    }
    if (url === '/api/auth/register') {
      const created = { ...user(request.body.email.split('@')[0], request.body.storageMode), email: request.body.email, name: request.body.nickname, nickname: request.body.nickname };
      accounts.set(created.email, created);
      return Response.json({ success: true, token: `token-${created.id}`, user: created });
    }
    if (url === '/api/auth/profile') return Response.json({ success: true, nickname: request.body.nickname });
    const owner = options.headers?.Authorization?.replace('Bearer token-', '') || '';
    if (url === '/api/sync') {
      const body = request.body || {};
      if (body.mode === 'download') return Response.json({ success: true, remoteSessions: [...remoteSessions.values()].filter(s => s.userId === owner), remoteCatches: [...remoteCatches.values()].filter(c => c.userId === owner), deletedCatchIds: [...(removed.get(owner) || [])], remoteSubscription: { tier: 'lite', appliedCoupon: null, expiresAt: null } });
      const sessions = body.sessions || [], catches = body.catches || [];
      assert.ok(sessions.length <= 50 && catches.length <= 100, 'client obeys backend batch limits');
      const parents = new Set(sessions.map(s => s.id));
      for (const record of [...sessions, ...catches]) assert.equal(record.userId, owner, 'uploads never cross identity ownership');
      for (const item of catches) {
        if (!parents.has(item.sessionId) && !remoteSessions.has(item.sessionId)) return Response.json({ success: false, error: 'Save the parent session first' }, { status: 409 });
      }
      const published = item => !!item.isShared && item.sharingConfirmed === true && !item.isConfidential;
      for (const item of sessions) remoteSessions.set(item.id, { ...item, isShared:published(item),sharingConfirmed:published(item),updatedAt: new Date().toISOString() });
      const deletedCatchIds = [];
      for (const item of catches) {
        if (removed.get(owner)?.has(item.id)) deletedCatchIds.push(item.id);
        else remoteCatches.set(item.id, { ...item,isShared:published(item),sharingConfirmed:published(item),updatedAt: new Date().toISOString() });
      }
      return Response.json({ success: true, savedSessionIds: sessions.map(s => s.id), savedCatchIds: catches.filter(c => !deletedCatchIds.includes(c.id)).map(c => c.id), deletedCatchIds });
    }
    if (String(url).startsWith('/api/catches?id=') && options.method === 'DELETE') {
      const id = new URL(String(url), 'https://fixture.invalid').searchParams.get('id');
      if (!removed.has(owner)) removed.set(owner, new Set()); removed.get(owner).add(id); remoteCatches.delete(id);
      return Response.json({ success: true, deletedCatchIds: [id] });
    }
    throw new Error(`Unexpected fixture request ${options.method || 'GET'} ${url}`);
  };
  const server = await createServer({ appType: 'custom', server: { middlewareMode: true, hmr: false }, plugins: [{
    name: 'isolated-client-snapshot', enforce: 'pre',
    transform(source, id) {
      if (/src\/(auth|store|journalSync|pwa)\.ts$/.test(id.replaceAll('\\', '/'))) {
        return source.replace("import { useSyncExternalStore } from 'react';", 'const useSyncExternalStore = (_subscribe, snapshot) => snapshot();');
      }
    },
  }] });
  Object.assign(h, {
    ...(await server.ssrLoadModule('/src/auth.ts')),
    ...(await server.ssrLoadModule('/src/accountScope.ts')),
    ...(await server.ssrLoadModule('/src/store.ts')),
    ...(await server.ssrLoadModule('/src/journalSync.ts')),
    ...(await server.ssrLoadModule('/src/pwa.ts')),
    ...(await server.ssrLoadModule('/src/achievements.ts')),
  });
  h.close = async () => { await server.close(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } };
  return h;
}
const withHarness = (options, run) => async () => { const h = await harness(options); try { await run(h); } finally { await h.close(); } };

test('A/B/guest journal, entitlement and offline queues stay separate', withHarness({}, async h => {
  const guestSession = h.actions.startSession({ venueId: 'guest-water', venueName: 'Guest water', lat: 53, lon: -2 });
  const guestCatch = h.actions.addCatch({ ...catchItem('ignored', guestSession.id, undefined), userId: undefined });
  assert.equal((await h.authActions.signIn('a@example.invalid', 'fixture-password')).success, true);
  assert.equal(h.useStore().catches.length, 0);
  h.offline = true;
  const aSession = h.actions.startSession({ venueId: 'A-water', venueName: 'Private A water', lat: 53, lon: -2 });
  const aCatch = h.actions.addCatch({ ...catchItem('ignored', aSession.id, 'A') });
  h.actions.setSubscription('premium'); await settle();
  assert.ok(h.getPendingJournal('A').catches[aCatch.id]);
  h.authActions.signOut();
  assert.equal(h.actions.isPremium(), false); assert.deepEqual(h.useStore().catches.map(c => c.id), [guestCatch.id]);
  h.offline = false; await h.authActions.signIn('b@example.invalid', 'fixture-password');
  assert.equal(h.getAccountScope(), 'B'); assert.equal(h.useStore().catches.length, 0); assert.equal(Object.keys(h.getPendingJournal()).length, 3);
  assert.equal(Object.keys(h.getPendingJournal().catches).length, 0); assert.equal(h.actions.isPremium(), false);
  h.requests = []; await h.flushPendingQueue(); assert.equal(h.requests.length, 0);
  await h.authActions.signIn('a@example.invalid', 'fixture-password');
  assert.ok(h.useStore().catches.some(c => c.id === aCatch.id)); await h.flushPendingQueue();
  assert.ok(h.remoteCatches.has(aCatch.id)); assert.equal(h.remoteCatches.get(aCatch.id).userId, 'A');
}));

test('legacy owned privacy/gallery/method fields are repaired before cloud replacement', withHarness({ account: user('A'), values: {
  'keepnet:v2:live': { name: 'Legacy A', subscriptionTier: 'premium', sessions: [session('legacy-parent', 'A', { isShared: true, photo, photos: [photo] }), session('legacy-B', 'B')], catches: [catchItem('legacy-secret', 'legacy-parent', 'A', { isShared: true, isConfidential: true, image: photo, images: [photo], method: 'Deadbaiting' }),catchItem('legacy-shareable','legacy-parent','A',{isShared:true}), catchItem('legacy-B-catch', 'legacy-B', 'B')] },
} }, async h => {
  assert.deepEqual(h.useStore().catches.map(c => c.id), ['legacy-secret','legacy-shareable']);
  for (const record of [...h.useStore().sessions,...h.useStore().catches]) {
    assert.equal(record.isShared,false,'v2 migration resets uncertain historical visibility');assert.equal(record.sharingConfirmed,false);
  }
  h.remoteSessions.set('legacy-parent', session('legacy-parent', 'A', { isShared: true, photos: [] }));
  h.remoteCatches.set('legacy-secret', catchItem('legacy-secret', 'legacy-parent', 'A', { isShared: true, isConfidential: false, images: [] }));
  const remote = await h.fetchUserCloudData(h.authActions.getCurrentUser());
  h.actions.replaceWithRemoteData(remote.sessions, remote.catches, remote.subscription, remote.deletedCatchIds);
  const repaired = h.useStore().catches[0];
  assert.equal(repaired.isConfidential, true); assert.equal(repaired.isShared, false); assert.deepEqual(repaired.images, [photo]); assert.equal(repaired.method, 'Deadbaiting');
  assert.equal(h.remoteCatches.get('legacy-secret').isConfidential, true, 'repair is persisted rather than only hidden locally');
  assert.ok(!h.requests.some(r => r.body?.catches?.some(c => c.userId === 'B')));
  assert.equal(h.actions.toggleCatchShare('legacy-shareable'),true);await h.flushPendingQueue();
  const confirmed=h.useStore().catches.find(c=>c.id==='legacy-shareable');assert.equal(confirmed.sharingConfirmed,true);
  assert.equal(h.remoteCatches.get('legacy-shareable').isShared,true,'only a new explicit share can republish the record');
}));

test('migration quota failures retain owned legacy journal and privacy repairs in memory', withHarness({ account:user('A'),failScopedWrites:true,values:{
  'keepnet:v2:live':{name:'Quota Angler',sessions:[session('quota-parent','A',{isShared:true,photo,photos:[photo]}),session('other-parent','B')],catches:[catchItem('quota-secret','quota-parent','A',{isShared:true,isConfidential:true,images:[photo],method:'Float'}),catchItem('other-private','other-parent','B')]},
} },async h=>{
  assert.deepEqual(h.useStore().sessions.map(s=>s.id),['quota-parent'],'full storage must not make existing journal look empty');
  assert.deepEqual(h.useStore().catches.map(c=>c.id),['quota-secret']);assert.ok(h.useStore().storageError,'quota failure is visible to the angler');
  assert.equal(h.useStore().catches[0].isShared,false);assert.deepEqual(h.useStore().catches[0].images,[photo]);
  const pending=h.getPendingJournal();assert.ok(pending.sessions['quota-parent'],'parent privacy repair stays queued despite persistence failure');assert.ok(pending.catches['quota-secret']);
  assert.equal(pending.catches['quota-secret'].isConfidential,true);assert.equal(pending.catches['quota-secret'].isShared,false);assert.ok(!pending.catches['other-private']);
  assert.ok(h.memory.has('keepnet:v2:live'),'original persistent journal remains available for recovery');
  h.storageFaults.failScopedWrites=false;assert.equal(await h.flushPendingQueue(),true);assert.equal(h.remoteCatches.get('quota-secret').isConfidential,true);
}));

test('local-mode signup registers identity, re-login works and nickname uses authenticated profile endpoint', withHarness({}, async h => {
  const result = await h.authActions.signUp('local@example.invalid', 'fixture-password', 'Local Angler', true);
  assert.equal(result.success, true); assert.equal(h.authActions.getCurrentUser().storageMode, 'local');
  const registration = h.requests.find(r => r.url === '/api/auth/register'); assert.equal(registration.body.storageMode, 'local');
  h.authActions.signOut(); assert.equal((await h.authActions.signIn('local@example.invalid', 'fixture-password')).success, true);
  assert.equal(await h.authActions.updateNickname('New nickname'), true);
  const profile = h.requests.find(r => r.url === '/api/auth/profile'); assert.deepEqual(profile.body, { nickname: 'New nickname' }); assert.equal(profile.options.headers.Authorization, 'Bearer token-local');
  assert.equal(h.authActions.getCurrentUser().nickname, 'New nickname');
  h.override = r => r.url === '/api/auth/profile' ? Response.json({ error: 'Rejected' }, { status: 403 }) : undefined;
  assert.equal(await h.authActions.updateNickname('Rejected nickname'), false); assert.equal(h.authActions.getCurrentUser().nickname, 'New nickname');
}));

test('an offline catch is queued even when its parent session upload fails', withHarness({ account: user('A') }, async h => {
  h.offline = true;
  const parent = h.actions.startSession({ venueId: 'water', venueName: 'Water', lat: 53, lon: -2 });
  const item = h.actions.addCatch({ ...catchItem('ignored', parent.id, 'A') }); await settle();
  assert.ok(h.getPendingJournal().sessions[parent.id]); assert.ok(h.getPendingJournal().catches[item.id]);
  assert.ok(h.memory.get(h.scopedStorageKey('keepnet:v3:pending')).includes(item.id));
  h.offline = false; assert.equal(await h.flushPendingQueue(), true); assert.ok(h.remoteCatches.has(item.id));
}));

test('saving a catch skips a confirmed clean cloud parent and preserves other-device session edits', withHarness({account:user('A')},async h=>{
  const parent=session('confirmed-parent','A',{notes:'Downloaded note'}),item=catchItem('confirmed-catch',parent.id);
  h.remoteSessions.set(parent.id,parent);h.remoteCatches.set(item.id,item);
  const downloaded=await h.fetchUserCloudData(h.authActions.getCurrentUser());
  h.actions.replaceWithRemoteData(downloaded.sessions,downloaded.catches,downloaded.subscription,downloaded.deletedCatchIds);
  assert.equal(h.isSessionOnCloud(parent.id),true);
  h.remoteSessions.set(parent.id,{...parent,notes:'A newer note from another device'});h.requests=[];
  h.actions.updateCatch(item.id,{bait:'New catch bait'});await h.flushPendingQueue();await settle();
  const uploads=h.requests.filter(r=>r.url==='/api/sync' && !r.body?.mode);assert.ok(uploads.some(r=>r.body.catches.some(c=>c.id===item.id)),'catch edit actually reaches the cloud');
  assert.ok(uploads.every(r=>r.body.sessions.length===0),'unchanged confirmed parent is never re-uploaded as a side effect');
  assert.equal(h.remoteCatches.get(item.id).bait,'New catch bait');assert.equal(h.remoteSessions.get(parent.id).notes,'A newer note from another device');
}));

test('dirty remote merges preserve edits and deletion tombstones prevent resurrection', withHarness({ account: user('A') }, async h => {
  const parent = session('session-A'), item = catchItem('dirty');
  h.actions.replaceWithRemoteData([parent], [item]); h.remoteSessions.set(parent.id, parent); h.remoteCatches.set(item.id, item);
  h.offline = true; h.actions.updateCatch(item.id, { bait: 'Offline bait', weightLb: 12, isConfidential: true }); await settle();
  h.actions.replaceWithRemoteData([parent], [{ ...item, updatedAt: '2099-01-01T00:00:00Z' }]);
  assert.equal(h.useStore().catches[0].weightLb, 12); assert.equal(h.useStore().catches[0].bait, 'Offline bait'); assert.equal(h.useStore().catches[0].isConfidential, true);
  h.actions.deleteCatch(item.id); await settle();
  h.actions.replaceWithRemoteData([parent], [item]); assert.equal(h.useStore().catches.length, 0); assert.ok(h.getPendingJournal().deletedCatches[item.id]);
  h.offline = false; await h.flushPendingQueue(); assert.ok(!h.remoteCatches.has(item.id)); assert.equal(Object.keys(h.getPendingJournal().deletedCatches).length, 0);
  h.actions.replaceWithRemoteData([parent], [item]); assert.equal(h.useStore().catches.length, 0);
}));

test('large queues batch dependent catches after their parent and acknowledge every record', withHarness({ account: user('A') }, async h => {
  const q = h.getPendingJournal();
  for (let i = 0; i < 61; i++) q.sessions[`parent-${i}`] = session(`parent-${i}`);
  for (let i = 0; i < 137; i++) { const parent = `parent-${60 - i % 61}`; q.catches[`catch-${i}`] = catchItem(`catch-${i}`, parent); }
  assert.equal(await h.flushPendingQueue(), true);
  assert.equal(h.remoteSessions.size, 61); assert.equal(h.remoteCatches.size, 137);
  assert.equal(Object.keys(q.sessions).length + Object.keys(q.catches).length, 0);
  const batches = h.requests.filter(r => r.url === '/api/sync'); assert.ok(batches.length > 1);
  const seen = new Set();
  for (const batch of batches) { for (const s of batch.body.sessions) seen.add(s.id); for (const c of batch.body.catches) assert.ok(seen.has(c.sessionId), 'catch parent is in this batch or an earlier acknowledged batch'); }
}));

test('HTTP failures preserve the pending queue for retry', withHarness({ account: user('A') }, async h => {
  const q = h.getPendingJournal(); q.sessions['session-A'] = session('session-A'); q.catches.retry = catchItem('retry');
  h.override = r => r.url === '/api/sync' ? Response.json({ error: 'Temporary service failure' }, { status: 503 }) : undefined;
  assert.equal(await h.flushPendingQueue(), false); assert.ok(q.sessions['session-A']); assert.ok(q.catches.retry); assert.equal(h.useCloudSyncStatus().status, 'error');
  h.override = null; assert.equal(await h.flushPendingQueue(), true); assert.ok(h.remoteCatches.has('retry'));
}));

test('concurrent additions and edits survive an in-flight flush', withHarness({ account: user('A') }, async h => {
  const q = h.getPendingJournal(); q.sessions['session-A'] = session('session-A'); q.catches.changing = catchItem('changing');
  const wait = deferred(), entered = deferred(); let first = true;
  h.override = async r => { if (r.url === '/api/sync' && first) { first = false; entered.resolve(); await wait.promise; } return undefined; };
  const flushing = h.flushPendingQueue(); await entered.promise;
  q.catches.changing = { ...q.catches.changing, bait: 'Edited while uploading', weightLb: 15 };
  q.catches.added = catchItem('added'); wait.resolve();
  assert.equal(await flushing, true); assert.equal(h.remoteCatches.get('changing').bait, 'Edited while uploading'); assert.ok(h.remoteCatches.has('added')); assert.equal(Object.keys(q.catches).length, 0);
  assert.ok(h.requests.filter(r => r.body?.catches?.some(c => c.id === 'changing')).length >= 2);
}));

test('logout ignores stale cloud responses and leaves the originating queue intact', withHarness({ account: user('A') }, async h => {
  const q = h.getPendingJournal('A'); q.sessions['session-A'] = session('session-A'); q.catches.stale = catchItem('stale');
  const response = deferred(), entered = deferred();
  h.override = r => { if (r.url === '/api/sync') { entered.resolve(); return response.promise; } return undefined; };
  const flushing = h.flushPendingQueue(); await entered.promise; h.authActions.signOut();
  response.resolve(Response.json({ success: true, savedSessionIds: ['session-A'], savedCatchIds: ['stale'] }));
  assert.equal(await flushing, false); assert.ok(q.catches.stale); assert.equal(h.useStore().catches.length, 0); assert.equal(h.getAccountScope(), 'guest');
  h.override = null; await h.authActions.signIn('b@example.invalid', 'fixture-password');
  const downloaded = deferred(), downloadEntered = deferred();
  h.override = r => { if (r.body?.mode === 'download') { downloadEntered.resolve(); return downloaded.promise; } return undefined; };
  const fetch = h.fetchUserCloudData(h.authActions.getCurrentUser()); await downloadEntered.promise; h.authActions.signOut();
  downloaded.resolve(Response.json({ success: true, remoteSessions: [session('stale-B', 'B')], remoteCatches: [], remoteSubscription: { tier: 'premium' } }));
  assert.equal(await fetch, null); assert.equal(h.actions.isPremium(), false); assert.equal(h.useStore().sessions.length, 0);
}));

test('overlapping sign-ins and logout cannot restore an obsolete authentication response', withHarness({}, async h => {
  const a = deferred(), b = deferred();
  h.override = r => r.url === '/api/auth/login' ? (r.body.email === 'a@example.invalid' ? a.promise : b.promise) : undefined;
  const first = h.authActions.signIn('a@example.invalid', 'fixture-password'); const second = h.authActions.signIn('b@example.invalid', 'fixture-password');
  b.resolve(Response.json({ success: true, token: 'token-B', user: user('B') })); assert.equal((await second).success, true);
  a.resolve(Response.json({ success: true, token: 'token-A', user: user('A') })); assert.equal((await first).success, false);
  assert.equal(h.getAccountScope(), 'B'); assert.equal(h.getAuthToken(), 'token-B');
  const late = deferred(); h.override = r => r.url === '/api/auth/login' ? late.promise : undefined;
  const signingIn = h.authActions.signIn('a@example.invalid', 'fixture-password'); h.authActions.signOut();
  late.resolve(Response.json({ success: true, token: 'token-A', user: user('A') })); assert.equal((await signingIn).success, false); assert.equal(h.getAuthToken(), ''); assert.equal(h.getAccountScope(), 'guest');
}));

test('PWA installation keeps the actual browser prompt and clears it after installation', withHarness({}, async h => {
  let calls = 0; const prompt = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(prompt, { prompt: async () => { calls++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  window.dispatchEvent(prompt); assert.equal(prompt.defaultPrevented, true); assert.equal(h.useInstallPrompt(), prompt);
  await h.installApp(); assert.equal(calls, 1); assert.equal(h.useInstallPrompt(), null); await h.installApp(); assert.equal(calls, 1);
  window.dispatchEvent(prompt); window.dispatchEvent(new Event('appinstalled')); assert.equal(h.useInstallPrompt(), null);
}));

test('weight achievements use matching units for progress and unlock thresholds', withHarness({}, async h => {
  const nine = h.evaluateAchievements([catchItem('nine')], []).find(a => a.id === 'size_carp_10');
  assert.equal(nine.current, 9); assert.equal(nine.progress, 90); assert.equal(nine.unlocked, false);
  const ten = h.evaluateAchievements([catchItem('ten', 'session-A', 'A', { weightLb: 10 })], []).find(a => a.id === 'size_carp_10');
  assert.equal(ten.progress, 100); assert.equal(ten.unlocked, true);
}));

let failures = 0;
for (const [label, run] of cases) {
  try { await run(); console.log(`PASS ${label}`); }
  catch (error) { failures++; console.error(`FAIL ${label}\n${error.stack || error}`); }
}
console.log(`${cases.length - failures}/${cases.length} client regression groups passed.`);
if (failures) process.exitCode = 1;
