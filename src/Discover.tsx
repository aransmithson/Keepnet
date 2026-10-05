import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Fish, ChevronRight, ChevronLeft, Calendar,
  MapPin, Heart, Share2, Bookmark, Check, MoreHorizontal,
  Trophy, Flame, Users, Sparkles, Compass, CheckCircle2,
  Maximize2, MessageSquare
} from 'lucide-react';
import { useStore, actions, fmtDay, fmtTime, type Venue, type Session, type Catch } from './store';
import { fetchPublicSharedData, fetchCatchLikes, fetchUserCloudData } from './cloud';
import { useAuth } from './auth';

type Tab = 'for-you' | 'following' | 'nearby' | 'clubs';

interface CommunityFeedItem {
  id: string;
  species: string;
  weightLb: number;
  weightOz: number;
  userName: string;
  isVerified?: boolean;
  userAvatar?: string;
  venueName: string;
  timeAgo: string;
  caughtAt: string;
  images: string[];
  caption: string;
  bait: string;
  water: string;
  temperature: string;
  waterClarity: string;
  method: string;
  hashtags: string[];
  likesCount: number;
  commentsCount: number;
  isRealUserCatch?: boolean;
}

const FEATURED_CATCHES: CommunityFeedItem[] = [
  {
    id: 'sample-pike-1',
    species: 'Pike',
    weightLb: 11,
    weightOz: 7,
    userName: 'Aran',
    isVerified: true,
    userAvatar: '/images/avatar-aran.jpg',
    venueName: 'Wyreside, Lancashire',
    timeAgo: 'Yesterday at 16:51',
    caughtAt: '2026-10-04T16:51:00Z',
    images: [
      '/images/catch-pike-1.jpg',
      '/images/catch-sophie-pike.jpg',
      '/images/catch-carp-linear.jpg',
      '/images/challenge-pike.jpg',
    ],
    caption: 'Cracking pike from this afternoon on the slider. Slow day until this one smashed it on the drop near the reeds. Unreal fight! 🎣',
    bait: 'Salmo slider lure',
    water: 'Wyreside',
    temperature: '11°C',
    waterClarity: 'Clear water',
    method: 'Lure fishing',
    hashtags: ['#Pike', '#LureFishing', '#Wyreside', '#PredatorFishing'],
    likesCount: 42,
    commentsCount: 8,
  },
  {
    id: 'sample-pike-2',
    species: 'Pike',
    weightLb: 4,
    weightOz: 0,
    userName: 'SophieT',
    isVerified: false,
    userAvatar: '/images/catch-sophie-pike.jpg',
    venueName: 'River Ribble, Lancashire',
    timeAgo: '2 days ago',
    caughtAt: '2026-10-03T14:30:00Z',
    images: [
      '/images/catch-sophie-pike.jpg',
      '/images/catch-pike-1.jpg',
      '/images/challenge-pike.jpg',
    ],
    caption: 'First decent pike on the new setup! 🙌 Such a beautiful fish, released safely.',
    bait: 'Smelt',
    water: 'River Ribble',
    temperature: '9°C',
    waterClarity: 'Slightly coloured',
    method: 'Deadbaiting',
    hashtags: ['#Pike', '#RiverRibble', '#LureFishing', '#CatchAndRelease'],
    likesCount: 68,
    commentsCount: 12,
  },
  {
    id: 'sample-carp-1',
    species: 'Common Carp',
    weightLb: 28,
    weightOz: 6,
    userName: 'CarpDan',
    isVerified: false,
    userAvatar: '/images/avatar-tom.jpg',
    venueName: 'Linear Fisheries · St Johns',
    timeAgo: '3 days ago',
    caughtAt: '2026-10-02T07:15:00Z',
    images: [
      '/images/catch-carp-linear.jpg',
      '/images/chub.jpg',
      '/images/perch.jpg',
    ],
    caption: 'Autumn campaign off to a flyer! 28lb 6oz on the margins just as the mist cleared.',
    bait: '15mm Mainline Cell',
    water: 'Linear Fisheries',
    temperature: '12°C',
    waterClarity: 'Slightly murky',
    method: 'Boilie on Ronnie Rig',
    hashtags: ['#CarpFishing', '#LinearFisheries', '#SpecimenCarp', '#MainlineBaits'],
    likesCount: 98,
    commentsCount: 16,
  },
];

const STORIES = [
  { id: 'story-aran', name: 'Aran', avatar: '/images/avatar-aran.jpg', isUser: false },
  { id: 'story-pike', name: 'Pike Club', avatar: '/images/challenge-pike.jpg', isClub: true },
  { id: 'story-lake', name: 'Lake View', avatar: '/images/community-hero.jpg', isClub: true },
  { id: 'story-river', name: 'River Run', avatar: '/images/hero-river.jpg', isClub: true },
  { id: 'story-carp', name: 'Carp Crew', avatar: '/images/catch-carp-linear.jpg', isClub: true },
  { id: 'story-tom', name: 'TomL', avatar: '/images/avatar-tom.jpg', isUser: false },
  { id: 'story-sophie', name: 'SophieT', avatar: '/images/catch-sophie-pike.jpg', isUser: false },
  { id: 'story-ellie', name: 'Ellie.F', avatar: '/images/avatar-ellie.jpg', isUser: false },
];

export default function Discover({ onStart }: { onStart: (v: Venue) => void }) {
  const store = useStore();
  const { catches: localCatches, sessions: localSessions } = store;
  const { user } = useAuth();
  const nav = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('for-you');
  const [remoteCatches, setRemoteCatches] = useState<Catch[]>([]);
  const [remoteSessions, setRemoteSessions] = useState<Session[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Per-card carousel indices
  const [carouselIndex, setCarouselIndex] = useState<Record<string, number>>({});

  // Saved bookmarks state (persisted locally)
  const [savedCatches, setSavedCatches] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('keepnet_saved_catches') || '{}');
    } catch {
      return {};
    }
  });

  // Followed anglers state
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({
    Aran: true,
  });

  // Joined clubs state
  const [joinedClubs, setJoinedClubs] = useState<Record<string, boolean>>({
    'Pike Club': true,
  });

  // Sync cloud user subscription & shared data
  useEffect(() => {
    if (user && user.storageMode === 'cloud') {
      fetchUserCloudData(user).then((data) => {
        if (data?.subscription) {
          actions.setSubscription(data.subscription.tier, data.subscription.appliedCoupon, data.subscription.expiresAt);
        }
      });
    }
    fetchPublicSharedData().then((data) => {
      if (data.catches.length > 0) setRemoteCatches(data.catches);
      if (data.sessions.length > 0) setRemoteSessions(data.sessions);
    });
    fetchCatchLikes().then((likes) => {
      if (likes && Object.keys(likes).length > 0) {
        actions.setAllCatchLikes(likes);
      }
    });
  }, [user]);

  // Merge real user shared catches with featured community catches
  const allFeedItems = useMemo<CommunityFeedItem[]>(() => {
    // 1. Process real user shared catches
    const realItems: CommunityFeedItem[] = [];
    const sharedIds = new Set<string>();

    const candidateCatches = [
      ...localCatches.filter((c) => c.isShared),
      ...remoteCatches.filter((c) => c.isShared),
    ];

    candidateCatches.forEach((c) => {
      if (sharedIds.has(c.id)) return;
      sharedIds.add(c.id);

      const sess = localSessions.find((s) => s.id === c.sessionId) || remoteSessions.find((s) => s.id === c.sessionId);
      const images: string[] = [];
      if (c.image) images.push(c.image);
      if (c.images && c.images.length > 0) {
        c.images.forEach((img) => {
          if (!images.includes(img)) images.push(img);
        });
      }
      if (images.length === 0) {
        images.push('/images/catch-pike-1.jpg');
      }

      realItems.push({
        id: c.id,
        species: c.species,
        weightLb: c.weightLb,
        weightOz: c.weightOz,
        userName: c.userName || sess?.userName || 'Keepnet Angler',
        isVerified: false,
        venueName: sess?.venueName || 'UK Waters',
        timeAgo: fmtDay(c.caughtAt) + ' · ' + fmtTime(c.caughtAt),
        caughtAt: c.caughtAt,
        images,
        caption: c.notes || `Spectacular ${c.species} caught on ${c.bait || 'natural bait'}.`,
        bait: c.bait || 'Natural bait',
        water: sess?.venueName || 'British Waters',
        temperature: sess?.weather?.temperature ? `${Math.round(sess.weather.temperature)}°C` : '12°C',
        waterClarity: 'Clear water',
        method: c.method || 'Bankside angling',
        hashtags: [`#${c.species.replace(/\s+/g, '')}`, '#KeepnetApp', '#SpecimenAngler'],
        likesCount: c.likesCount || 0,
        commentsCount: 0,
        isRealUserCatch: true,
      });
    });

    // Featured catches + real user catches
    return [...FEATURED_CATCHES, ...realItems];
  }, [localCatches, remoteCatches, localSessions, remoteSessions]);

  // Filter feed based on active tab, search query, or tag
  const filteredFeed = useMemo(() => {
    return allFeedItems.filter((item) => {
      // Tab filter
      if (activeTab === 'following' && !followingMap[item.userName]) return false;

      // Tag filter
      if (selectedTag) {
        const matchesTag =
          item.species.toLowerCase().includes(selectedTag.toLowerCase()) ||
          item.method.toLowerCase().includes(selectedTag.toLowerCase()) ||
          item.hashtags.some((h) => h.toLowerCase().includes(selectedTag.toLowerCase()));
        if (!matchesTag) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQuery =
          item.species.toLowerCase().includes(q) ||
          item.userName.toLowerCase().includes(q) ||
          item.venueName.toLowerCase().includes(q) ||
          item.bait.toLowerCase().includes(q) ||
          item.caption.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [allFeedItems, activeTab, followingMap, selectedTag, searchQuery]);

  const handleToggleSave = (id: string) => {
    setSavedCatches((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem('keepnet_saved_catches', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleToggleFollow = (userName: string) => {
    setFollowingMap((prev) => ({
      ...prev,
      [userName]: !prev[userName],
    }));
  };

  const handleShare = async (item: CommunityFeedItem) => {
    const url = `${window.location.origin}/catches/${item.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${item.species} (${item.weightLb}lb ${item.weightOz}oz) - Keepnet`,
          text: item.caption,
          url,
        });
      } catch {}
    } else {
      navigator.clipboard.writeText(url);
      alert('Catch report link copied to clipboard!');
    }
  };

  const nextImage = (cardId: string, maxLen: number) => {
    setCarouselIndex((prev) => {
      const cur = prev[cardId] || 0;
      return { ...prev, [cardId]: (cur + 1) % maxLen };
    });
  };

  const prevImage = (cardId: string, maxLen: number) => {
    setCarouselIndex((prev) => {
      const cur = prev[cardId] || 0;
      return { ...prev, [cardId]: cur === 0 ? maxLen - 1 : cur - 1 };
    });
  };

  return (
    <div className="content" style={{ padding: '0 16px 84px' }}>
      {/* Category Pills Header Bar (Mobile Screen 1) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 0 12px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        <button
          type="button"
          className={`community-tab-pill ${activeTab === 'for-you' ? 'active' : ''}`}
          onClick={() => { setActiveTab('for-you'); setSelectedTag(null); }}
        >
          <Sparkles size={14} />
          <span>For You</span>
        </button>

        <button
          type="button"
          className={`community-tab-pill ${activeTab === 'following' ? 'active' : ''}`}
          onClick={() => { setActiveTab('following'); setSelectedTag(null); }}
        >
          <Check size={14} />
          <span>Following</span>
        </button>

        <button
          type="button"
          className={`community-tab-pill ${activeTab === 'nearby' ? 'active' : ''}`}
          onClick={() => { setActiveTab('nearby'); setSelectedTag(null); }}
        >
          <MapPin size={14} />
          <span>Nearby</span>
        </button>

        <button
          type="button"
          className={`community-tab-pill ${activeTab === 'clubs' ? 'active' : ''}`}
          onClick={() => { setActiveTab('clubs'); setSelectedTag(null); }}
        >
          <Users size={14} />
          <span>Clubs</span>
        </button>
      </div>

      {/* Stories / Anglers Horizontal Reel (Mobile Screen 1) */}
      <div className="community-stories-bar">
        {/* + Your Story item */}
        <button
          type="button"
          className="story-item-btn"
          onClick={() => onStart({
            id: 'wyreside-lakes',
            name: 'Wyreside Lakes',
            type: 'Lake',
            lat: 53.97,
            lon: -2.78,
            targets: ['Pike', 'Carp'],
            description: 'Log story to community',
          })}
          title="Share a catch to your story"
        >
          <div className="story-avatar-wrap add-story">
            <Plus size={22} />
          </div>
          <span className="story-name-label">Your Story</span>
        </button>

        {/* Stories Items */}
        {STORIES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="story-item-btn"
            onClick={() => {
              if (s.name === 'Aran' || s.name === 'TomL' || s.name === 'SophieT') {
                setSearchQuery(s.name);
              } else {
                setSelectedTag(s.name.replace(' Club', '').replace(' View', '').replace(' Run', '').replace(' Crew', ''));
              }
            }}
          >
            <div className="story-avatar-wrap ring-active">
              <div className="story-avatar-inner">
                <img src={s.avatar} alt={s.name} loading="lazy" />
              </div>
            </div>
            <span className="story-name-label">{s.name}</span>
          </button>
        ))}
      </div>

      {/* Main 2-Column Responsive Layout */}
      <div className="community-layout-grid">
        {/* Left Column: Community Catch Reports Feed */}
        <div className="community-feed-col">
          {filteredFeed.length === 0 ? (
            <div className="card" style={{ padding: '36px 16px', textAlign: 'center', margin: '20px 0' }}>
              <Fish size={36} color="var(--text-secondary)" style={{ opacity: 0.5, margin: '0 auto 10px' }} />
              <h3 className="serif" style={{ margin: '0 0 6px' }}>No catch reports found</h3>
              <p className="muted" style={{ fontSize: 13, margin: '0 auto 16px', maxWidth: 320 }}>
                Try selecting "For You" or clearing search filters to see all community catches.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => { setActiveTab('for-you'); setSearchQuery(''); setSelectedTag(null); }}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            filteredFeed.map((item) => {
              const curImgIdx = carouselIndex[item.id] || 0;
              const isLiked = actions.isCatchLiked(item.id);
              const likesCount = actions.getCatchLikesCount(item.id, item.likesCount);
              const isSaved = !!savedCatches[item.id];
              const isFollowing = !!followingMap[item.userName];

              return (
                <article key={item.id} className="social-card">
                  {/* Card Header (Mobile Screen 1) */}
                  <div className="social-card-header">
                    <div className="social-card-user-info">
                      <img
                        src={item.userAvatar || '/images/avatar-aran.jpg'}
                        alt={item.userName}
                        className="social-card-avatar"
                        loading="lazy"
                      />
                      <div>
                        <div className="social-card-author-name">
                          <span>{item.userName}</span>
                          {item.isVerified && (
                            <CheckCircle2 size={14} className="verified-badge" fill="#2EB872" color="#fff" />
                          )}
                        </div>
                        <div className="social-card-location-time">
                          <span>{item.timeAgo}</span>
                          <span> · 📍 {item.venueName}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {item.userName !== 'Aran' && (
                        <button
                          type="button"
                          className={`social-btn-follow ${isFollowing ? 'following' : 'not-following'}`}
                          onClick={() => handleToggleFollow(item.userName)}
                        >
                          {isFollowing ? (
                            <>
                              <Check size={12} />
                              <span>Following</span>
                            </>
                          ) : (
                            <>
                              <Plus size={12} />
                              <span>Follow</span>
                            </>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ width: 30, height: 30, color: 'var(--text-secondary)' }}
                        aria-label="Options"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Media Carousel (Mobile Screen 1) */}
                  <div className="social-card-media-wrap">
                    <img
                      src={item.images[curImgIdx] || item.images[0]}
                      alt={item.species}
                      className="social-card-img"
                      loading="lazy"
                      onClick={() => nav(`/catches/${item.id}`)}
                      style={{ cursor: 'pointer' }}
                    />

                    {/* 1/4 Counter Badge */}
                    <div className="carousel-counter-badge">
                      {curImgIdx + 1}/{item.images.length}
                    </div>

                    {/* Navigation Chevrons */}
                    {item.images.length > 1 && (
                      <>
                        <button
                          type="button"
                          className="carousel-nav-btn prev"
                          onClick={(e) => { e.stopPropagation(); prevImage(item.id, item.images.length); }}
                          aria-label="Previous photo"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          type="button"
                          className="carousel-nav-btn next"
                          onClick={(e) => { e.stopPropagation(); nextImage(item.id, item.images.length); }}
                          aria-label="Next photo"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Species Title & Green Weight (Mobile Screen 1) */}
                  <div style={{ marginBottom: 4 }}>
                    <Link to={`/catches/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <h2 className="social-card-species">{item.species}</h2>
                    </Link>
                    <div className="catch-weight-green">
                      {item.weightLb} lb {item.weightOz} oz
                    </div>
                  </div>

                  {/* Caption */}
                  <p className="social-card-caption">
                    {item.caption}
                  </p>

                  {/* Tactical Attribute Tiles Grid (Mobile Screen 1 & 2) */}
                  <div className="tactical-grid-2x2">
                    <div className="tactical-cell">
                      <div className="tactical-cell-icon">🎣</div>
                      <div className="tactical-cell-info">
                        <span className="tactical-cell-val">{item.bait}</span>
                        <span className="tactical-cell-lbl">Bait</span>
                      </div>
                    </div>

                    <div className="tactical-cell">
                      <div className="tactical-cell-icon">〰️</div>
                      <div className="tactical-cell-info">
                        <span className="tactical-cell-val">{item.water}</span>
                        <span className="tactical-cell-lbl">Water</span>
                      </div>
                    </div>
                  </div>

                  <div className="tactical-grid-3x1">
                    <div className="tactical-cell">
                      <div className="tactical-cell-icon">🌡️</div>
                      <div className="tactical-cell-info">
                        <span className="tactical-cell-val">{item.temperature}</span>
                        <span className="tactical-cell-lbl">Conditions</span>
                      </div>
                    </div>

                    <div className="tactical-cell">
                      <div className="tactical-cell-icon">〰️</div>
                      <div className="tactical-cell-info">
                        <span className="tactical-cell-val">{item.waterClarity}</span>
                        <span className="tactical-cell-lbl">Water clarity</span>
                      </div>
                    </div>

                    <div className="tactical-cell">
                      <div className="tactical-cell-icon">🎯</div>
                      <div className="tactical-cell-info">
                        <span className="tactical-cell-val">{item.method}</span>
                        <span className="tactical-cell-lbl">Method</span>
                      </div>
                    </div>
                  </div>

                  {/* Social Actions Bar (Mobile Screen 1) */}
                  <div className="social-actions-bar">
                    <div className="social-action-btn-group">
                      {/* Like Button */}
                      <button
                        type="button"
                        className={`social-action-btn ${isLiked ? 'liked' : ''}`}
                        onClick={() => actions.toggleCatchLike(item.id)}
                        aria-label="Like catch"
                      >
                        <Heart size={18} fill={isLiked ? '#ef4444' : 'none'} color={isLiked ? '#ef4444' : 'currentColor'} />
                        <span>{likesCount}</span>
                      </button>

                      {/* Comment Button */}
                      <button
                        type="button"
                        className="social-action-btn"
                        onClick={() => nav(`/catches/${item.id}`)}
                        aria-label="Comments"
                      >
                        <MessageSquare size={17} />
                        <span>{item.commentsCount}</span>
                      </button>

                      {/* Share Button */}
                      <button
                        type="button"
                        className="social-action-btn"
                        onClick={() => handleShare(item)}
                        aria-label="Share catch"
                      >
                        <Share2 size={16} />
                        <span>Share</span>
                      </button>

                      {/* Save / Bookmark Button */}
                      <button
                        type="button"
                        className={`social-action-btn ${isSaved ? 'saved' : ''}`}
                        onClick={() => handleToggleSave(item.id)}
                        aria-label="Save catch"
                      >
                        <Bookmark size={16} fill={isSaved ? 'var(--copper)' : 'none'} color={isSaved ? 'var(--copper)' : 'currentColor'} />
                        <span>Save</span>
                      </button>
                    </div>

                    <Link to={`/catches/${item.id}`} className="btn-view-report">
                      <span>View Report</span>
                      <ChevronRight size={13} />
                    </Link>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Right Column: Widgets (Search, Mini Map, Trending, Leaderboard, Challenge) */}
        <aside className="community-sidebar-col">
          {/* 1. Search Catches & Quick Filter Chips Widget */}
          <div className="sidebar-widget">
            <div className="sidebar-search-box">
              <Compass size={15} color="var(--text-secondary)" />
              <input
                type="text"
                placeholder="Search catches, anglers, waters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="sidebar-search-input"
              />
            </div>
            <div className="sidebar-quick-tags">
              {['Pike', 'Carp', 'Perch', 'Trout', 'Lure Fishing', 'Fly Fishing'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`quick-tag-chip ${selectedTag === tag ? 'active' : ''}`}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Explore Near You Mini Map Widget */}
          <div className="sidebar-widget">
            <div className="sidebar-widget-header">
              <div>
                <h3 className="sidebar-widget-title">
                  <MapPin size={16} color="#2EB872" />
                  <span>Explore Near You</span>
                </h3>
                <span className="sidebar-widget-subtitle">Find catches and anglers in your area</span>
              </div>
            </div>

            <div className="mini-map-container">
              <div className="mini-map-pins-layer">
                {/* Visual pins positioned like the mock */}
                <div className="map-pin-pill" style={{ top: '22%', right: '28%' }}>
                  <MapPin size={10} color="#2EB872" />
                  <span>Wyreside · 142 catches</span>
                </div>
                <div className="map-pin-pill" style={{ bottom: '26%', left: '16%' }}>
                  <MapPin size={10} color="#2EB872" />
                  <span>Ribble · 87 catches</span>
                </div>
                <div className="map-pin-pill" style={{ top: '60%', right: '14%' }}>
                  <MapPin size={10} color="#2EB872" />
                  <span>Stocks Reservoir · 64</span>
                </div>
              </div>
              <Link to="/fisheries" className="map-expand-btn" title="Explore full directory">
                <Maximize2 size={13} />
              </Link>
            </div>

            <Link to="/fisheries" className="btn-explore-map">
              <span>Explore Map View</span>
              <ChevronRight size={14} />
            </Link>
          </div>

          {/* 3. Trending Catches Widget */}
          <div className="sidebar-widget">
            <div className="sidebar-widget-header">
              <h3 className="sidebar-widget-title">
                <Flame size={16} color="#ef4444" />
                <span>Trending Catches</span>
              </h3>
              <span className="sidebar-widget-subtitle" style={{ color: 'var(--text-secondary)' }}>This week ▾</span>
            </div>

            <div>
              <Link to="/catches/sample-pike-1" className="trending-catch-row">
                <img src="/images/catch-pike-1.jpg" alt="Pike" className="trending-catch-thumb" loading="lazy" />
                <div className="trending-catch-info">
                  <div className="trending-catch-name">Pike · 9 lb 4 oz</div>
                  <div className="trending-catch-meta">TomL · River Ribble</div>
                </div>
                <div className="trending-catch-likes">
                  <Heart size={13} fill="#ef4444" color="#ef4444" />
                  <span>124</span>
                </div>
              </Link>

              <Link to="/catches/sample-carp-1" className="trending-catch-row">
                <img src="/images/catch-carp-linear.jpg" alt="Common Carp" className="trending-catch-thumb" loading="lazy" />
                <div className="trending-catch-info">
                  <div className="trending-catch-name">Common Carp · 28 lb 6 oz</div>
                  <div className="trending-catch-meta">CarpDan · Linear Fisheries</div>
                </div>
                <div className="trending-catch-likes">
                  <Heart size={13} fill="#ef4444" color="#ef4444" />
                  <span>98</span>
                </div>
              </Link>

              <Link to="/catches/sample-pike-2" className="trending-catch-row">
                <img src="/images/perch.jpg" alt="Perch" className="trending-catch-thumb" loading="lazy" />
                <div className="trending-catch-info">
                  <div className="trending-catch-name">Perch · 2 lb 1 oz</div>
                  <div className="trending-catch-meta">Ellie.F · Windermere</div>
                </div>
                <div className="trending-catch-likes">
                  <Heart size={13} fill="#ef4444" color="#ef4444" />
                  <span>76</span>
                </div>
              </Link>
            </div>
          </div>

          {/* 4. Top Anglers This Week Widget */}
          <div className="sidebar-widget">
            <div className="sidebar-widget-header">
              <h3 className="sidebar-widget-title">
                <Trophy size={16} color="var(--copper)" />
                <span>Top Anglers This Week</span>
              </h3>
              <Link to="/profile" className="sidebar-widget-link">
                View All →
              </Link>
            </div>

            <div>
              {[
                { rank: 1, name: 'TomL', catches: 27, pts: 348, avatar: '/images/avatar-tom.jpg' },
                { rank: 2, name: 'SophieT', catches: 22, pts: 312, avatar: '/images/catch-sophie-pike.jpg' },
                { rank: 3, name: 'CarpDan', catches: 19, pts: 288, avatar: '/images/catch-carp-linear.jpg' },
                { rank: 4, name: 'Aran', catches: 18, pts: 276, avatar: '/images/avatar-aran.jpg' },
                { rank: 5, name: 'Ellie.F', catches: 15, pts: 244, avatar: '/images/avatar-ellie.jpg' },
              ].map((a) => (
                <div key={a.rank} className="top-angler-row">
                  <span className={`rank-badge rank-${a.rank}`}>{a.rank}</span>
                  <img src={a.avatar} alt={a.name} className="top-angler-avatar" loading="lazy" />
                  <div className="top-angler-info">
                    <div className="top-angler-name">{a.name}</div>
                    <div className="top-angler-catches">{a.catches} catches</div>
                  </div>
                  <div className="top-angler-points">
                    <span>👑 {a.pts}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 5. Community Challenge Widget */}
          <div className="sidebar-widget">
            <div className="sidebar-widget-header">
              <h3 className="sidebar-widget-title">
                <Calendar size={15} color="#2EB872" />
                <span>Community Challenge</span>
              </h3>
              <span className="sidebar-widget-subtitle">Ends in 12 days</span>
            </div>

            <div className="challenge-widget-banner">
              <img src="/images/challenge-pike.jpg" alt="Pike Season Challenge" loading="lazy" />
            </div>

            <h4 className="challenge-widget-title">Pike Season Challenge</h4>
            <p className="challenge-widget-desc">
              Log your best pike this month for a chance to win Keepnet gear and be featured!
            </p>

            <button
              type="button"
              className="btn-join-challenge"
              onClick={() => onStart({
                id: 'challenge-water',
                name: 'Pike Challenge Water',
                type: 'River',
                lat: 53.8,
                lon: -2.7,
                targets: ['Pike'],
                description: 'Pike Season Challenge session',
              })}
            >
              <span>Join Challenge</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* 6. Suggested Anglers & Clubs Widget */}
          <div className="sidebar-widget">
            <div className="sidebar-widget-header">
              <h3 className="sidebar-widget-title">
                <Users size={16} color="var(--text-secondary)" />
                <span>Suggested Anglers &amp; Clubs</span>
              </h3>
              <span className="sidebar-widget-subtitle">See More →</span>
            </div>

            <div>
              {[
                { name: 'Pike Club', members: '1.2K members', icon: '🎣' },
                { name: 'Northern Specimen', members: '3.4K members', icon: '🏆' },
                { name: 'Lake View Anglers', members: '892 members', icon: '🌊' },
              ].map((club) => {
                const isJoined = !!joinedClubs[club.name];
                return (
                  <div key={club.name} className="suggested-club-row">
                    <div className="suggested-club-avatar">{club.icon}</div>
                    <div className="suggested-club-info">
                      <div className="suggested-club-name">{club.name}</div>
                      <div className="suggested-club-members">{club.members}</div>
                    </div>
                    <button
                      type="button"
                      className={`btn-club-join ${isJoined ? 'joined' : ''}`}
                      onClick={() => setJoinedClubs((prev) => ({ ...prev, [club.name]: !prev[club.name] }))}
                    >
                      {isJoined ? 'Joined' : 'Join'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
