import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Plus, Fish, LocateFixed, Globe, ChevronRight } from 'lucide-react';
import { VENUES, useStore, fmtWeight, fmtDay, type Venue, type Catch } from './store';
import { getDevicePosition } from './weather';
import { createMap, type MapEngine, type MapMarker } from './map';
import { useTheme } from './theme';

export default function Discover({ onStart }: { onStart: (v: Venue) => void }) {
  const { sessions, catches } = useStore();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapEngine | null>(null);
  const [ready, setReady] = useState(0);
  const [fallback, setFallback] = useState(false);
  const [selected, setSelected] = useState<Venue>(VENUES[0]);

  // Session lookup table
  const sessionMap = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  // ONLY shared catches appear on the Discover map
  const sharedCatches = useMemo(() => {
    return catches.filter((c) => {
      if (c.isShared === true) return true;
      const s = sessionMap.get(c.sessionId);
      return s?.isShared === true && c.isShared !== false;
    });
  }, [catches, sessionMap]);

  // Count of shared catches by venue
  const catchCount = useMemo(() => {
    const counts: Record<string, number> = {};
    sharedCatches.forEach((c) => {
      const s = sessionMap.get(c.sessionId);
      if (s) counts[s.venueId] = (counts[s.venueId] ?? 0) + 1;
    });
    return counts;
  }, [sharedCatches, sessionMap]);

  // ONLY custom sessions explicitly marked as shared appear on the Discover map
  const sharedCustomSessions = useMemo(() => {
    return sessions.filter((s) => s.venueId === 'current' && s.isShared === true);
  }, [sessions]);

  // If Google rejects the key at runtime, rebuild with OpenStreetMap
  useEffect(() => {
    const onFail = () => setFallback(true);
    window.addEventListener('keepnet:gm-auth-failure', onFail);
    return () => window.removeEventListener('keepnet:gm-auth-failure', onFail);
  }, []);

  const theme = useTheme();

  // Create the map once (or again when theme or fallback changes)
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

  // Keep markers in sync with shared data
  useEffect(() => {
    if (!map.current) return;
    const markers: MapMarker[] = [
      ...VENUES.map((v) => ({
        id: v.id,
        lat: v.lat,
        lon: v.lon,
        title: v.name,
        label: catchCount[v.id] ? String(catchCount[v.id]) : undefined,
        kind: 'venue' as const,
      })),
      ...sharedCustomSessions.map((s) => ({
        id: `s:${s.id}`,
        lat: s.lat,
        lon: s.lon,
        title: `${s.venueName} (Shared Session)`,
        kind: 'custom' as const,
      })),
    ];
    map.current.setMarkers(markers, (id) => {
      const v = VENUES.find((x) => x.id === id);
      if (v) setSelected(v);
    });
  }, [ready, sharedCustomSessions, catchCount]);

  const focus = (v: Venue) => {
    setSelected(v);
    map.current?.flyTo(v.lat, v.lon, 13);
  };

  const locate = async () => {
    const p = await getDevicePosition();
    if (p) map.current?.showMe(p.lat, p.lon);
  };

  // Catches shared for the currently selected venue
  const selectedVenueCatches = useMemo(() => {
    return sharedCatches.filter((c) => sessionMap.get(c.sessionId)?.venueId === selected.id);
  }, [sharedCatches, sessionMap, selected]);

  return (
    <div className="content">
      <h1 className="page-title">Discover Venues</h1>
      <p className="page-subtitle">Water bodies, verified fisheries, and public community catches.</p>

      {/* Sharing notice badge */}
      <div className="community-banner">
        <Globe size={16} style={{ flexShrink: 0 }} />
        <span>
          <strong>Venue Map & Public Catches</strong> · Pins represent UK waters with catch counts. Only catches marked as shared appear in community lists.
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
          <span>Fishing Venue (badge shows catches)</span>
        </div>
        <div className="map-legend-item">
          <span className="legend-dot me" />
          <span>Your Location</span>
        </div>
        <div className="map-legend-item">
          <span className="legend-dot custom" />
          <span>Shared Catch / Custom Swim</span>
        </div>
      </div>

      {/* Selected venue details */}
      <div className="card venue-card fade-in" key={selected.id}>
        <div className="eyebrow">{selected.type}</div>
        <h2 className="serif" style={{ fontSize: 22, marginBottom: 6 }}>{selected.name}</h2>
        <p className="muted" style={{ marginBottom: 12 }}>{selected.description}</p>
        <div className="tag-row">
          <span className="tag"><span style={{ color: 'var(--danger)' }}>◎</span> {selected.targets.join(', ')}</span>
          <span className="tag"><Globe size={14} /> {catchCount[selected.id] ?? 0} public catches</span>
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
              No public catches shared for this venue yet. When you fish here, you choose whether to share catches to the community map or keep them strictly private.
            </p>
          )}
        </div>

        <button className="btn-primary" id="discover-start-btn" style={{ marginTop: 10 }} onClick={() => onStart(selected)}>
          <Plus size={20} /> Start session here
        </button>
      </div>

      <div className="section-header">
        <h2 className="serif section-title">All venues</h2>
      </div>
      <div className="card list-card">
        {VENUES.map((v) => (
          <button key={v.id} id={`venue-${v.id}`} className={`list-row ${selected.id === v.id ? 'selected' : ''}`} onClick={() => focus(v)}>
            <div className="list-icon"><MapPin size={18} /></div>
            <div className="catch-info">
              <div className="catch-species">{v.name}</div>
              <div className="catch-meta">{v.type} · {v.targets.slice(0, 2).join(', ')}</div>
            </div>
            <span className="count-pill" title="Shared catches">{catchCount[v.id] ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
