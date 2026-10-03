import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Plus, Fish, LocateFixed } from 'lucide-react';
import { VENUES, useStore, type Venue } from './store';
import { getDevicePosition } from './weather';
import { createMap, type MapEngine, type MapMarker } from './map';

export default function Discover({ onStart }: { onStart: (v: Venue) => void }) {
  const { sessions, catches } = useStore();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapEngine | null>(null);
  const [ready, setReady] = useState(0);
  const [fallback, setFallback] = useState(false);
  const [selected, setSelected] = useState<Venue>(VENUES[0]);

  const catchCount = useMemo(() => {
    const bySession = new Map(sessions.map((s) => [s.id, s.venueId]));
    const counts: Record<string, number> = {};
    catches.forEach((c) => {
      const v = bySession.get(c.sessionId);
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    });
    return counts;
  }, [sessions, catches]);

  // If Google rejects the key at runtime, rebuild with OpenStreetMap
  useEffect(() => {
    const onFail = () => setFallback(true);
    window.addEventListener('keepnet:gm-auth-failure', onFail);
    return () => window.removeEventListener('keepnet:gm-auth-failure', onFail);
  }, []);

  // Create the map once (or again when falling back)
  useEffect(() => {
    if (!el.current) return;
    let cancelled = false;
    let engine: MapEngine | null = null;
    el.current.innerHTML = '';
    createMap(el.current, [54.0, -2.73], 10, fallback).then((m) => {
      if (cancelled) { m.destroy(); return; }
      engine = m;
      map.current = m;
      setReady((n) => n + 1);
    });
    return () => { cancelled = true; engine?.destroy(); map.current = null; };
  }, [fallback]);

  // Keep markers in sync with data
  useEffect(() => {
    if (!map.current) return;
    const markers: MapMarker[] = [
      ...VENUES.map((v) => ({ id: v.id, lat: v.lat, lon: v.lon, title: v.name, label: catchCount[v.id] ? String(catchCount[v.id]) : undefined, kind: 'venue' as const })),
      ...sessions.filter((s) => s.venueId === 'current').map((s) => ({ id: `s:${s.id}`, lat: s.lat, lon: s.lon, title: 'Logged session', kind: 'custom' as const })),
    ];
    map.current.setMarkers(markers, (id) => {
      const v = VENUES.find((x) => x.id === id);
      if (v) setSelected(v);
    });
  }, [ready, sessions, catchCount]);

  const focus = (v: Venue) => {
    setSelected(v);
    map.current?.flyTo(v.lat, v.lon, 13);
  };

  const locate = async () => {
    const p = await getDevicePosition();
    if (p) map.current?.showMe(p.lat, p.lon);
  };

  return (
    <div className="content">
      <h1 className="page-title">Discover</h1>
      <p className="page-subtitle">Venues near you and where you've caught.</p>

      <div className="map-wrap">
        <div ref={el} className="map" id="discover-map" />
        <button className="map-locate" id="map-locate-btn" onClick={locate} aria-label="Locate me"><LocateFixed size={18} /></button>
      </div>

      <div className="card venue-card fade-in" key={selected.id}>
        <div className="eyebrow">{selected.type}</div>
        <h2 className="serif" style={{ fontSize: 22, marginBottom: 6 }}>{selected.name}</h2>
        <p className="muted" style={{ marginBottom: 12 }}>{selected.description}</p>
        <div className="tag-row">
          <span className="tag"><span style={{ color: 'var(--danger)' }}>◎</span> {selected.targets.join(', ')}</span>
          <span className="tag"><Fish size={14} /> {catchCount[selected.id] ?? 0} logged</span>
        </div>
        <button className="btn-primary" id="discover-start-btn" onClick={() => onStart(selected)}><Plus size={20} /> Start session here</button>
      </div>

      <div className="section-header"><h2 className="serif section-title">All venues</h2></div>
      <div className="card list-card">
        {VENUES.map((v) => (
          <button key={v.id} id={`venue-${v.id}`} className={`list-row ${selected.id === v.id ? 'selected' : ''}`} onClick={() => focus(v)}>
            <div className="list-icon"><MapPin size={18} /></div>
            <div className="catch-info">
              <div className="catch-species">{v.name}</div>
              <div className="catch-meta">{v.type} · {v.targets.slice(0, 2).join(', ')}</div>
            </div>
            <span className="count-pill">{catchCount[v.id] ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
