import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Fish, LocateFixed, Globe, ChevronRight, CloudSun, Calendar, User, X,
  Search, MapPin, Compass, Heart, Lock, Crown, Gift, Sparkles, Zap, EyeOff, ShieldCheck, MessageSquare
} from 'lucide-react';
import { useStore, actions, fmtWeight, fmtDay, fmtTime, type Venue, type Session, type Catch } from './store';
import { getDevicePosition } from './weather';
import { createMap, type MapEngine, type MapMarker } from './map';
import { useTheme } from './theme';
import { fetchPublicSharedData, fetchCatchLikes, fetchUserCloudData } from './cloud';
import { useAuth } from './auth';

type DirectoryTab = 'catches' | 'sessions';

const STATIC_SAMPLE_CATCHES = [
  {
    id: 'sample-1',
    species: 'Mirror Carp',
    weightLb: 28,
    weightOz: 4,
    bait: '15mm Mainline Cell boilies over hemp',
    venueName: 'Linear Fisheries · St Johns Lake',
    userName: 'Dave K.',
    caughtAt: '2026-10-02T06:45:00Z',
    likesCount: 14,
    notes: 'Classic early morning dawn run on the margins. Autumn specimen campaign off to a flyer!',
  },
  {
    id: 'sample-2',
    species: 'Perch',
    weightLb: 3,
    weightOz: 12,
    bait: '3" drop-shot minnow (Firetiger pattern)',
    venueName: 'River Thames · Sonning Lock',
    userName: 'Mark T.',
    caughtAt: '2026-10-03T16:15:00Z',
    likesCount: 9,
    notes: 'Hit the lure hard right under the lock weir sill as light was fading. Huge striped predator.',
  },
  {
    id: 'sample-3',
    species: 'Chub',
    weightLb: 6,
    weightOz: 2,
    bait: 'Free-lined luncheon meat & bread flake',
    venueName: 'River Severn · Bridgnorth',
    userName: 'Gaz W.',
    caughtAt: '2026-10-04T11:20:00Z',
    likesCount: 11,
    notes: 'Trotted along the willow overhang. Solid battle on 6lb mainline.',
  },
];

export default function Discover({ onStart }: { onStart: (v: Venue) => void }) {
  const store = useStore();
  const { sessions: localSessions, catches: localCatches } = store;
  const { user } = useAuth();

  useEffect(() => {
    if (user && user.storageMode === 'cloud') {
      fetchUserCloudData(user).then((data) => {
        if (data?.subscription) {
          actions.setSubscription(data.subscription.tier, data.subscription.appliedCoupon, data.subscription.expiresAt);
        }
      });
    }
  }, [user]);

  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapEngine | null>(null);
  const [ready, setReady] = useState(0);
  const [fallback, setFallback] = useState(false);

  // Cloud shared data fetched from Cloudflare D1
  const [remoteSessions, setRemoteSessions] = useState<Session[]>([]);
  const [remoteCatches, setRemoteCatches] = useState<Catch[]>([]);

  // Selection state
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Search & Tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>('catches');

  // Fetch shared sessions, catches, and likes from Cloudflare D1 on mount
  useEffect(() => {
    let active = true;
    fetchPublicSharedData().then((data) => {
      if (!active) return;
      if (data.sessions.length > 0) setRemoteSessions(data.sessions);
      if (data.catches.length > 0) setRemoteCatches(data.catches);
    });
    fetchCatchLikes().then((likes) => {
      if (active && likes && Object.keys(likes).length > 0) {
        actions.setAllCatchLikes(likes);
      }
    });
    return () => { active = false; };
  }, []);

  // Merge local shared sessions with remote D1 shared sessions (local takes precedence by id)
  const allSharedSessions = useMemo(() => {
    const mapById = new Map<string, Session>();
    remoteSessions.forEach((s) => {
      if (s.isShared) mapById.set(s.id, s);
    });
    localSessions.forEach((s) => {
      if (s.isShared) mapById.set(s.id, s);
    });
    return Array.from(mapById.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }, [localSessions, remoteSessions]);

  // Merge local shared catches with remote D1 shared catches
  const allSharedCatches = useMemo(() => {
    const mapById = new Map<string, Catch>();
    remoteCatches.forEach((c) => {
      if (c.isShared) mapById.set(c.id, c);
    });
    localCatches.forEach((c) => {
      if (c.isShared) mapById.set(c.id, c);
    });
    return Array.from(mapById.values());
  }, [localCatches, remoteCatches]);

  // Count of catches per session
  const catchCountBySession = useMemo(() => {
    const counts: Record<string, number> = {};
    allSharedCatches.forEach((c) => {
      counts[c.sessionId] = (counts[c.sessionId] ?? 0) + 1;
    });
    return counts;
  }, [allSharedCatches]);

  // Filtered shared sessions based on search
  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allSharedSessions;
    return allSharedSessions.filter((s) =>
      s.venueName.toLowerCase().includes(q) ||
      (s.userName && s.userName.toLowerCase().includes(q)) ||
      (s.notes && s.notes.toLowerCase().includes(q))
    );
  }, [searchQuery, allSharedSessions]);

  // Filtered public shared catches based on search
  const filteredCatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allSharedCatches;
    return allSharedCatches.filter((c) =>
      c.species.toLowerCase().includes(q) ||
      (c.bait && c.bait.toLowerCase().includes(q)) ||
      (c.userName && c.userName.toLowerCase().includes(q)) ||
      (c.notes && c.notes.toLowerCase().includes(q))
    );
  }, [searchQuery, allSharedCatches]);

  // If Google rejects the key at runtime, rebuild with OpenStreetMap/CARTO
  useEffect(() => {
    const onFail = () => setFallback(true);
    window.addEventListener('keepnet:gm-auth-failure', onFail);
    return () => window.removeEventListener('keepnet:gm-auth-failure', onFail);
  }, []);

  const theme = useTheme();

  // Create the map once (or re-create when theme or fallback changes)
  useEffect(() => {
    if (!el.current) return;
    let cancelled = false;
    let engine: MapEngine | null = null;
    el.current.innerHTML = '';
    const initialCenter: [number, number] = [53.5, -2.2]; // Center of Great Britain
    const initialZoom = 6;

    createMap(el.current, initialCenter, initialZoom, theme === 'dark', fallback).then((m) => {
      if (cancelled) { m.destroy(); return; }
      engine = m;
      map.current = m;
      setReady((n) => n + 1);
    });
    return () => { cancelled = true; engine?.destroy(); map.current = null; };
  }, [theme, fallback]);

  // Keep markers in sync with shared sessions
  useEffect(() => {
    if (!map.current) return;

    const markers: MapMarker[] = [];

    // Shared sessions markers (Copper / Amber)
    filteredSessions.forEach((s) => {
      markers.push({
        id: s.id,
        lat: s.lat,
        lon: s.lon,
        title: `${s.venueName} · ${s.userName || 'Angler'}`,
        label: catchCountBySession[s.id] ? String(catchCountBySession[s.id]) : undefined,
        kind: 'custom',
      });
    });

    map.current.setMarkers(markers, (id) => {
      const session = allSharedSessions.find((s) => s.id === id);
      if (session) {
        setSelectedSession(session);
        map.current?.flyTo(session.lat, session.lon, 13);
      }
    });
  }, [ready, filteredSessions, allSharedSessions, catchCountBySession]);

  const focusSession = (s: Session) => {
    setSelectedSession(s);
    map.current?.flyTo(s.lat, s.lon, 13);
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  const locate = async () => {
    const p = await getDevicePosition();
    if (p) map.current?.showMe(p.lat, p.lon);
  };

  // Catches for selected session
  const selectedSessionCatches = useMemo(() => {
    if (!selectedSession) return [];
    return allSharedCatches.filter((c) => c.sessionId === selectedSession.id);
  }, [allSharedCatches, selectedSession]);

  const isPremiumActive = actions.isPremium() || store.subscriptionTier === 'premium';

  // If user is on Lite tier (not Premium / Trial), show static benefits preview per monetisation plan
  if (!isPremiumActive) {
    return (
      <div className="content">
        {/* Lite Free Forever Reassurance Banner */}
        <div className="lite-free-reassurance-banner">
          <div className="lite-free-reassurance-icon">
            <ShieldCheck size={20} />
          </div>
          <div className="lite-free-reassurance-content">
            <strong>Keepnet Lite is 100% Free Forever</strong>
            <span>Your personal catch diary, offline logging, PB tracking, species, weights, and photos are always free. You will never be asked to pay to log catches.</span>
          </div>
        </div>

        {/* Header */}
        <div className="row-between" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div>
            <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--copper, #C9772B)', marginBottom: 2 }}>
              <Crown size={14} /> Optional Community Add-On
            </div>
            <h1 className="page-title" style={{ margin: '0 0 4px' }}>Community Waters & Catches</h1>
            <p className="page-subtitle" style={{ margin: 0 }}>
              Live interactive waters map, shared catches feed, and 60+ UK fisheries directory.
            </p>
          </div>
        </div>

        {/* Hero Benefits Card */}
        <div className="card discover-preview-hero">
          <div className="discover-preview-badge">
            <Sparkles size={14} /> Specimen Suite
          </div>
          <h2 className="serif" style={{ fontSize: 24, margin: '8px 0 6px' }}>
            Explore Live Community Waters & Rigs
          </h2>
          <p className="muted" style={{ fontSize: 13, maxWidth: 540, margin: '0 auto 16px', lineHeight: 1.5 }}>
            While your personal diary is 100% free forever, Premium connects you with the wider UK community — showing where fish are biting, what baits are producing, and GPS routes to 60+ verified fisheries.
          </p>

          <div className="discover-benefits-grid">
            <div className="discover-benefit-item">
              <MapPin size={18} color="var(--accent-green)" />
              <div>
                <strong>Live Waters Map</strong>
                <span>Interactive GPS pins for public waters, swims & catches</span>
              </div>
            </div>
            <div className="discover-benefit-item">
              <Fish size={18} color="var(--accent-green)" />
              <div>
                <strong>Community Catch Reports</strong>
                <span>Bait, rig, weight & tactic feeds from fellow anglers</span>
              </div>
            </div>
            <div className="discover-benefit-item">
              <Compass size={18} color="var(--copper, #C9772B)" />
              <div>
                <strong>60+ UK Fisheries Directory</strong>
                <span>GPS distance sorting, day-ticket info & rules</span>
              </div>
            </div>
            <div className="discover-benefit-item">
              <Zap size={18} color="var(--copper, #C9772B)" />
              <div>
                <strong>Solunar Feeding Peaks</strong>
                <span>Atmospheric pressure correlations & bite peak times</span>
              </div>
            </div>
          </div>

          <div className="discover-preview-actions">
            <button
              type="button"
              id="discover-start-trial-btn"
              className="btn-primary"
              style={{ height: 46, padding: '0 20px', fontSize: 14, gap: 8 }}
              onClick={() => actions.applyCoupon('KEEPNET1M')}
            >
              <Gift size={16} /> Start 1-Month Free Trial
            </button>

            <Link
              to="/subscription"
              id="discover-view-plans-btn"
              className="btn-secondary"
              style={{ height: 46, padding: '0 18px', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span>Unlock Premium (£1.49/mo or £10.49/yr)</span>
              <ChevronRight size={15} />
            </Link>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
            Keepnet Lite remains free forever · No credit card required · Never pay to log your catches
          </div>
        </div>

        {/* Static Sample Catch Reports Feed Showcase */}
        <div style={{ marginTop: 24 }}>
          <div className="static-preview-header">
            <div>
              <h2 className="serif" style={{ fontSize: 18, margin: 0 }}>Sample Community Catches</h2>
              <span className="muted" style={{ fontSize: 12 }}>Preview of catches shared by UK anglers</span>
            </div>
            <span className="static-preview-pill">
              <EyeOff size={12} /> Static Preview
            </span>
          </div>

          <div className="catch-cards-grid">
            {STATIC_SAMPLE_CATCHES.map((c) => (
              <div key={c.id} className="card catch-report-card" style={{ opacity: 0.95 }}>
                <div className="row-between" style={{ marginBottom: 10, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="avatar-placeholder" style={{ width: 32, height: 32, minWidth: 32, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-green)' }}>
                      <User size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {c.userName}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {fmtDay(c.caughtAt)} · {fmtTime(c.caughtAt)}
                      </div>
                    </div>
                  </div>
                  <span className="count-pill" style={{ fontSize: 11, background: 'var(--surface-sunken)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.venueName}
                  </span>
                </div>

                <div className="catch-report-photo-placeholder" style={{ height: 160 }}>
                  <Fish size={44} strokeWidth={1.5} />
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="row-between" style={{ alignItems: 'baseline' }}>
                    <h3 className="serif" style={{ margin: 0, fontSize: 20 }}>{c.species}</h3>
                    <span className="catch-weight-badge serif">{c.weightLb}lb {c.weightOz}oz</span>
                  </div>

                  <div className="tag-row" style={{ marginTop: 8 }}>
                    <span className="tag" style={{ fontSize: 11 }}>Bait: {c.bait}</span>
                  </div>

                  <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.4, fontStyle: 'italic' }}>
                    "{c.notes}"
                  </p>
                </div>

                <div className="catch-report-footer" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="catch-feed-like-btn large"
                    onClick={() => actions.applyCoupon('KEEPNET1M')}
                    title="Unlock with Premium"
                  >
                    <Heart size={16} color="#ef4444" fill="#ef4444" />
                    <span><strong>{c.likesCount}</strong> Likes</span>
                  </button>

                  <Link to="/subscription" className="btn-secondary" style={{ height: 32, padding: '0 10px', fontSize: 12, textDecoration: 'none', gap: 4 }}>
                    <Crown size={12} color="var(--copper, #C9772B)" />
                    <span>Unlock Live Feed</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      {/* Page Title & Intro */}
      <div className="row-between" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 className="page-title" style={{ margin: '0 0 4px' }}>Community Catches</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Live catch reports and waters shared by Keepnet anglers across the UK.
          </p>
        </div>
      </div>

      {/* Prominent "Find Fisheries Near Me" Callout */}
      <div className="find-fisheries-banner">
        <div className="find-fisheries-banner-content">
          <div className="find-fisheries-banner-icon">
            <Compass size={22} />
          </div>
          <div className="find-fisheries-banner-text">
            <strong>Looking for somewhere to fish?</strong>
            <span>Explore 60+ verified UK pleasure fisheries, specimen carp waters & commercial day-ticket lakes</span>
          </div>
        </div>
        <Link to="/fisheries" className="find-fisheries-banner-btn" id="discover-find-fisheries-btn">
          <MapPin size={15} />
          <span>Find Fisheries Near Me</span>
          <ChevronRight size={14} />
        </Link>
      </div>

      {/* Discover Controls: Search */}
      <div className="discover-controls">
        <div className="discover-search-wrap">
          <Search size={16} className="discover-search-icon" />
          <input
            type="text"
            id="discover-search-input"
            placeholder="Search catches by species, bait, angler, or venue..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="discover-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Map View */}
      <div className="map-wrap">
        <div ref={el} className="map" id="discover-map" />
        <button className="map-locate" id="map-locate-btn" onClick={locate} aria-label="Locate me">
          <LocateFixed size={18} />
        </button>
      </div>

      {/* Map Legend */}
      <div className="map-legend">
        <div className="map-legend-item">
          <span className="legend-dot custom" />
          <span>Shared Community Session</span>
        </div>
        <div className="map-legend-item">
          <span className="legend-dot me" />
          <span>Your Location</span>
        </div>
      </div>

      {/* Selected Shared Session Detail Card */}
      {selectedSession && (
        <div className="card venue-card fade-in" key={selectedSession.id} style={{ borderColor: 'var(--copper, #C9772B)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div className="eyebrow" style={{ color: '#C9772B', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Globe size={13} /> Shared Angler Session
            </div>
            <button
              onClick={() => setSelectedSession(null)}
              className="tag"
              style={{ cursor: 'pointer', background: 'var(--card-bg)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <X size={12} /> Close
            </button>
          </div>

          <h2 className="serif" style={{ fontSize: 22, marginBottom: 4 }}>{selectedSession.venueName}</h2>
          
          <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', fontSize: 13, marginBottom: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <User size={14} /> {selectedSession.userName || 'Angler'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={14} /> {fmtDay(selectedSession.startedAt)} · {fmtTime(selectedSession.startedAt)}
            </span>
            {selectedSession.weather && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CloudSun size={14} /> {Math.round(selectedSession.weather.temperature)}°C {selectedSession.weather.description}
              </span>
            )}
          </div>

          {selectedSession.photo && (
            <div style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', maxHeight: 180 }}>
              <img src={selectedSession.photo} alt={selectedSession.venueName} style={{ width: '100%', height: 180, objectFit: 'cover' }} />
            </div>
          )}

          {selectedSession.notes && (
            <p className="muted" style={{ marginBottom: 12, fontStyle: 'italic', fontSize: 13, background: 'var(--accent-light)', padding: '8px 12px', borderRadius: 8 }}>
              "{selectedSession.notes}"
            </p>
          )}

          {/* Catches in this shared session */}
          <div className="shared-catches-section">
            <div className="eyebrow" style={{ marginTop: 8, marginBottom: 8 }}>
              Catches in this session ({selectedSessionCatches.length})
            </div>
            {selectedSessionCatches.length > 0 ? (
              <div className="shared-catch-list">
                {selectedSessionCatches.map((c) => {
                  const isLiked = actions.isCatchLiked(c.id);
                  const likesCount = actions.getCatchLikesCount(c.id, c.likesCount);
                  return (
                    <div key={c.id} className="shared-catch-row">
                      <Link to={`/catches/${c.id}`} className="shared-catch-card" style={{ flex: 1 }}>
                        {c.image ? (
                          <img src={c.image} alt={c.species} className="shared-catch-thumb" loading="lazy" />
                        ) : (
                          <div className="shared-catch-thumb placeholder"><Fish size={18} /></div>
                        )}
                        <div className="shared-catch-meta">
                          <span className="shared-catch-name">{c.species}</span>
                          <span className="shared-catch-weight">{fmtWeight(c)}</span>
                          <span className="shared-catch-date">{c.bait}</span>
                        </div>
                        <ChevronRight size={16} color="var(--text-secondary)" />
                      </Link>
                      <button
                        type="button"
                        id={`session-catch-like-${c.id}`}
                        className={`catch-feed-like-btn ${isLiked ? 'liked' : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          actions.toggleCatchLike(c.id);
                        }}
                        title={isLiked ? 'Unlike catch' : 'Like catch'}
                      >
                        <Heart size={14} fill={isLiked ? '#ef4444' : 'none'} color={isLiked ? '#ef4444' : 'currentColor'} />
                        <span>{likesCount}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13, padding: '4px 0 10px' }}>
                No catches were logged during this session.
              </p>
            )}
          </div>

          <button
            className="btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => onStart({
              id: selectedSession.venueId || 'custom',
              name: selectedSession.venueName,
              type: 'Swim',
              lat: selectedSession.lat,
              lon: selectedSession.lon,
              targets: [],
              description: selectedSession.notes || 'Community swim',
            })}
          >
            <Plus size={20} /> Fish this water
          </button>
        </div>
      )}

      {/* Feed Tabs: Catch Reports vs Community Sessions */}
      <div className="directory-tabs">
        <button
          type="button"
          id="tab-catches"
          className={`dir-tab-btn ${directoryTab === 'catches' ? 'active' : ''}`}
          onClick={() => setDirectoryTab('catches')}
        >
          <Heart size={16} /> Catch Reports ({filteredCatches.length})
        </button>
        <button
          type="button"
          id="tab-sessions"
          className={`dir-tab-btn ${directoryTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setDirectoryTab('sessions')}
        >
          <Globe size={16} /> Community Waters ({filteredSessions.length})
        </button>
      </div>

      {/* 1. Community Catch Reports View (Default) */}
      {directoryTab === 'catches' && (
        <div className="catch-reports-feed">
          {filteredCatches.length > 0 ? (
            <div className="catch-cards-grid">
              {filteredCatches.map((c) => {
                const isLiked = actions.isCatchLiked(c.id);
                const likesCount = actions.getCatchLikesCount(c.id, c.likesCount);
                const s = allSharedSessions.find((sess) => sess.id === c.sessionId);
                return (
                  <div key={c.id} className="card catch-report-card">
                    {/* Header: Angler & Timestamp */}
                    <div className="row-between" style={{ marginBottom: 10, alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="avatar-placeholder" style={{ width: 32, height: 32, minWidth: 32, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-green)' }}>
                          <User size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {c.userName || s?.userName || 'Community Angler'}
                          </div>
                          <div className="muted" style={{ fontSize: 11 }}>
                            {fmtDay(c.caughtAt)} {c.caughtAt ? `· ${fmtTime(c.caughtAt)}` : ''}
                          </div>
                        </div>
                      </div>
                      {s && (
                        (c.isConfidential || s.isConfidential) ? (
                          <span
                            className="count-pill"
                            style={{
                              fontSize: 11,
                              background: 'rgba(201, 119, 43, 0.15)',
                              color: 'var(--copper, #C9772B)',
                              border: '1px solid rgba(201, 119, 43, 0.3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            title="Confidential Syndicate Water"
                          >
                            <Lock size={10} /> Syndicate Water
                          </span>
                        ) : (
                          <span className="count-pill" style={{ fontSize: 11, background: 'var(--surface-sunken)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.venueName}>
                            {s.venueName}
                          </span>
                        )
                      )}
                    </div>

                    {/* Catch Photo or Visual Placeholder */}
                    <Link to={`/catches/${c.id}`} className="catch-report-media-link" style={{ textDecoration: 'none', display: 'block' }}>
                      {c.image ? (
                        <div className="catch-report-photo-wrap">
                          <img src={c.image} alt={c.species} className="catch-report-photo" loading="lazy" />
                        </div>
                      ) : (
                        <div className="catch-report-photo-placeholder">
                          <Fish size={40} strokeWidth={1.5} />
                        </div>
                      )}
                    </Link>

                    {/* Catch Details: Species, Weight, Bait */}
                    <div style={{ marginTop: 10 }}>
                      <div className="row-between" style={{ alignItems: 'baseline' }}>
                        <Link to={`/catches/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                          <h3 className="serif" style={{ margin: 0, fontSize: 20 }}>{c.species}</h3>
                        </Link>
                        <span className="catch-weight-badge serif">{fmtWeight(c)}</span>
                      </div>

                      <div className="tag-row" style={{ marginTop: 8 }}>
                        {c.bait && <span className="tag" style={{ fontSize: 11 }}>Bait: {c.bait}</span>}
                        {s?.weather && (
                          <span className="tag" style={{ fontSize: 11 }}>
                            <CloudSun size={11} /> {Math.round(s.weather.temperature)}°C
                          </span>
                        )}
                      </div>

                      {c.notes && (
                        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.4, fontStyle: 'italic' }}>
                          "{c.notes.length > 90 ? `${c.notes.slice(0, 90)}...` : c.notes}"
                        </p>
                      )}
                    </div>

                    {/* Social Interaction Footer: Like Button & View Details */}
                    <div className="catch-report-footer" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button
                        type="button"
                        id={`catch-feed-like-${c.id}`}
                        className={`catch-feed-like-btn large ${isLiked ? 'liked' : ''}`}
                        onClick={() => actions.toggleCatchLike(c.id)}
                        title={isLiked ? 'Unlike catch' : 'Like this catch'}
                      >
                        <Heart size={16} fill={isLiked ? '#ef4444' : 'none'} color={isLiked ? '#ef4444' : 'currentColor'} />
                        <span><strong>{likesCount}</strong> {likesCount === 1 ? 'Like' : 'Likes'}</span>
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Link to={`/catches/${c.id}`} className="btn-secondary" style={{ height: 32, padding: '0 10px', fontSize: 12, textDecoration: 'none', gap: 4 }} title="View tactical discussion">
                          <MessageSquare size={13} color="var(--copper)" />
                          <span>Discuss</span>
                        </Link>
                        <Link to={`/catches/${c.id}`} className="btn-secondary" style={{ height: 32, padding: '0 10px', fontSize: 12, textDecoration: 'none', gap: 4 }}>
                          <span>Report</span>
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card" style={{ padding: '36px 16px', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-secondary)', marginBottom: 10 }}>
                <Heart size={32} style={{ opacity: 0.4 }} />
              </div>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>No catch reports match your search</p>
              <p className="muted" style={{ fontSize: 13, maxWidth: 380, margin: '0 auto' }}>
                When logging or viewing catches in your journal, toggle "Shared" to showcase your prize fish to fellow anglers and earn Community trophies!
              </p>
            </div>
          )}
        </div>
      )}

      {/* 2. Community Waters / Sessions View */}
      {directoryTab === 'sessions' && (
        <div className="card list-card">
          {filteredSessions.length > 0 ? (
            filteredSessions.map((s) => {
              const count = catchCountBySession[s.id] ?? 0;
              const isSelected = selectedSession?.id === s.id;
              return (
                <button
                  key={s.id}
                  id={`session-row-${s.id}`}
                  className={`list-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => focusSession(s)}
                  style={{ textAlign: 'left' }}
                >
                  <div className="list-icon" style={{ background: 'rgba(201, 119, 43, 0.12)', color: '#C9772B' }}>
                    <Globe size={18} />
                  </div>
                  <div className="catch-info">
                    <div className="catch-species">{s.venueName}</div>
                    <div className="catch-meta">
                      {s.userName || 'Angler'} · {fmtDay(s.startedAt)}
                      {s.weather ? ` · ${Math.round(s.weather.temperature)}°C` : ''}
                    </div>
                  </div>
                  <span className="count-pill" title="Catches in this session" style={{ background: count > 0 ? 'var(--accent-light)' : undefined }}>
                    {count} {count === 1 ? 'catch' : 'catches'}
                  </span>
                </button>
              );
            })
          ) : (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
                <Globe size={28} style={{ opacity: 0.5 }} />
              </div>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>No public sessions found</p>
              <p className="muted" style={{ fontSize: 13 }}>
                When logging or viewing any session in your journal, toggle "Share to Discover map" to showcase your waters and catches to fellow anglers here.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
