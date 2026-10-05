import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'vite';

// Execute the actual Pages handlers against an isolated transactional D1 adapter.
// This suite never contacts production, reads credentials, or sends emails.
const sql = new DatabaseSync(':memory:');
sql.exec(`
  CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,nickname TEXT,storage_mode TEXT,is_admin INTEGER DEFAULT 0,auth_token TEXT,locked_until INTEGER DEFAULT 0,failed_logins INTEGER DEFAULT 0,created_at TEXT,password_hash TEXT);
  CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT,user_name TEXT,venue_id TEXT,venue_name TEXT,lat REAL,lon REAL,started_at TEXT,ended_at TEXT,weather_json TEXT,weather_error TEXT,notes TEXT,photo TEXT,photos_json TEXT,is_shared INTEGER DEFAULT 0,updated_at TEXT);
  CREATE TABLE catches(id TEXT PRIMARY KEY,session_id TEXT,user_id TEXT,user_name TEXT,species TEXT,weight_lb REAL,weight_oz REAL,bait TEXT,caught_at TEXT,image TEXT,notes TEXT,is_shared INTEGER DEFAULT 0);
  CREATE TABLE fisheries(id TEXT PRIMARY KEY,name TEXT);
  CREATE TABLE species_tags(name TEXT PRIMARY KEY,category TEXT,sort_order INTEGER);
  CREATE TABLE coupon_redemptions(id TEXT PRIMARY KEY,user_id TEXT,coupon_code TEXT,redeemed_at TEXT);
  INSERT INTO coupon_redemptions VALUES('historical','past-trial','KEEPNET1M','2025-01-01T00:00:00Z');
  INSERT INTO users(id,email,name,nickname,storage_mode,is_admin,auth_token) VALUES('trusted-owner','aransmithson@gmail.com','Owner','Owner','cloud',0,'token-trusted-owner');
  INSERT INTO sessions(id,user_id,venue_name,is_shared) VALUES('legacy-public-session','trusted-owner','Legacy water',1);
  INSERT INTO catches(id,session_id,user_id,species,is_shared) VALUES('legacy-public-catch','legacy-public-session','trusted-owner','Carp',1);
`);
sql.exec(readFileSync('migrations/0001_security_and_journal_fields.sql', 'utf8'));
assert.ok(sql.prepare('SELECT user_id FROM trial_claims WHERE user_id=?').get('past-trial'), 'migration preserves historical trial eligibility');
assert.equal(sql.prepare('SELECT is_admin FROM users WHERE id=?').get('trusted-owner').is_admin, 1, 'migration preserves existing owner authority');
assert.equal(sql.prepare('SELECT is_shared FROM sessions WHERE id=?').get('legacy-public-session').is_shared,0,'migration privately preserves historical sessions');
assert.equal(sql.prepare('SELECT is_shared FROM catches WHERE id=?').get('legacy-public-catch').is_shared,0,'migration privately preserves historical catches');
for (const [id, admin] of [['a', 0], ['b', 0], ['admin', 1], ['past-trial', 0]]) {
  sql.prepare('INSERT INTO users(id,email,name,nickname,storage_mode,is_admin,auth_token,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(id, `${id}@example.invalid`, id, id, 'cloud', admin, `token-${id}`, '2026-01-01T00:00:00Z');
}
const statement = (query, args = []) => ({
  bind: (...params) => statement(query, params),
  first: async column => { const row = sql.prepare(query).get(...args); return column ? row?.[column] : row ?? null; },
  all: async () => ({ results: sql.prepare(query).all(...args) }),
  run: async () => ({ success: true, meta: sql.prepare(query).run(...args) }),
});
const DB = {
  prepare: query => statement(query),
  batch: async statements => {
    sql.exec('BEGIN');
    try { const results = []; for (const stmt of statements) results.push(await stmt.run()); sql.exec('COMMIT'); return results; }
    catch (err) { sql.exec('ROLLBACK'); throw err; }
  },
};
const server = await createServer({ appType: 'custom', server: { middlewareMode: true, hmr: false } });
const modules = new Map();
const invoke = async (file, method, body, user = null, query = '') => {
  if (!modules.has(file)) modules.set(file, await server.ssrLoadModule(`/functions/api/${file}.ts`));
  const request = new Request(`https://review.invalid/api/${file}${query}`, {
    method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(user ? { Authorization: `Bearer token-${user}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const response = await modules.get(file)[`onRequest${method[0]}${method.slice(1).toLowerCase()}`]({ request, env: { DB } });
  return { status: response.status, data: await response.json() };
};
const session = (id, extra = {}) => ({ id, venueId: 'review-water', venueName: 'Review Water', lat: 53, lon: -2, startedAt: '2026-10-05T10:00:00Z', isShared: false, sharingConfirmed:true, ...extra });
const catchItem = (id, extra = {}) => ({ id, sessionId: 'session-a', species: 'Pike', weightLb: 4, weightOz: 2, bait: 'Lure', caughtAt: '2026-10-05T11:00:00Z', isShared: false, sharingConfirmed:true, ...extra });
const photo = 'data:image/jpeg;base64,QUJD';
let groups = 0;
const pass = label => { groups++; console.log(`PASS ${label}`); };
try {
  for (const file of ['admin/users', 'admin/stats', 'admin/backup']) {
    assert.equal((await invoke(file, 'GET', undefined, null, '?adminEmail=aransmithson%40gmail.com')).status, 403);
    assert.equal((await invoke(file, 'GET', undefined, 'a')).status, 403);
  }
  assert.equal((await invoke('admin/users', 'GET', undefined, 'admin')).status, 200);
  assert.equal((await invoke('admin/users', 'GET', undefined, 'trusted-owner')).status, 200);
  sql.prepare('INSERT INTO users(id,email,name,nickname,storage_mode,is_admin,auth_token) VALUES(?,?,?,?,?,?,?)')
    .run('email-only', 'aransmithson@googlemail.com', 'Unverified email', 'Unverified email', 'cloud', 0, 'token-email-only');
  assert.equal((await invoke('admin/users', 'GET', undefined, 'email-only')).status, 403);
  sql.prepare('UPDATE users SET locked_until=? WHERE id=?').run(Date.now() + 60000, 'admin');
  assert.equal((await invoke('admin/users', 'GET', undefined, 'admin')).status, 403);
  sql.exec("UPDATE users SET locked_until=0 WHERE id='admin'");
  pass('admin authorization rejects unsigned identity, ordinary users and locked tokens');

  assert.equal((await invoke('auth/profile', 'POST', { userId: 'a', nickname: 'Attacker' })).status, 401);
  assert.equal((await invoke('auth/profile', 'POST', { userId: 'b', nickname: 'Attacker' }, 'a')).status, 403);
  assert.equal((await invoke('auth/profile', 'POST', { nickname: 'New Angler' }, 'a')).status, 200);
  assert.equal(sql.prepare('SELECT nickname FROM users WHERE id=?').get('a').nickname, 'New Angler');
  pass('profile edits derive identity from authentication');

  assert.equal((await invoke('auth/login', 'POST', { email: 'a@example.invalid', passwordHash: 'cached-hash' })).status, 400);
  sql.prepare('UPDATE users SET password_hash=? WHERE id=?').run('temp_reset_pending', 'past-trial');
  assert.equal((await invoke('auth/register', 'POST', { email: 'past-trial@example.invalid', password: 'new-fixture-password', nickname: 'Imposter' })).status, 409);
  assert.equal(sql.prepare('SELECT password_hash FROM users WHERE id=?').get('past-trial').password_hash, 'temp_reset_pending');
  pass('legacy hashes cannot act as login credentials and pending-reset accounts cannot be taken over through registration');

  const registered=await invoke('auth/register','POST',{email:'local-identity@example.invalid',password:'fixture-password',nickname:'Local Angler',storageMode:'local'});
  assert.equal(registered.status,200);assert.equal(registered.data.user.storageMode,'local');assert.ok(registered.data.token);
  const signedIn=await invoke('auth/login','POST',{email:'local-identity@example.invalid',rawPassword:'fixture-password'});
  assert.equal(signedIn.status,200);assert.equal(signedIn.data.user.storageMode,'local');assert.equal(signedIn.data.user.isAdmin,false);
  pass('local journal accounts register recoverable identities and can sign in again without gaining roles');

  assert.equal((await invoke('sessions', 'POST', session('session-a', { isShared: true, photos: [photo] }), 'a')).status, 200);
  assert.equal((await invoke('sessions', 'POST', session('session-b'), 'b')).status, 200);
  assert.equal((await invoke('sessions', 'POST', session('session-a'), 'b')).status, 403);
  assert.equal((await invoke('sessions', 'POST', session('foreign-owner', { userId: 'b' }), 'a')).status, 403);
  assert.equal((await invoke('sessions', 'POST', session('invalid-location', { lat: 91 }), 'a')).status, 400);
  assert.equal((await invoke('sessions', 'POST', session('invalid-date', { startedAt: 'nonsense' }), 'a')).status, 400);
  assert.equal((await invoke('sessions', 'GET', undefined, null, '?id=session-b')).status, 404);
  assert.equal((await invoke('sessions', 'GET', undefined, 'b', '?id=session-b')).status, 200);
  assert.equal((await invoke('sessions', 'GET', undefined, 'b', '?userId=a')).status, 403);
  pass('session writes and targeted/private reads enforce identity and validate records');

  assert.equal((await invoke('sessions','POST',session('old-client-session',{isShared:true,sharingConfirmed:undefined}),'a')).status,200);
  assert.equal((await invoke('sessions','GET',undefined,null,'?id=old-client-session')).status,404);
  const heldSession=(await invoke('sessions','GET',undefined,'a','?id=old-client-session')).data.sessions[0];
  assert.equal(heldSession.isShared,false);assert.equal(heldSession.sharingConfirmed,false);
  assert.equal((await invoke('catches','POST',catchItem('old-client-catch',{isShared:true,sharingConfirmed:undefined}),'a')).status,200);
  assert.equal((await invoke('catches','GET',undefined,null,'?id=old-client-catch')).status,404);
  assert.equal((await invoke('catches','POST',catchItem('confirmed-catch',{isShared:true}),'a')).status,200);
  const published=(await invoke('catches','GET',undefined,null,'?id=confirmed-catch')).data.catches[0];
  assert.equal(published.isShared,true);assert.equal(published.sharingConfirmed,true);
  // Avoid affecting the subsequent public-query fixture assertions.
  assert.equal((await invoke('catches','POST',catchItem('confirmed-catch'),'a')).status,200);
  pass('legacy visibility resets safely and old clients cannot publish without new explicit confirmation');

  for (const [id, fields] of [['private', {}], ['shared', { isShared: true }], ['confidential', { isShared: true, isConfidential: true, images: [photo, photo], method: 'Deadbaiting' }]]) {
    const saved = await invoke('catches', 'POST', catchItem(id, fields), 'a');
    assert.equal(saved.status, 200); assert.deepEqual(saved.data.savedCatchIds, [id]);
  }
  const publicSession = await invoke('catches', 'GET', undefined, null, '?sessionId=session-a');
  assert.deepEqual(publicSession.data.catches.map(c => c.id), ['shared']);
  assert.deepEqual((await invoke('catches', 'GET')).data.catches.map(c => c.id), ['shared']);
  assert.equal((await invoke('catches', 'GET', undefined, null, '?id=private')).status, 404);
  const confidential = (await invoke('catches', 'GET', undefined, 'a', '?id=confidential')).data.catches[0];
  assert.equal(confidential.isShared, false); assert.equal(confidential.isConfidential, true);
  assert.deepEqual(confidential.images, [photo, photo]); assert.equal(confidential.method, 'Deadbaiting'); assert.ok(confidential.updatedAt);
  assert.equal((await invoke('catches', 'POST', catchItem('foreign-parent', { sessionId: 'session-b' }), 'a')).status, 403);
  assert.equal((await invoke('catches', 'POST', catchItem('missing-parent', { sessionId: 'missing' }), 'a')).status, 409);
  assert.equal((await invoke('catches', 'POST', catchItem('invalid-weight', { weightOz: 16 }), 'a')).status, 400);
  pass('catch privacy is individual; confidentiality, galleries and method round-trip; parent ownership enforced');

  const mediumPhoto = `data:image/jpeg;base64,${'A'.repeat(210000)}`;
  assert.equal((await invoke('sessions', 'POST', session('large-valid', { photos: [mediumPhoto] }), 'a')).status, 200);
  assert.equal((await invoke('sessions', 'GET', undefined, 'a', '?id=large-valid')).data.sessions[0].photos[0], mediumPhoto);
  assert.equal((await invoke('sessions', 'POST', session('too-large', { photos: [`data:image/jpeg;base64,${'A'.repeat(1500001)}`] }), 'a')).status, 413);
  const bigPhoto=`data:image/jpeg;base64,${'A'.repeat(900000)}`;
  assert.equal((await invoke('sessions', 'POST', session('combined-too-large', { photo:bigPhoto,photos:[bigPhoto] }), 'a')).status, 413);
  assert.equal((await invoke('sessions', 'POST', session('bad-gallery', { photos: ['<svg onload=evil>'] }), 'a')).status, 400);
  sql.prepare('UPDATE sessions SET photos_json=?,weather_json=? WHERE id=?').run('["unterminated', '{bad', 'session-a');
  const legacy = await invoke('sync', 'POST', { mode: 'download' }, 'a');
  assert.equal(legacy.status, 200); assert.deepEqual(legacy.data.remoteSessions.find(s => s.id === 'session-a').photos, []);
  pass('large galleries remain valid JSON; oversize/invalid writes rejected; corrupt legacy rows do not break downloads');

  const sync = await invoke('sync', 'POST', { sessions: [session('synced-session', { isConfidential: true, isShared: true })], catches: [catchItem('synced-catch', { sessionId: 'synced-session', images: [photo], method: 'Float', isConfidential: true, isShared: true })], subscription: { tier: 'premium', expiresAt: null } }, 'a');
  assert.equal(sync.status, 200); assert.equal(sync.data.remoteSubscription.tier, 'lite');
  assert.deepEqual(sync.data.savedSessionIds, ['synced-session']); assert.deepEqual(sync.data.savedCatchIds, ['synced-catch']);
  assert.equal(sync.data.remoteSessions.find(s => s.id === 'synced-session').isConfidential, true);
  assert.equal(sync.data.remoteCatches.find(c => c.id === 'synced-catch').method, 'Float');
  assert.equal((await invoke('sync', 'POST', { user: { id: 'b' } }, 'a')).status, 403);
  assert.equal((await invoke('sync', 'POST', { sessions: Array.from({ length: 51 }, (_, i) => session(`over-${i}`)) }, 'a')).status, 413);
  assert.equal((await invoke('sync', 'POST', { catches: Array.from({ length: 101 }, (_, i) => catchItem(`over-c-${i}`)) }, 'a')).status, 413);
  assert.equal((await invoke('sessions', 'POST', Array.from({ length: 51 }, (_, i) => session(`over-${i}`)), 'a')).status, 413);
  assert.equal((await invoke('catches', 'POST', Array.from({ length: 51 }, (_, i) => catchItem(`over-c-${i}`)), 'a')).status, 413);
  assert.equal((await invoke('sync', 'POST', { sessions: [session('must-not-save')], catches: [catchItem('foreign', { sessionId: 'session-b' })] }, 'a')).status, 403);
  assert.equal(sql.prepare('SELECT id FROM sessions WHERE id=?').get('must-not-save'), undefined);
  pass('sync acknowledgments, membership authority, batch limits and pre-write atomic validation');

  assert.equal((await invoke('subscription/coupon', 'POST', { code: 'KEEPNET1M', userId: 'a' })).status, 401);
  assert.equal((await invoke('subscription/coupon', 'POST', { code: 'KEEPNET1M', userId: 'b' }, 'a')).status, 403);
  assert.equal((await invoke('subscription/coupon', 'POST', { code: 'ARBITRARY-FREE' }, 'a')).status, 400);
  const trial = await invoke('subscription/coupon', 'POST', { code: 'KEEPNET1M' }, 'a');
  assert.equal(trial.status, 200); assert.equal(trial.data.tier, 'premium');
  assert.equal((await invoke('subscription/coupon', 'DELETE', undefined, 'a')).status, 200);
  assert.equal((await invoke('subscription/coupon', 'POST', { code: 'ANGLER30' }, 'a')).status, 409);
  assert.equal((await invoke('subscription/coupon', 'POST', { code: 'KEEPNET1M' }, 'past-trial')).status, 409);
  sql.prepare('INSERT INTO user_subscriptions(id,user_id,tier,applied_coupon,expires_at) VALUES(?,?,?,?,?)').run('paid', 'b', 'premium', 'ADMIN_PASS', null);
  assert.equal((await invoke('subscription/coupon', 'POST', { code: 'KEEPNET1M' }, 'b')).status, 409);
  assert.equal((await invoke('subscription/coupon', 'DELETE', undefined, 'b')).status, 409);
  assert.equal(sql.prepare('SELECT expires_at FROM user_subscriptions WHERE user_id=?').get('b').expires_at, null);
  assert.equal((await invoke('subscription/coupon', 'GET', undefined, 'admin')).data.isPremium, true);
  pass('coupons require auth and exact eligibility; one trial and paid membership protection');

  assert.equal((await invoke('likes', 'POST', { catchId: 'shared', action: 'like' })).status, 401);
  assert.equal((await invoke('likes', 'POST', { catchId: 'private', action: 'like' }, 'b')).status, 404);
  assert.equal((await invoke('likes', 'POST', { catchId: 'missing', action: 'like' }, 'b')).status, 404);
  assert.equal((await invoke('likes', 'POST', { catchId: 'shared', action: 'like' }, 'b')).data.likesCount, 1);
  assert.equal((await invoke('likes', 'POST', { catchId: 'shared', action: 'like' }, 'b')).data.likesCount, 1);
  assert.equal((await invoke('likes', 'POST', { catchId: 'shared', action: 'unlike' }, 'a')).data.likesCount, 1);
  assert.equal((await invoke('likes', 'POST', { catchId: 'shared', action: 'unlike' })).status, 401);
  assert.equal((await invoke('likes', 'GET', undefined, 'b', '?catchId=shared')).data.liked, true);
  assert.deepEqual((await invoke('likes', 'GET', undefined, 'b')).data.likedCatchIds, ['shared']);
  assert.equal((await invoke('likes', 'GET', undefined, null, '?catchId=private')).status, 404);
  pass('likes authenticate identity, deduplicate and remove only caller reactions on visible catches');

  assert.equal((await invoke('comments', 'POST', { catchId: 'private', comment: 'Intrusion' }, 'b')).status, 404);
  assert.equal((await invoke('comments', 'POST', { catchId: 'missing', comment: 'Intrusion' }, 'b')).status, 404);
  assert.equal((await invoke('comments', 'POST', { catchId: 'shared', comment: 'Lite comment' }, 'a')).status, 403);
  const posted = await invoke('comments', 'POST', { catchId: 'shared', comment: 'Nice fish!' }, 'b'); assert.equal(posted.status, 200);
  assert.equal((await invoke('comments', 'DELETE', undefined, 'a', `?id=${posted.data.comment.id}`)).status, 403);
  assert.equal((await invoke('comments', 'GET', undefined, null, '?catchId=shared')).data.comments.length, 1);
  assert.equal((await invoke('catches', 'POST', catchItem('shared'), 'a')).status, 200);
  assert.equal((await invoke('comments', 'GET', undefined, null, '?catchId=shared')).status, 404);
  assert.equal((await invoke('comments', 'GET')).data.commentCounts.shared, undefined);
  assert.equal((await invoke('likes', 'GET')).data.likes.shared, undefined);
  assert.equal((await invoke('comments', 'GET', undefined, 'a', '?catchId=shared')).data.comments.length, 1);
  pass('comments validate visibility/membership; unsharing hides existing comments and reactions');

  assert.equal((await invoke('catches', 'DELETE', undefined, 'b', '?id=shared')).status, 403);
  assert.equal((await invoke('catches', 'DELETE', undefined, 'a', '?id=shared')).status, 200);
  assert.equal((await invoke('catches', 'DELETE', undefined, 'a', '?id=shared')).status, 200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM catch_comments WHERE catch_id=?').get('shared').count, 0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM catch_likes WHERE catch_id=?').get('shared').count, 0);
  const staleWrite = await invoke('catches', 'POST', catchItem('shared', { isShared: true }), 'a');
  assert.deepEqual(staleWrite.data.deletedCatchIds, ['shared']); assert.deepEqual(staleWrite.data.savedCatchIds, []);
  const staleSync = await invoke('sync', 'POST', { catches: [catchItem('shared')] }, 'a');
  assert.ok(staleSync.data.deletedCatchIds.includes('shared')); assert.ok(!staleSync.data.remoteCatches.some(c => c.id === 'shared'));
  assert.equal((await invoke('catches', 'DELETE', undefined, 'a', '?id=never-uploaded')).status, 200);
  assert.deepEqual((await invoke('catches', 'POST', catchItem('never-uploaded'), 'a')).data.deletedCatchIds, ['never-uploaded']);
  pass('deletion enforces ownership, cleans social data, is idempotent and prevents stale resurrection');

  const backup = await invoke('admin/backup', 'GET', undefined, 'admin');
  assert.equal(backup.status, 200);for (const key of ['subscriptions', 'trialClaims', 'comments', 'likes', 'deletions'])assert.ok(Array.isArray(backup.data.data[key]));
  assert.ok(!backup.data.data.users.some(user => 'auth_token' in user || 'password_hash' in user));
  assert.equal((await invoke('admin/users', 'POST', { action: 'lock', userId: 'b' }, 'admin')).status, 200);
  assert.equal((await invoke('likes', 'POST', { catchId: 'private', action: 'like' }, 'b')).status, 401);
  pass('backups include membership/social/deletion state without secrets; account locks revoke tokens');

  console.log(`Passed ${groups} API regression groups against actual handlers and migrated in-memory schema.`);
} finally { await server.close(); sql.close(); }
