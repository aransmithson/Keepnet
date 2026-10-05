import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// Exercise the actual UI event handlers and asynchronous effects with isolated
// hook cells and local API fixtures. No browser, user storage or network is used.
const fixtures = globalThis.keepnetUiFixture = {
  user: { id: 'reader', name: 'Reader', nickname: 'River Reader' }, premium: false,
  sessions: [{ id: 'water', venueName: 'Recorded Water', startedAt: '2026-10-01T10:00:00Z' }],
  catches: [
    { id: 'shared', sessionId: 'water', species: 'Carp', weightLb: 4, weightOz: 0, bait: 'Boilie', caughtAt: '2026-10-01T12:00:00Z', isShared: true, userId: 'author', userName: 'Recorded Angler' },
    { id: 'private', sessionId: 'water', species: 'Private Pike', weightLb: 5, weightOz: 0, bait: '', caughtAt: '2026-10-01T13:00:00Z' },
    { id: 'secret', sessionId: 'water', species: 'Secret Perch', weightLb: 2, weightOz: 0, bait: '', caughtAt: '2026-10-01T14:00:00Z', isShared: true, isConfidential: true },
  ], comments: [], savedCatchIds: [], subscription: {}, apiCalls: [], mapCalls: [],
};
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
globalThis.window = { confirm: () => true, addEventListener() {}, removeEventListener() {}, location: { origin: 'https://example.invalid' } };

function createHookHarness(route = '/') {
  const cells = [], effects = [], refs = [];
  let cursor = 0, effectCursor = 0, refCursor = 0;
  let params = new URLSearchParams(route.split('?')[1] || '');
  return {
    begin() { cursor = 0; effectCursor = 0; refCursor = 0; globalThis.keepnetUiHooks = this; },
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
    useRef(initial) { const index = refCursor++; return refs[index] ||= { current: initial }; },
    useMemo(compute) { return compute(); },
    useEffect(effect, deps) { const index = effectCursor++; const previous = effects[index]; if (!previous || deps.some((value, position) => !Object.is(value, previous.deps[position]))) effects[index] = { deps, effect, dirty: true, cleanup: previous?.cleanup }; },
    useSearchParams() { return [params, next => { params = new URLSearchParams(next); }]; },
    useNavigate() { return path => { fixtures.navigation = path; }; },
    async effects() { for (const item of effects) { if (item.dirty) { item.cleanup?.(); item.dirty = false; item.cleanup = item.effect(); } } await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); },
    close() { for (const item of effects) item.cleanup?.(); },
  };
}

const mocks = {
  './store': `export const useStore=()=>({...globalThis.keepnetUiFixture,...globalThis.keepnetUiFixture.subscription});
    export const actions={setAllCatchLikes(){},isCatchLiked(){return false},getCatchLikesCount(){return 0},toggleCatchLike(){},toggleCatchSave(id){const fixture=globalThis.keepnetUiFixture;fixture.savedCatchIds=fixture.savedCatchIds.includes(id)?fixture.savedCatchIds.filter(value=>value!==id):[...fixture.savedCatchIds,id];},applyCoupon:async code=>globalThis.keepnetUiFixture.redeem(code),cancelCouponTrial:async()=>globalThis.keepnetUiFixture.cancel()};
    export const fmtWeight=()=>globalThis.keepnetUiFixture.metric?'1.814 kg':'4 lb'; export const fmtDay=date=>date.slice(0,10); export const fmtTime=date=>date.slice(11,16);`,
  './membership': 'export const usePremiumMembership=()=>globalThis.keepnetUiFixture.premium; export const useMembershipPending=()=>Boolean(globalThis.keepnetUiFixture.membershipPending);',
  './auth': 'export const useAuth=()=>({user:globalThis.keepnetUiFixture.user}); export const isUserAdmin=user=>Boolean(user?.isAdmin);',
  './accountScope': "export const getAccountScope=()=>globalThis.keepnetUiFixture.user?.id||'guest';",
  './theme': "export const useTheme=()=> 'dark';",
  './cloud': `export const fetchPublicSharedData=async()=>({catches:[],sessions:[]});export const fetchCatchLikes=async()=>({});export const fetchCatchCommentCounts=async()=>({shared:2});
    export const fetchCatchComments=async id=>{globalThis.keepnetUiFixture.apiCalls.push(['comments',id]);if(globalThis.keepnetUiFixture.commentFailure)throw new Error('offline');return globalThis.keepnetUiFixture.comments;};
    export const postCatchComment=async(id,text)=>globalThis.keepnetUiFixture.post?globalThis.keepnetUiFixture.post(id,text):({success:true,comment:{id:'posted',catch_id:id,user_id:'reader',user_name:'River Reader',created_at:'2026-10-03T15:00:00Z',comment:text,is_premium:1}});
    export const deleteCatchComment=async id=>globalThis.keepnetUiFixture.delete?globalThis.keepnetUiFixture.delete(id):true;`,
  './map': `export const createMap=async()=>{globalThis.keepnetUiFixture.mapCalls.push('create');return {setMarkers(markers){globalThis.keepnetUiFixture.mapCalls.push(['markers',markers.length]);},flyTo(){},destroy(){globalThis.keepnetUiFixture.mapCalls.push('destroy');}}};`,
};
const reviewed = ['Discover.tsx', 'CatchComments.tsx', 'SubscriptionPage.tsx', 'FisheriesDirectory.tsx'];
const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, plugins: [{
  name: 'isolated-ui-behaviour', enforce: 'pre',
  resolveId(id, importer) { if (reviewed.some(file => importer?.endsWith(file)) && mocks[id]) return `\0keepnet-ui-${id}`; },
  load(id) { if (id.startsWith('\0keepnet-ui-')) return mocks[id.slice('\0keepnet-ui-'.length)]; },
  transform(source, id) {
    if (!reviewed.some(file => id.endsWith(file))) return;
    return source.replace(/import \{ ([^}]+) \} from 'react';/, (_match, names) => `const { ${names} } = globalThis.keepnetUiHooks;`)
      .replace(/import \{ ([^}]+) \} from 'react-router-dom';/, (_match, names) => {
        const actual = names.split(',').map(name => name.trim()).filter(name => !['useSearchParams', 'useNavigate'].includes(name));
        const mocked = names.split(',').map(name => name.trim()).filter(name => ['useSearchParams', 'useNavigate'].includes(name));
        return `${actual.length ? `import { ${actual.join(', ')} } from 'react-router-dom';` : ''}\nconst { ${mocked.join(', ')} }=globalThis.keepnetUiHooks;`;
      });
  },
}] });

function walk(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (Array.isArray(element)) { for (const child of element) { const found = walk(child, predicate); if (found) return found; } return null; }
  if (predicate(element)) return element;
  return walk(element.props?.children, predicate);
}
const htmlFor = element => renderToStaticMarkup(createElement(MemoryRouter, {}, element));
try {
  const discoveryHooks = createHookHarness('/discover?search=1'); discoveryHooks.begin();
  const { default: Discover } = await server.ssrLoadModule('/src/Discover.tsx');
  const discovery = () => { discoveryHooks.begin(); return Discover({ onStart() {} }); };
  let tree = discovery(); await discoveryHooks.effects(); tree = discovery();
  let html = htmlFor(tree);
  assert.ok(html.includes('Recorded Angler') && html.includes('Recorded Water'));
  assert.ok(html.includes('No catch photo') && !html.includes('catch-pike-1.jpg'));
  assert.ok(!html.includes('Private Pike') && !html.includes('Secret Perch') && !html.includes('Aran'));
  assert.ok(!html.includes('Nearby') && !html.includes('Clubs') && !html.includes('Your Story'));
  fixtures.metric = true; assert.ok(htmlFor(discovery()).includes('1.814 kg'));
  walk(tree, item => item.type === 'input' && item.props.type === 'search').props.onChange({ target: { value: 'No match' } });
  tree = discovery();
  walk(tree, item => item.type === 'button' && item.props.className === 'community-search-close').props.onClick();
  tree = discovery(); html = htmlFor(tree);
  assert.ok(!html.includes('type="search"') && html.includes('No match') && html.includes('Clear filters'));
  walk(tree, item => item.type === 'button' && item.props.children?.[0] === 'Clear filters ').props.onClick();
  tree = discovery(); assert.ok(htmlFor(tree).includes('Recorded Angler'));
  walk(tree, item => item.type === 'button' && item.props['aria-label'] === 'Save catch').props.onClick();
  tree = discovery();
  walk(tree, item => item.type === 'button' && item.props.children?.[1]?.props?.children === 'Saved').props.onClick();
  assert.ok(htmlFor(discovery()).includes('Recorded Angler'));
  fixtures.savedCatchIds = []; assert.ok(!htmlFor(discovery()).includes('Recorded Angler'));
  fixtures.savedCatchIds = ['shared']; assert.ok(htmlFor(discovery()).includes('Recorded Angler'));
  discoveryHooks.close();
  console.log('PASS Discover: real data, privacy, unit formatting, hidden-filter recovery and saved view');

  const commentHooks = createHookHarness(); commentHooks.begin();
  const { default: CatchComments } = await server.ssrLoadModule('/src/CatchComments.tsx');
  let count = null;
  const commentProps = { catchId: 'shared', isSharedCatch: true, onCountChange: value => { count = value; } };
  const commentView = () => { commentHooks.begin(); return CatchComments(commentProps); };
  tree = commentView(); await commentHooks.effects(); html = htmlFor(commentView());
  assert.equal(count, 0); assert.ok(html.includes('No comments yet.') && !html.includes('TomL') && !html.includes('Reply'));
  fixtures.membershipPending = true; html = htmlFor(commentView()); assert.ok(html.includes('Checking membership') && !html.includes('Unlock Premium'));
  fixtures.membershipPending = false;
  fixtures.comments = [{ id: 'old', user_name: 'Old commenter', user_id: 'author', created_at: '2026-10-01T12:00:00Z', comment: 'Older real comment' }, { id: 'new', user_name: 'New commenter', user_id: 'author', created_at: '2026-10-02T12:00:00Z', comment: 'Newer real comment' }];
  commentProps.catchId = 'another-shared'; tree = commentView(); await commentHooks.effects(); tree = commentView(); html = htmlFor(tree);
  assert.ok(html.indexOf('Newer real comment') < html.indexOf('Older real comment'));
  walk(tree, item => item.type === 'select').props.onChange({ target: { value: 'oldest' } });
  html = htmlFor(commentView()); assert.ok(html.indexOf('Older real comment') < html.indexOf('Newer real comment'));
  fixtures.premium = true; tree = commentView();
  assert.ok(!htmlFor(tree).includes('Unlock Premium'));
  walk(tree, item => item.type === 'textarea').props.onChange({ target: { value: 'Posted real advice' } });
  await walk(commentView(), item => item.type === 'form').props.onSubmit({ preventDefault() {} });
  html = htmlFor(commentView()); assert.ok(html.includes('Posted real advice')); assert.equal(count, 3);
  // A post may settle after switching accounts while the same route stays mounted.
  let finishPost;
  fixtures.post = () => new Promise(resolve => { finishPost = resolve; });
  walk(commentView(), item => item.type === 'textarea').props.onChange({ target: { value: 'Old account pending advice' } });
  const pendingPost = walk(commentView(), item => item.type === 'form').props.onSubmit({ preventDefault() {} });
  fixtures.user = { id: 'other-reader', name: 'Other Reader' }; fixtures.comments = [];
  commentView(); await commentHooks.effects();
  finishPost({success:true,comment:{id:'stale-post',user_name:'River Reader',user_id:'reader',created_at:'2026-10-03T15:00:00Z',comment:'Old account pending advice'}});
  await pendingPost;
  assert.ok(!htmlFor(commentView()).includes('Old account pending advice')); assert.equal(count, 0);
  delete fixtures.post;
  // A deletion from the previous account must not remove a new account's loaded data.
  fixtures.user = { id: 'reader', name: 'Reader' };
  fixtures.comments = [{ id: 'old-owner', user_name: 'Reader', user_id: 'reader', created_at: '2026-10-03T15:00:00Z', comment: 'Original discussion' }];
  commentView(); await commentHooks.effects(); tree = commentView();
  let finishDelete; fixtures.delete = () => new Promise(resolve => { finishDelete = resolve; });
  const pendingDelete = walk(tree, item => item.type === 'button' && item.props['aria-label'] === 'Delete comment by Reader').props.onClick();
  fixtures.user = { id: 'other-reader', name: 'Other Reader' }; fixtures.comments = [{id:'new-account-data',user_name:'Other Reader',user_id:'other-reader',created_at:'2026-10-03T16:00:00Z',comment:'Fresh account discussion'}];
  commentView(); await commentHooks.effects(); finishDelete(true); await pendingDelete;
  assert.ok(htmlFor(commentView()).includes('Fresh account discussion')); assert.equal(count, 1);
  delete fixtures.delete;
  commentProps.isSharedCatch = false; tree = commentView(); await commentHooks.effects();
  html = htmlFor(commentView()); assert.ok(html.includes('This catch is private.') && !html.includes('Older real comment'));
  commentHooks.close();
  console.log('PASS Comments: genuine empty state, live count, working sort/post, private/Premium states and stale-account response isolation');

  const memberHooks = createHookHarness(); memberHooks.begin();
  const { default: SubscriptionPage } = await server.ssrLoadModule('/src/SubscriptionPage.tsx');
  const memberView = () => { memberHooks.begin(); return SubscriptionPage(); };
  fixtures.premium = false;
  fixtures.membershipPending = true; html = htmlFor(memberView()); assert.ok(html.includes('Checking membership') && !html.includes('Redeem code') && !html.includes('Try Premium'));
  fixtures.membershipPending = false;
  fixtures.redeem = async code => ({ success: false, message: `Rejected ${code}` });
  tree = memberView(); walk(tree, item => item.type === 'input').props.onChange({ target: { value: 'INVALID' } });
  walk(memberView(), item => item.type === 'form').props.onSubmit({ preventDefault() {} }); await new Promise(resolve => setImmediate(resolve));
  assert.ok(htmlFor(memberView()).includes('Rejected INVALID') && !fixtures.premium);
  fixtures.premium = true; fixtures.subscription = { appliedCoupon: 'KEEPNET1M' }; fixtures.cancel = async () => false;
  tree = memberView(); assert.ok(!htmlFor(tree).includes('coupon-redemption-card'));
  await walk(tree, item => item.type === 'button' && item.props.children === 'End trial and return to Lite').props.onClick();
  assert.ok(htmlFor(memberView()).includes('Your trial could not be ended.'));
  memberHooks.close();
  console.log('PASS Membership: server rejection is shown, active members see no acquisition CTA, failed cancellation stays honest');

  const mapHooks = createHookHarness(); mapHooks.begin();
  const { default: FisheriesDirectory } = await server.ssrLoadModule('/src/FisheriesDirectory.tsx');
  const mapView = () => { mapHooks.begin(); return FisheriesDirectory({ onStart() {} }); };
  fixtures.premium = false; fixtures.membershipPending = true; html = htmlFor(mapView()); assert.ok(html.includes('Checking membership') && !html.includes('Start 1-Month'));
  fixtures.membershipPending = false; mapView(); await mapHooks.effects(); assert.equal(fixtures.mapCalls.length, 0);
  fixtures.premium = true; tree = mapView(); walk(tree, item => item.props?.id === 'fisheries-map-container').props.ref.current = { innerHTML: '' };
  await mapHooks.effects(); mapView(); await mapHooks.effects();
  assert.ok(fixtures.mapCalls.includes('create'));
  assert.ok(fixtures.mapCalls.some(call => Array.isArray(call) && call[0] === 'markers' && call[1] > 0));
  mapHooks.close();
  console.log('PASS Fisheries: map initializes after Premium activation and populates markers after readiness');
} finally { await server.close(); delete globalThis.keepnetUiFixture; delete globalThis.keepnetUiHooks; }
