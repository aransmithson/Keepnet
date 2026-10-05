import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Fish, LocateFixed, Globe, ChevronRight, CloudSun, Calendar, User, X,
  Search, MapPin, ExternalLink, Info, Compass, Heart
} from 'lucide-react';
import { useStore, actions, fmtWeight, fmtDay, fmtTime, type Venue, type Session, type Catch } from './store';
import { getDevicePosition } from './weather';
import { createMap, type MapEngine, type MapMarker } from './map';
import { useTheme } from './theme';
import { fetchPublicSharedData, fetchCatchLikes } from './cloud';
import { UK_FISHERIES, MAP_FISHERIES, type Fishery } from './fisheries';

type FilterType = 'all' | 'fisheries' | 'sessions';
type DirectoryTab = 'fisheries' | 'sessions' | 'catches';

export default function Discover({ onStart }: { onStart: (v: Venue) => void }) {
  const { sessions: localSessions, catches: localCatches } = useStore();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapEngine | null>(null);
  const [ready, setReady] = useState(0);
  const [fallback, setFallback] = useState(false);

  // Cloud shared data fetched from Cloudflare D1
  const [remoteSessions, setRemoteSessions] = useState<Session[]>([]);
  const [remoteCatches, setRemoteCatches] = useState<Catch[]>([]);

  // Selection states
  const [selectedFishery, setSelectedFishery] = useState<Fishery | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>('fisheries');
  const [countryFilter, setCountryFilter] = useState<string>('All');

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

  // Filtered UK fisheries based on search and country filter
  const filteredFisheries = useMemo(() => {
    let list = UK_FISHERIES;
    if (countryFilter !== 'All') {
      list = list.filter((f) => f.country === countryFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((f) =>
        f.name.toLowerCase().includes(q) ||
        (f.region && f.region.toLowerCase().includes(q)) ||
        (f.nearestTown && f.nearestTown.toLowerCase().includes(q)) ||
        (f.postcode && f.postcode.toLowerCase().includes(q)) ||
        f.targets.some((sp) => sp.toLowerCase().includes(q))
      );
    }
    return list;
  }, [searchQuery, countryFilter]);

  // Filtered map fisheries based on search
  const filteredMapFisheries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return MAP_FISHERIES;
    return MAP_FISHERIES.filter((f) =>
      f.name.toLowerCase().includes(q) ||
      (f.region && f.region.toLowerCase().includes(q)) ||
      (f.nearestTown && f.nearestTown.toLowerCase().includes(q)) ||
      (f.postcode && f.postcode.toLowerCase().includes(q)) ||
      f.targets.some((sp) => sp.toLowerCase().includes(q))
    );
  }, [searchQuery]);

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

  // Keep markers in sync with fisheries and shared sessions
  useEffect(() => {
    if (!map.current) return;

    const markers: MapMarker[] = [];

    // 1. UK Fisheries markers (Green)
    if (filterType === 'all' || filterType === 'fisheries') {
      filteredMapFisheries.forEach((f) => {
        markers.push({
          id: f.id,
          lat: f.lat,
          lon: f.lon,
          title: `${f.name} · ${f.nearestTown || f.region}`,
          kind: 'venue',
        });
      });
    }

    // 2. Shared sessions markers (Copper / Amber)
    if (filterType === 'all' || filterType === 'sessions') {
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
    }

    map.current.setMarkers(markers, (id) => {
      // Check if it's a fishery
      const fishery = MAP_FISHERIES.find((f) => f.id === id);
      if (fishery) {
        setSelectedFishery(fishery);
        setSelectedSession(null);
        map.current?.flyTo(fishery.lat, fishery.lon, 12);
        return;
      }
      // Check if it's a shared session
      const session = allSharedSessions.find((s) => s.id === id);
      if (session) {
        setSelectedSession(session);
        setSelectedFishery(null);
        map.current?.flyTo(session.lat, session.lon, 13);
      }
    });
  }, [ready, filterType, filteredMapFisheries, filteredSessions, allSharedSessions, catchCountBySession]);

  const focusFishery = (f: Fishery) => {
    setSelectedFishery(f);
    setSelectedSession(null);
    if (f.hasCoordinates) {
      map.current?.flyTo(f.lat, f.lon, 12);
      window.scrollTo({ top: 120, behavior: 'smooth' });
    }
  };

  const focusSession = (s: Session) => {
    setSelectedSession(s);
    setSelectedFishery(null);
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

  const countries = ['All', 'England', 'Scotland', 'Wales', 'Northern Ireland'];

  return (
    <div className="content">
      <h1 className="page-title">Discover Waters & Catches</h1>
      <p className="page-subtitle">Interactive map of UK pleasure fisheries and community angler catches.</p>

      {/* Discover Controls: Search & Layer Filters */}
      <div className="discover-controls">
        <div className="discover-search-wrap">
          <Search size={16} className="discover-search-icon" />
          <input
            type="text"
            id="discover-search-input"
            placeholder="Search fisheries, towns, regions or fish species..."
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

        <div className="filter-pills-row" role="group" aria-label="Map filters">
          <button
            type="button"
            className={`filter-pill ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            <Compass size={14} /> All Waters ({filteredMapFisheries.length + filteredSessions.length})
          </button>
          <button
            type="button"
            className={`filter-pill ${filterType === 'fisheries' ? 'active' : ''}`}
            onClick={() => setFilterType('fisheries')}
          >
            <Fish size={14} /> UK Fisheries ({filteredMapFisheries.length})
          </button>
          <button
            type="button"
            className={`filter-pill ${filterType === 'sessions' ? 'active-copper' : ''}`}
            onClick={() => setFilterType('sessions')}
          >
            <Globe size={14} /> Shared Sessions ({filteredSessions.length})
          </button>
        </div>
      </div>

      <div className="map-wrap">
        <div ref={el} className="map" id="discover-map" />
        <button className="map-locate" id="map-locate-btn" onClick={locate} aria-label="Locate me">
          <LocateFixed size={18} />
        </button>
      </div>

      {/* Map Legend */}
      <div className="map-legend">
        <div className="map-legend-item">
          <span className="legend-dot" style={{ background: 'var(--accent-green)' }} />
          <span>UK Pleasure Fishery (Day Ticket / Water)</span>
        </div>
        <div className="map-legend-item">
          <span className="legend-dot custom" />
          <span>Shared Angler Session</span>
        </div>
        <div className="map-legend-item">
          <span className="legend-dot me" />
          <span>Your Location</span>
        </div>
      </div>

      {/* Selected Fishery Detail Card */}
      {selectedFishery && (
        <div className="card venue-card fade-in" key={selectedFishery.id} style={{ borderColor: 'var(--accent-green)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div className="eyebrow" style={{ color: 'var(--accent-green)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <MapPin size={13} /> {selectedFishery.country} · {selectedFishery.accessType}
            </div>
            <button
              onClick={() => setSelectedFishery(null)}
              className="tag"
              style={{ cursor: 'pointer', background: 'var(--card-bg)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <X size={12} /> Close
            </button>
          </div>

          <h2 className="serif" style={{ fontSize: 23, marginBottom: 4 }}>{selectedFishery.name}</h2>
          
          <div className="muted" style={{ fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>{selectedFishery.nearestTown ? `${selectedFishery.nearestTown}, ` : ''}{selectedFishery.region}</span>
            {selectedFishery.postcode && (
              <>
                <span>·</span>
                <span style={{ fontWeight: 600 }}>{selectedFishery.postcode}</span>
              </>
            )}
            <span>·</span>
            <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>{selectedFishery.fisheryType}</span>
          </div>

          {selectedFishery.address && (
            <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              {selectedFishery.address}
            </p>
          )}

          {/* Target Species Pills */}
          {selectedFishery.targets.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 4 }}>
                Target Fish Species
              </div>
              <div className="fishery-species-tags">
                {selectedFishery.targets.map((sp) => (
                  <span key={sp} className="fishery-species-tag">{sp}</span>
                ))}
              </div>
            </div>
          )}

          {/* Access & Angling Information */}
          {selectedFishery.accessNotes && (
            <div className="fishery-notes-box">
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4, color: 'var(--accent-green)' }}>
                Access & Angling Information
              </div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                {selectedFishery.accessNotes}
              </p>
            </div>
          )}

          {/* Accuracy & Safety Notice */}
          <div className="accuracy-notice">
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {selectedFishery.coordinatePrecision === 'postcode_centroid'
                ? 'Location pin is based on the venue postcode centroid. Please confirm the official public entrance before travel.'
                : 'Researched public day-ticket / pleasure venue. Check local rules and current day-ticket availability before fishing.'}
            </span>
          </div>

          {/* Actions: Start Session + Website Link */}
          <div className="field-row" style={{ marginTop: 12 }}>
            <button
              className="btn-primary"
              style={{ flex: 1.4 }}
              onClick={() => onStart(selectedFishery)}
            >
              <Plus size={18} /> Start Session Here
            </button>
            {selectedFishery.website && (selectedFishery.website.startsWith('http://') || selectedFishery.website.startsWith('https://')) && (
              <a
                href={selectedFishery.website}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ flex: 1, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <span>Website</span>
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      )}

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

      {/* Directory Section Tabs */}
      <div className="directory-tabs">
        <button
          type="button"
          id="tab-fisheries"
          className={`dir-tab-btn ${directoryTab === 'fisheries' ? 'active' : ''}`}
          onClick={() => setDirectoryTab('fisheries')}
        >
          <Fish size={16} /> UK Fisheries ({filteredFisheries.length})
        </button>
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
          <Globe size={16} /> Community Sessions ({filteredSessions.length})
        </button>
      </div>

      {/* 1. UK Fisheries Directory View */}
      {directoryTab === 'fisheries' && (
        <div>
          {/* Country filter pills */}
          <div className="filter-pills-row" style={{ marginBottom: 12 }}>
            {countries.map((c) => (
              <button
                key={c}
                type="button"
                className={`filter-pill ${countryFilter === c ? 'active' : ''}`}
                onClick={() => setCountryFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="card list-card">
            {filteredFisheries.length > 0 ? (
              filteredFisheries.map((f) => {
                const isSelected = selectedFishery?.id === f.id;
                return (
                  <button
                    key={f.id}
                    id={`fishery-row-${f.id}`}
                    className={`list-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => focusFishery(f)}
                    style={{ textAlign: 'left' }}
                  >
                    <div
                      className="list-icon"
                      style={{
                        background: f.hasCoordinates ? 'rgba(1, 71, 49, 0.12)' : 'rgba(0, 0, 0, 0.05)',
                        color: f.hasCoordinates ? 'var(--accent-green)' : 'var(--text-secondary)',
                      }}
                    >
                      <MapPin size={18} />
                    </div>
                    <div className="catch-info" style={{ flex: 1 }}>
                      <div className="catch-species" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{f.name}</span>
                        <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--accent-light)', color: 'var(--accent-green)', borderRadius: 4, fontWeight: 600 }}>
                          {f.accessType}
                        </span>
                      </div>
                      <div className="catch-meta">
                        {f.nearestTown ? `${f.nearestTown}, ` : ''}{f.region} · {f.country}
                        {f.targets.length > 0 ? ` · ${f.targets.slice(0, 3).join(', ')}${f.targets.length > 3 ? '...' : ''}` : ''}
                      </div>
                    </div>
                    {f.hasCoordinates ? (
                      <span className="count-pill" style={{ background: 'var(--accent-light)', color: 'var(--accent-green)', fontSize: 11, fontWeight: 600 }}>
                        On Map
                      </span>
                    ) : (
                      <span className="count-pill" style={{ fontSize: 11 }}>
                        Directory
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>No fisheries match your search</p>
                <p className="muted" style={{ fontSize: 13 }}>
                  Try searching for another town, region, or species name.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Community Sessions View */}
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

      {/* 3. Community Catch Reports View */}
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
                        <span className="count-pill" style={{ fontSize: 11, background: 'var(--surface-sunken)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.venueName}>
                          {s.venueName}
                        </span>
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

                      <Link to={`/catches/${c.id}`} className="btn-secondary" style={{ height: 32, padding: '0 10px', fontSize: 12, textDecoration: 'none', gap: 4 }}>
                        <span>Catch Report</span>
                        <ChevronRight size={14} />
                      </Link>
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
              <p style={{ fontWeight: 600, marginBottom: 4 }}>No catch reports found</p>
              <p className="muted" style={{ fontSize: 13, maxWidth: 380, margin: '0 auto' }}>
                When logging or viewing catches in your journal, toggle "Shared" to showcase your prize fish to fellow anglers and earn Community trophies!
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
