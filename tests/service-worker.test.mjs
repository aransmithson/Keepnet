import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync('public/sw.js', 'utf8');
function harness() {
  const handlers = {}, entries = new Map(), deleted = [], added = [];
  let offline = false;
  const cache = {
    add: async asset => { added.push(asset); if (asset.includes('welcome-hero')) throw new Error('Optional image missing'); entries.set(asset, new Response(asset)); },
    put: async (request, response) => entries.set(typeof request === 'string' ? request : request.url, response),
  };
  const self = { location: { origin: 'https://keepnet.test' }, addEventListener: (type, handler) => handlers[type] = handler, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  runInNewContext(source, { self, URL, Response, console: { warn: () => {} }, caches: {
    open: async () => cache, match: async request => entries.get(typeof request === 'string' ? request : request.url)?.clone(),
    keys: async () => ['keepnet-old', 'keepnet-shell-v3', 'other-app'], delete: async key => deleted.push(key),
  }, fetch: async request => { if (offline) throw new Error('Offline'); return new Response(typeof request === 'string' ? request : request.url); } });
  async function event(type, request) {
    const waits = []; let response;
    handlers[type]({ request, waitUntil: promise => waits.push(promise), respondWith: promise => response = promise });
    const result = response ? await response : undefined;
    await Promise.all(waits);
    return result;
  }
  return { entries, deleted, added, event, setOffline: value => offline = value };
}
const h = harness();
await h.event('install');
assert.ok(h.entries.has('/index.html'), 'An optional missing image must not prevent shell precaching');
await h.event('activate');
assert.deepEqual(h.deleted, ['keepnet-old'], 'Only obsolete Keepnet caches are removed');
h.setOffline(true);
let response = await h.event('fetch', { url: 'https://keepnet.test/profile', mode: 'navigate' });
assert.equal(response.status, 200); assert.equal(await response.text(), '/index.html');
h.entries.delete('/index.html');
response = await h.event('fetch', { url: 'https://keepnet.test/sessions', mode: 'navigate' });
assert.equal(await response.text(), '/', 'Offline root fallback is awaited');
h.entries.delete('/');
response = await h.event('fetch', { url: 'https://keepnet.test/', mode: 'navigate' });
assert.equal(response.status, 503, 'A missing offline shell returns a valid Response');
assert.equal(await h.event('fetch', { url: 'https://keepnet.test/api/sync', mode: 'cors' }), undefined, 'Private APIs bypass caching');
response = await h.event('fetch', { url: 'https://keepnet.test/assets/missing.js', mode: 'cors' });
assert.equal(response.status, 503);
h.setOffline(false);
const asset = { url: 'https://keepnet.test/assets/app.js', mode: 'cors' };
await h.event('fetch', asset);
assert.ok(h.entries.has(asset.url), 'Static revalidation persists before the event ends');
h.setOffline(true); response = await h.event('fetch', asset); assert.equal(response.status, 200);
if (existsSync('dist/index.html')) {
  const html = readFileSync('dist/index.html', 'utf8'), sw = readFileSync('dist/sw.js', 'utf8');
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)) assert.ok(sw.includes(asset), 'Built JavaScript and CSS must be precached');
  assert.match(sw, /keepnet-shell-[a-f0-9]{12}/, 'Each app build has a content-derived cache version');
}
console.log('PASS service worker: optional assets, cache cleanup, offline fallback, uncached APIs, asset updates and build versions');
