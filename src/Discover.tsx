import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Fish, ChevronRight, ChevronLeft, MapPin, Heart, Share2, Bookmark, Check, Users, MessageSquare, Search, X, Home, Waves, Thermometer, LocateFixed, RefreshCw } from 'lucide-react';
import { useStore, actions, fmtDay, fmtTime, fmtWeight, type Venue, type Session, type Catch } from './store';
import { fetchPublicSharedData, fetchCatchLikes, fetchCatchCommentCounts } from './cloud';
import { useAuth } from './auth';
import Avatar from './Avatar';

type Tab = 'for-you' | 'following' | 'saved';
type Preference = Record<string, boolean>;
function readPreference(key: string): Preference {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([, selected]) => selected === true)) as Preference : {};
  } catch { return {}; }
}

export default function Discover({ onStart: _onStart }: { onStart: (venue: Venue) => void }) {
  const { catches: localCatches, sessions: localSessions, savedCatchIds = [] } = useStore();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('for-you');
  const [remoteCatches, setRemoteCatches] = useState<Catch[]>([]);
  const [remoteSessions, setRemoteSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const searchOpen = searchParams.get('search') === '1';
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState<Record<string, number>>({});
  const preferenceOwner = user?.id || 'guest';
  const followingKey = `keepnet:followed_anglers:${preferenceOwner}`;
  const [following, setFollowing] = useState<Preference>(() => readPreference(followingKey));
  const [commentCounts, setCommentCounts] = useState<Record<string, number> | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setFollowing(readPreference(followingKey));
  }, [followingKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetchPublicSharedData().then(data => {
      if (!cancelled) { setRemoteCatches(data.catches); setRemoteSessions(data.sessions); }
    }).catch(() => { if (!cancelled) setLoadError(true); }).finally(() => { if (!cancelled) setLoading(false); });
    fetchCatchLikes().then(likes => { if (!cancelled) actions.setAllCatchLikes(likes); }).catch(() => {});
    fetchCatchCommentCounts().then(counts => { if (!cancelled) setCommentCounts(counts); }).catch(() => {});
    return () => { cancelled = true; };
  }, [retry, user?.id]);

  const feed = useMemo(() => {
    const items = new Map<string, Catch>();
    for (const record of [...remoteCatches, ...localCatches]) {
      if (record.isShared && !record.isConfidential && !record.id.startsWith('sample-')) items.set(record.id, record);
    }
    return [...items.values()].sort((a, b) => new Date(b.caughtAt).getTime() - new Date(a.caughtAt).getTime());
  }, [remoteCatches, localCatches]);
  const sessionFor = (record: Catch) => localSessions.find(session => session.id === record.sessionId) || remoteSessions.find(session => session.id === record.sessionId);
  const authorKey = (record: Catch) => record.userId || record.userName || sessionFor(record)?.userName || '';
  const filtered = feed.filter(record => {
    if (activeTab === 'following' && !following[authorKey(record)]) return false;
    if (activeTab === 'saved' && !savedCatchIds.includes(record.id)) return false;
    if (selectedTag && !`${record.species} ${record.method || ''}`.toLowerCase().includes(selectedTag.toLowerCase())) return false;
    if (searchQuery.trim()) {
      const text = `${record.species} ${record.userName || ''} ${sessionFor(record)?.venueName || ''} ${record.bait || ''} ${record.notes || ''}`.toLowerCase();
      if (!text.includes(searchQuery.trim().toLowerCase())) return false;
    }
    return true;
  });
  const resetFilters = () => { setSearchQuery(''); setSelectedTag(null); };
  const hasFilters = Boolean(searchQuery.trim() || selectedTag);
  const togglePreference = (key: string, current: Preference, id: string, update: (value: Preference) => void) => {
    const next = { ...current, [id]: !current[id] };
    update(next);
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { setFeedback('Your selection is saved for this visit. Device storage could not save it for next time.'); }
  };
  const changePhoto = (id: string, count: number, offset: number) => setCarouselIndex(current => ({ ...current, [id]: ((current[id] || 0) + offset + count) % count }));
  const shareCatch = async (record: Catch) => {
    const url = `${window.location.origin}/catches/${record.id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${record.species} · ${fmtWeight(record)} · Keepnet`, url });
      else { await navigator.clipboard.writeText(url); setFeedback('Catch link copied.'); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setFeedback('The link could not be shared. Please try again.');
    }
  };

  return <div className="content community-page">
    <h1 className="sr-only">Community catches</h1>
    <nav className="community-category-bar" aria-label="Community feed views">
      {([{ id: 'for-you', title: 'For You', Icon: Home }, { id: 'following', title: 'Following', Icon: Users }, { id: 'saved', title: 'Saved', Icon: Bookmark }] as const).map(({ id, title, Icon }) => <button type="button" key={id} className={`community-tab-pill ${activeTab === id ? 'active' : ''}`} aria-pressed={activeTab === id} onClick={() => setActiveTab(id)}><Icon size={16} aria-hidden="true" /><span>{title}</span></button>)}
    </nav>
    <div className="community-water-link"><Link to="/fisheries"><MapPin size={16} /> Explore fisheries <ChevronRight size={16} /></Link></div>
    {searchOpen && <div className="mobile-discover-search-bar">
      <div className="mobile-search-input-wrap"><Search size={18} aria-hidden="true" /><input autoFocus type="search" placeholder="Search catches, anglers or waters…" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} className="mobile-search-input" aria-label="Search community catches, anglers or waters" />{searchQuery && <button className="icon-btn" type="button" onClick={() => setSearchQuery('')} aria-label="Clear search"><X size={17} /></button>}</div>
      <div className="mobile-quick-tags-scroll" role="group" aria-label="Filter catches by species or method">{['All', 'Pike', 'Carp', 'Perch', 'Trout', 'Lure fishing', 'Fly fishing'].map(tag => <button type="button" key={tag} className={`quick-tag-chip ${(tag === 'All' ? !selectedTag : selectedTag === tag) ? 'active' : ''}`} aria-pressed={tag === 'All' ? !selectedTag : selectedTag === tag} onClick={() => setSelectedTag(tag === 'All' ? null : tag)}>{tag}</button>)}</div>
      <button className="community-search-close" type="button" onClick={() => setSearchParams({})}><X size={15} /> Hide search</button>
    </div>}
    {hasFilters && <div className="community-active-filters" role="status"><span>Showing {selectedTag ? `${selectedTag} catches` : 'catches'}{searchQuery.trim() && ` matching “${searchQuery.trim()}”`}</span><button type="button" onClick={resetFilters}>Clear filters <X size={15} /></button></div>}
    {feedback && <div className="community-feedback" role="status"><span>{feedback}</span><button type="button" className="icon-btn" aria-label="Dismiss message" onClick={() => setFeedback(null)}><X size={16} /></button></div>}
    {loadError && <div className="community-feedback" role="alert"><span>Community catches could not refresh. Previously loaded catches remain available.</span><button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
    {loading && !feed.length ? <p className="community-loading" role="status"><RefreshCw size={19} className="spin" aria-hidden="true" /> Loading community catches…</p> : !filtered.length ? <section className="card community-empty">
      <Fish size={36} aria-hidden="true" /><h2>{activeTab === 'following' ? 'No catches from followed anglers' : activeTab === 'saved' ? 'No saved catches in this view' : hasFilters ? 'No catches match these filters' : 'No shared catches yet'}</h2>
      <p>{activeTab === 'following' ? 'Follow an angler from their catch report to find their catches here.' : activeTab === 'saved' ? 'Use Save on a community catch to bookmark it on this device.' : hasFilters ? 'Try a different species, angler or water.' : 'Shared catches from community members will appear here.'}</p>
      {(hasFilters || activeTab !== 'for-you') ? <button type="button" className="btn-secondary" onClick={() => { resetFilters(); setActiveTab('for-you'); }}>Show all catches</button> : <Link className="btn-secondary" to="/sessions">Go to your journal <ChevronRight size={17} /></Link>}
    </section> : <div className="community-feed-col">{filtered.map(record => {
      const session = sessionFor(record);
      const images = [...new Set([record.image, ...(record.images || [])].filter((image): image is string => Boolean(image)))];
      const index = Math.min(carouselIndex[record.id] || 0, Math.max(0, images.length - 1));
      const name = record.userName || session?.userName || 'Angler';
      const key = authorKey(record);
      const liked = actions.isCatchLiked(record.id);
      const saved = savedCatchIds.includes(record.id);
      const likes = actions.getCatchLikesCount(record.id, record.likesCount);
      const comments = commentCounts === null ? '—' : commentCounts[record.id] || 0;
      const url = `/catches/${record.id}`;
      return <article className="social-card" key={record.id}>
        <div className="social-card-header"><div className="social-card-user-info"><Avatar name={name} className="social-card-avatar" /><div><div className="social-card-author-name">{name}</div><div className="social-card-location-time"><time dateTime={record.caughtAt}>{fmtDay(record.caughtAt)} · {fmtTime(record.caughtAt)}</time>{session && <span><MapPin size={12} aria-hidden="true" /> {session.isConfidential ? 'Confidential water' : session.venueName}</span>}</div></div></div>
          {key && record.userId !== user?.id && <button className={`social-btn-follow ${following[key] ? 'following' : 'not-following'}`} type="button" aria-pressed={Boolean(following[key])} aria-label={`${following[key] ? 'Unfollow' : 'Follow'} ${name}`} onClick={() => togglePreference(followingKey, following, key, setFollowing)}>{following[key] ? <Check size={15} /> : <Users size={15} />}<span>{following[key] ? 'Following' : 'Follow'}</span></button>}
        </div>
        <div className="social-card-media-wrap"><Link to={url} className={`community-catch-photo ${images.length ? '' : 'without-photo'}`} aria-label={`View ${name}'s ${record.species} catch`}>{images.length ? <img src={images[index]} alt={record.species} className="social-card-img" loading="lazy" /> : <><Fish size={45} aria-hidden="true" /><span>No catch photo</span></>}</Link>{images.length > 1 && <><span className="carousel-counter-badge" aria-live="polite">{index + 1}/{images.length}</span><button type="button" className="carousel-nav-btn prev" aria-label="Previous photo" onClick={() => changePhoto(record.id, images.length, -1)}><ChevronLeft size={20} /></button><button type="button" className="carousel-nav-btn next" aria-label="Next photo" onClick={() => changePhoto(record.id, images.length, 1)}><ChevronRight size={20} /></button></>}</div>
        <Link to={url}><h2 className="social-card-species">{record.species}</h2></Link><div className="catch-weight-green">{fmtWeight(record)}</div>{record.notes && <p className="social-card-caption">{record.notes}</p>}
        <div className="tactical-grid-2x2"><div className="tactical-cell"><Fish size={23} className="tactical-cell-icon" aria-hidden="true" /><div className="tactical-cell-info"><span className="tactical-cell-val">{record.bait || 'Not logged'}</span><span className="tactical-cell-lbl">Bait</span></div></div><div className="tactical-cell"><Waves size={23} className="tactical-cell-icon" aria-hidden="true" /><div className="tactical-cell-info"><span className="tactical-cell-val">{session?.isConfidential ? 'Confidential water' : session?.venueName || 'Not logged'}</span><span className="tactical-cell-lbl">Water</span></div></div></div>
        <div className="tactical-grid-2x2"><div className="tactical-cell"><Thermometer size={23} className="tactical-cell-icon temperature-icon" aria-hidden="true" /><div className="tactical-cell-info"><span className="tactical-cell-val">{session?.weather ? `${Math.round(session.weather.temperature)}°C` : 'Not logged'}</span><span className="tactical-cell-lbl">Conditions</span></div></div><div className="tactical-cell"><LocateFixed size={23} className="tactical-cell-icon" aria-hidden="true" /><div className="tactical-cell-info"><span className="tactical-cell-val">{record.method || 'Not logged'}</span><span className="tactical-cell-lbl">Method</span></div></div></div>
        <div className="social-actions-bar"><div className="social-action-btn-group"><button type="button" className={`social-action-btn ${liked ? 'liked' : ''}`} aria-pressed={liked} aria-label={user ? `${liked ? 'Unlike' : 'Like'} catch, ${likes} likes` : `Sign in to like this catch, ${likes} likes`} title={user ? undefined : 'Sign in to like catches'} disabled={!user} onClick={() => actions.toggleCatchLike(record.id)}><Heart size={20} fill={liked ? 'currentColor' : 'none'} /><span>{likes}</span></button><Link className="social-action-btn" to={`${url}#comments-section`} aria-label={`View comments${comments === '—' ? '' : `, ${comments} comments`}`}><MessageSquare size={20} /><span>{comments}</span></Link><button type="button" className="social-action-btn" aria-label="Share catch link" onClick={() => shareCatch(record)}><Share2 size={20} /><span>Share</span></button><button type="button" className={`social-action-btn ${saved ? 'saved' : ''}`} aria-pressed={saved} aria-label={`${saved ? 'Remove saved' : 'Save'} catch`} onClick={() => actions.toggleCatchSave(record.id)}><Bookmark size={20} fill={saved ? 'currentColor' : 'none'} /><span>{saved ? 'Saved' : 'Save'}</span></button></div></div>
      </article>;
    })}</div>}
  </div>;
}
