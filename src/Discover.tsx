import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Plus, Fish, LocateFixed, Globe, ChevronRight, CloudSun, Calendar, User, Eye } from 'lucide-react';
import { VENUES, useStore, fmtWeight, fmtDay, fmtTime, type Venue, type Session, type Catch } from './store';
import { getDevicePosition } from './weather';
import { createMap, type MapEngine, type MapMarker } from './map';
import { useTheme } from './theme';
import { fetchPublicSharedData } from './cloud';

export default function Discover({ onStart }: { onStart: (v: Venue) => void }) {
  const { sessions: localSessions, catches: localCatches } = useStore();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapEngine | null>(null);
  const [ready, setReady] = useState(0);
  const [fallback, setFallback] = useState(false);

  // Cloud shared data fetched from Cloudflare D1
  const [remoteSessions, setRemoteSessions] = useState<Session[]>([]);
  const [remoteCatches, setRemoteCatches] = useState<Catch[]>([]);
  const [activeTab, setActiveTab] = useState<'sessions' | 'venues'>('sessions');

  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(VENUES[0]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Fetch shared sessions and catches from Cloudflare D1 on mount
  useEffect(() => {
    let active = true;
    fetchPublicSharedData().then((data) => {
      if (!active) return;
      if (data.sessions.length > 0) setRemoteSessions(data.sessions);
      if (data.catches.length > 0) setRemoteCatches(data.catches);
    });
    return () => { active = false; };
  }, []);

  // Merge local shared sessions with remote D1 shared sessions (local takes precedence by id)
  const allSharedSessions = useMemo(() => {
    const mapById = new Map<string, Session>();
    // First populate remote D1 sessions
    remoteSessions.forEach((s) => {
      if (s.isShared) mapById.set(s.id, s);
    });
    // Overlay local shared sessions
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

  // Combined lookup table for all sessions
  const combinedSessionMap = useMemo(() => {
    const m = new Map<string, Session>();
    remoteSessions.forEach((s) => m.set(s.id, s));
    localSessions.forEach((s) => m.set(s.id, s));
    return m;
  }, [localSessions, remoteSessions]);

  // Count of shared catches by venue
  const catchCountByVenue = useMemo(() => {
    const counts: Record<string, number> = {};
    allSharedCatches.forEach((c) => {
      const s = combinedSessionMap.get(c.sessionId);
      if (s?.venueId) {
        counts[s.venueId] = (counts[s.venueId] ?? 0) + 1;
      }
    });
    return counts;
  }, [allSharedCatches, combinedSessionMap]);

  // Count of catches per session
  const catchCountBySession = useMemo(() => {
    const counts: Record<string, number> = {};
    allSharedCatches.forEach((c) => {
      counts[c.sessionId] = (counts[c.sessionId] ?? 0) + 1;
    });
    return counts;
  }, [allSharedCatches]);

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
    createMap(el.current, [54.0, -2.73], 10, theme === 'dark', fallback).then((m) => {
      if (cancelled) { m.destroy(); return; }
      engine = m;
      map.current = m;
      setReady((n) => n + 1);
    });
    return () => { cancelled = true; engine?.destroy(); map.current = null; };
  }, [theme, fallback]);

  // Keep markers in sync with shared data and venues
  useEffect(() => {
    if (!map.current) return;

    const venueMarkers: MapMarker[] = VENUES.map((v) => ({
      id: v.id,
      lat: v.lat,
      lon: v.lon,
      title: v.name,
      label: catchCountByVenue[v.id] ? String(catchCountByVenue[v.id]) : undefined,
      kind: 'venue' as const,
    }));

    const sessionMarkers: MapMarker[] = allSharedSessions.map((s) => ({
      id: `s:${s.id}`,
      lat: s.lat,
      lon: s.lon,
      title: `${s.venueName} · ${s.userName || 'Angler'}`,
      label: catchCountBySession[s.id] ? String(catchCountBySession[s.id]) : undefined,
      kind: 'custom' as const,
    }));

    const markers: MapMarker[] = [...venueMarkers, ...sessionMarkers];

    map.current.setMarkers(markers, (id) => {
      if (id.startsWith('s:')) {
        const sessionId = id.replace('s:', '');
        const found = allSharedSessions.find((s) => s.id === sessionId);
        if (found) {
          setSelectedSession(found);
          setSelectedVenue(null);
          map.current?.flyTo(found.lat, found.lon, 13);
        }
      } else {
        const v = VENUES.find((x) => x.id === id);
        if (v) {
          setSelectedVenue(v);
          setSelectedSession(null);
          map.current?.flyTo(v.lat, v.lon, 13);
        }
      }
    });
  }, [ready, allSharedSessions, catchCountByVenue, catchCountBySession]);

  const focusVenue = (v: Venue) => {
    setSelectedVenue(v);
    setSelectedSession(null);
    map.current?.flyTo(v.lat, v.lon, 13);
  };

  const focusSession = (s: Session) => {
    setSelectedSession(s);
    setSelectedVenue(null);
    map.current?.flyTo(s.lat, s.lon, 13);
  };

  const locate = async () => {
    const p = await getDevicePosition();
    if (p) map.current?.showMe(p.lat, p.lon);
  };

  // Shared catches for selected venue
  const selectedVenueCatches = useMemo(() => {
    if (!selectedVenue) return [];
    return allSharedCatches.filter((c) => combinedSessionMap.get(c.sessionId)?.venueId === selectedVenue.id);
  }, [allSharedCatches, combinedSessionMap, selectedVenue]);

  // Shared sessions for selected venue
  const selectedVenueSessions = useMemo(() => {
    if (!selectedVenue) return [];
    return allSharedSessions.filter((s) => s.venueId === selectedVenue.id);
  }, [allSharedSessions, selectedVenue]);

  // Catches for selected session
  const selectedSessionCatches = useMemo(() => {
    if (!selectedSession) return [];
    return allSharedCatches.filter((c) => c.sessionId === selectedSession.id);
  }, [allSharedCatches, selectedSession]);

  return (
    <div className="content">
      <h1 className="page-title">Discover Waters & Sessions</h1>
      <p className="page-subtitle">Interactive map of shared angler sessions, catches, and verified fisheries.</p>

      {/* Sharing notice badge */}
      <div className="community-banner">
        <Globe size={16} style={{ flexShrink: 0 }} />
        <span>
          <strong>Live Angler Map</strong> · Green pins show verified fisheries. Amber pins show sessions shared by community anglers.
        </span>
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
          <span className="legend-dot venue" />
          <span>Verified Waters (badge shows catches)</span>
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

      {/* Selected Shared Session Detail Card */}
      {selectedSession && (
        <div className="card venue-card fade-in" key={selectedSession.id} style={{ borderColor: 'var(--copper, #C9772B)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div className="eyebrow" style={{ color: '#C9772B', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Globe size={13} /> Shared Session
            </div>
            <button
              onClick={() => { setSelectedSession(null); setSelectedVenue(VENUES[0]); }}
              className="tag"
              style={{ cursor: 'pointer', background: 'var(--card-bg)' }}
            >
              View Venues
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
                <CloudSun size={14} /> {selectedSession.weather.temperature}°C {selectedSession.weather.description}
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
                {selectedSessionCatches.map((c) => (
                  <Link key={c.id} to={`/catches/${c.id}`} className="shared-catch-card">
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
                ))}
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
            <Plus size={20} /> Fish this swim
          </button>
        </div>
      )}

      {/* Selected Venue details */}
      {selectedVenue && !selectedSession && (
        <div className="card venue-card fade-in" key={selectedVenue.id}>
          <div className="eyebrow">{selectedVenue.type}</div>
          <h2 className="serif" style={{ fontSize: 22, marginBottom: 6 }}>{selectedVenue.name}</h2>
          <p className="muted" style={{ marginBottom: 12 }}>{selectedVenue.description}</p>
          <div className="tag-row">
            <span className="tag"><span style={{ color: 'var(--danger)' }}>◎</span> {selectedVenue.targets.join(', ')}</span>
            <span className="tag"><Globe size={14} /> {catchCountByVenue[selectedVenue.id] ?? 0} public catches</span>
            {selectedVenueSessions.length > 0 && (
              <span className="tag" style={{ color: '#C9772B' }}>
                <Eye size={14} /> {selectedVenueSessions.length} shared sessions
              </span>
            )}
          </div>

          {/* List of shared catches for this venue */}
          <div className="shared-catches-section">
            <div className="eyebrow" style={{ marginTop: 12, marginBottom: 8 }}>
              Community Catches ({selectedVenueCatches.length})
            </div>
            {selectedVenueCatches.length > 0 ? (
              <div className="shared-catch-list">
                {selectedVenueCatches.map((c: Catch) => (
                  <Link key={c.id} to={`/catches/${c.id}`} className="shared-catch-card">
                    {c.image ? (
                      <img src={c.image} alt={c.species} className="shared-catch-thumb" loading="lazy" />
                    ) : (
                      <div className="shared-catch-thumb placeholder"><Fish size={18} /></div>
                    )}
                    <div className="shared-catch-meta">
                      <span className="shared-catch-name">{c.species}</span>
                      <span className="shared-catch-weight">{fmtWeight(c)}</span>
                      <span className="shared-catch-date">{c.bait} · {fmtDay(c.caughtAt)}</span>
                    </div>
                    <ChevronRight size={16} color="var(--text-secondary)" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13, padding: '4px 0 10px' }}>
                No public catches shared for this venue yet. When you fish here, toggle "Share to Discover" to showcase your catches on the map.
              </p>
            )}
          </div>

          <button className="btn-primary" id="discover-start-btn" style={{ marginTop: 10 }} onClick={() => onStart(selectedVenue)}>
            <Plus size={20} /> Start session here
          </button>
        </div>
      )}

      {/* Tab Switcher: Shared Sessions vs All Venues */}
      <div style={{ display: 'flex', gap: 8, margin: '20px 0 12px' }}>
        <button
          className={`auth-tab ${activeTab === 'sessions' ? 'active' : ''}`}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}
          onClick={() => setActiveTab('sessions')}
        >
          Shared Sessions ({allSharedSessions.length})
        </button>
        <button
          className={`auth-tab ${activeTab === 'venues' ? 'active' : ''}`}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}
          onClick={() => setActiveTab('venues')}
        >
          All Venues ({VENUES.length})
        </button>
      </div>

      {/* Tab 1: Shared Sessions List */}
      {activeTab === 'sessions' && (
        <div className="card list-card">
          {allSharedSessions.length > 0 ? (
            allSharedSessions.map((s) => {
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
                      {s.weather ? ` · ${s.weather.temperature}°C` : ''}
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
              <p style={{ fontWeight: 600, marginBottom: 4 }}>No public sessions shared yet</p>
              <p className="muted" style={{ fontSize: 13 }}>
                When logging or viewing any session in your journal, toggle "Share to Discover map" to show your session and catches to fellow anglers here.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: All Venues List */}
      {activeTab === 'venues' && (
        <div className="card list-card">
          {VENUES.map((v) => (
            <button
              key={v.id}
              id={`venue-${v.id}`}
              className={`list-row ${selectedVenue?.id === v.id && !selectedSession ? 'selected' : ''}`}
              onClick={() => focusVenue(v)}
            >
              <div className="list-icon"><MapPin size={18} /></div>
              <div className="catch-info">
                <div className="catch-species">{v.name}</div>
                <div className="catch-meta">{v.type} · {v.targets.slice(0, 2).join(', ')}</div>
              </div>
              <span className="count-pill" title="Shared catches">{catchCountByVenue[v.id] ?? 0}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
