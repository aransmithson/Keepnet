import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Plus, Fish, LocateFixed } from 'lucide-react';
import { VENUES, useStore, type Venue } from './store';
import { getDevicePosition } from './weather';

const pin = (cls: string, label = '') =>
  L.divIcon({ className: '', html: `<div class="map-pin ${cls}"><span>${label}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });

export default function Discover({ onStart }: { onStart: (v: Venue) => void }) {
  const { sessions, catches } = useStore();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
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

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([54.0, -2.73], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);

    VENUES.forEach((v) => {
      L.marker([v.lat, v.lon], { icon: pin('venue', catchCount[v.id] ? String(catchCount[v.id]) : '') })
        .addTo(m)
        .bindTooltip(v.name, { direction: 'top', offset: [0, -28] })
        .on('click', () => setSelected(v));
    });

    // Sessions logged at a custom (GPS) location
    sessions.filter((s) => s.venueId === 'current').forEach((s) => {
      L.marker([s.lat, s.lon], { icon: pin('custom') }).addTo(m).bindTooltip('Logged session', { direction: 'top', offset: [0, -28] });
    });

    map.current = m;
    // Container may size after first paint inside the app shell
    setTimeout(() => m.invalidateSize(), 50);
    return () => { m.remove(); map.current = null; };
  }, [sessions, catchCount]);

  const focus = (v: Venue) => {
    setSelected(v);
    map.current?.flyTo([v.lat, v.lon], 13, { duration: 0.8 });
  };

  const locate = async () => {
    const p = await getDevicePosition();
    if (p && map.current) {
      map.current.flyTo([p.lat, p.lon], 12);
      L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#2F80ED', fillOpacity: 1 }).addTo(map.current);
    }
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
