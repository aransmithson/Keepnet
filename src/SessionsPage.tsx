import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Calendar, ChevronLeft, ChevronRight, Cloud, CloudSun, Fish, Globe, Lock, MapPin, MoreHorizontal, Plus, Sun, Waves } from 'lucide-react';
import { useStore, VENUES, fmtDay, fmtTime, type Catch, type Session } from './store';
import { createMap, type MapEngine } from './map';
import { useTheme } from './theme';
import './SessionsPage.css';

type View = 'sessions' | 'calendar' | 'map' | 'catches';
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const locationKey = (session: Session) => `${session.lat},${session.lon}`;
const hasLocation = (session: Session) => Number.isFinite(session.lat) && Number.isFinite(session.lon) && Math.abs(session.lat) <= 90 && Math.abs(session.lon) <= 180 && !(session.lat === 0 && session.lon === 0);

function SessionCard({ session, catches }: { session: Session; catches: Catch[] }) {
  const venue = VENUES.find(venue => venue.id === session.venueId);
  const photo = session.photo || session.photos?.[0];
  const bait = [...new Set(catches.map(catchItem => catchItem.bait.trim()).filter(Boolean))].join(', ') || 'Not logged';
  const water = venue?.type || 'Not logged';
  const weather = session.weather;
  const ConditionsIcon = weather?.code === 0 ? Sun : weather && weather.code <= 2 ? CloudSun : Cloud;
  const shared = session.isShared && !session.isConfidential;
  const relativeDay = fmtDay(session.startedAt);
  const sessionDay = relativeDay === 'Today' || relativeDay === 'Yesterday' ? relativeDay : new Date(session.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <article className="session-journal-card" id={`session-${session.id}`}>
      <Link to={`/sessions/${session.id}`} className="session-journal-link" aria-label={`Open session at ${session.venueName}`}>
        <div className={`session-journal-photo ${photo ? '' : 'without-photo'}`}>
          {photo ? <img src={photo} alt={`${session.venueName} swim`} loading="lazy" /> : <><Waves size={29} /><span>No swim photo</span></>}
        </div>
        <div className="session-journal-body">
          <div className="session-journal-heading">
            <h3>{session.venueName}</h3>
            <span className={`session-visibility ${shared ? 'shared' : 'private'}`}>
              {shared ? <Globe size={11} /> : <Lock size={11} />}{shared ? 'Shared' : 'Private'}
            </span>
          </div>
          <div className="session-journal-meta">
            <span><Calendar size={13} />{sessionDay} at {fmtTime(session.startedAt)}</span>
            <span><MapPin size={13} />{venue?.nearestTown || venue?.region || session.venueName}</span>
          </div>
          <div className="session-journal-count"><Fish size={16} />{catches.length} {catches.length === 1 ? 'catch' : 'catches'}{!session.endedAt && <span className="session-live"><span className="live-dot" />In progress</span>}</div>
          <div className="session-journal-metrics">
            <div title={weather?.description || 'Weather not logged'}><ConditionsIcon size={22} className={weather?.code === 0 ? 'sunny' : ''} /><span><strong>{weather ? `${Math.round(weather.temperature)}°C` : 'Not logged'}</strong><small>Conditions</small></span></div>
            <div title={water}><Waves size={22} /><span><strong>{water}</strong><small>Water</small></span></div>
            <div title={bait}><Fish size={21} /><span><strong>{bait}</strong><small>Bait</small></span></div>
          </div>
        </div>
        <ChevronRight size={18} className="session-journal-chevron" />
      </Link>
      <details className="session-journal-menu">
        <summary aria-label={`Options for ${session.venueName}`}><MoreHorizontal size={20} /></summary>
        <div className="session-journal-menu-items">
          <Link to={`/sessions/${session.id}`}>Open session <ChevronRight size={14} /></Link>
          <Link to={`/sessions?tab=catches&session=${encodeURIComponent(session.id)}`}>View catches <Fish size={14} /></Link>
        </div>
      </details>
    </article>
  );
}

function SessionMap({ sessions, selected, onSelect }: { sessions: Session[]; selected: string | null; onSelect: (location: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const selectRef = useRef(onSelect);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  useEffect(() => {
    if (!container.current || !sessions.length) return;
    let cancelled = false;
    let engine: MapEngine | null = null;
    const groups = new Map<string, Session[]>();
    for (const session of sessions) groups.set(locationKey(session), [...(groups.get(locationKey(session)) || []), session]);
    const latitudes = sessions.map(session => session.lat);
    const longitudes = sessions.map(session => session.lon);
    const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes), maxLon = Math.max(...longitudes);
    const span = Math.max(maxLat - minLat, maxLon - minLon);
    const zoom = span === 0 ? 12 : Math.max(2, Math.min(12, Math.floor(Math.log2(180 / span)) - 1));
    createMap(container.current, [(minLat + maxLat) / 2, (minLon + maxLon) / 2], zoom, theme === 'dark', true).then(map => {
      if (cancelled) { map.destroy(); return; }
      engine = map;
      map.setMarkers([...groups.entries()].map(([key, group]) => ({ id: key, lat: group[0].lat, lon: group[0].lon, title: `${group[0].venueName} · ${group.length} ${group.length === 1 ? 'session' : 'sessions'}`, label: String(group.length), kind: 'venue' })), id => selectRef.current(id));
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; engine?.destroy(); };
  }, [sessions, theme, retry]);

  if (!sessions.length) return <div className="session-view-message"><MapPin size={26} /><h2>No locations recorded yet</h2><p>Sessions with a saved location will appear on your map.</p></div>;
  return (
    <div className="session-map-section">
      <p className="session-view-hint"><Lock size={13} />Your journal map includes your private sessions.</p>
      <div ref={container} className="session-journal-map" aria-label="Map of your fishing sessions" />
      {error && <div className="session-map-error" role="status">The map couldn't load. Your sessions are listed below.<button onClick={() => { setError(false); setRetry(value => value + 1); }}>Retry map</button></div>}
      {selected ? <button className="session-text-button" onClick={() => onSelect(null)}>Show all locations <ArrowRight size={15} /></button> : <p className="session-view-hint">Select a pin to see sessions at that water.</p>}
    </div>
  );
}

export default function SessionsPage({ onStart, renderCatch }: { onStart: () => void; renderCatch: (catchItem: Catch) => ReactNode }) {
  const { sessions, catches } = useStore();
  const [params, setParams] = useSearchParams();
  const tab: View = ['calendar', 'map', 'catches'].includes(params.get('tab') || '') ? params.get('tab') as View : 'sessions';
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const sorted = useMemo(() => [...sessions].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()), [sessions]);
  const located = useMemo(() => sorted.filter(hasLocation), [sorted]);
  const monthParam = params.get('month');
  const [initialMonth] = useState(() => dateKey(new Date()).slice(0, 7));
  const monthKey = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : initialMonth;
  const [year, month] = monthKey.split('-').map(Number);
  const monthDate = new Date(year, month - 1, 1);
  const selectedDate = params.get('date');
  const sessionFilter = params.get('session');
  const showAll = params.get('view') === 'all';
  const catchList = catches.filter(catchItem => !sessionFilter || catchItem.sessionId === sessionFilter);
  const visibleSessions = tab === 'calendar' ? sorted.filter(session => dateKey(new Date(session.startedAt)).startsWith(monthKey) && (!selectedDate || dateKey(new Date(session.startedAt)) === selectedDate)) : tab === 'map' ? located.filter(session => !selectedLocation || locationKey(session) === selectedLocation) : showAll ? sorted : sorted.slice(0, 4);
  const catchesBySession = useMemo(() => {
    const grouped = new Map<string, Catch[]>();
    for (const catchItem of catches) grouped.set(catchItem.sessionId, [...(grouped.get(catchItem.sessionId) || []), catchItem]);
    return grouped;
  }, [catches]);
  const setView = (view: View) => setParams(view === 'sessions' ? {} : { tab: view });
  const changeMonth = (offset: number) => setParams({ tab: 'calendar', month: dateKey(new Date(year, month - 1 + offset, 1)).slice(0, 7) });

  return (
    <main className="content sessions-page">
      <header className="sessions-hero"><h1>Fishing Sessions</h1><p>All your sessions in one place.</p></header>
      <nav className="sessions-view-tabs" aria-label="Session views">
        <button className={tab === 'sessions' || tab === 'catches' ? 'active' : ''} aria-current={tab === 'sessions' || tab === 'catches' ? 'page' : undefined} onClick={() => setView('sessions')}>My Sessions</button>
        <button className={tab === 'calendar' ? 'active' : ''} aria-current={tab === 'calendar' ? 'page' : undefined} onClick={() => setView('calendar')}><Calendar size={18} />Calendar</button>
        <button className={tab === 'map' ? 'active' : ''} aria-current={tab === 'map' ? 'page' : undefined} onClick={() => setView('map')}><MapPin size={18} />Map</button>
      </nav>
      <button className="session-start-card" id="new-session-btn" onClick={onStart}><span className="session-start-icon"><Plus size={23} /></span><span><strong>Start a new session</strong><small>Log your swim, weather and catches.</small></span><ChevronRight size={20} /></button>

      {tab === 'calendar' && <section className="session-calendar" aria-label="Session calendar">
        <div className="session-calendar-heading"><button className="icon-btn" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={19} /></button><h2>{monthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2><button className="icon-btn" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={19} /></button></div>
        <div className="session-calendar-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span className="session-calendar-weekday" key={day}>{day}</span>)}
          {Array.from({ length: (monthDate.getDay() + 6) % 7 }, (_, index) => <span key={`empty-${index}`} />)}
          {Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => {
            const key = `${monthKey}-${String(index + 1).padStart(2, '0')}`;
            const count = sorted.filter(session => dateKey(new Date(session.startedAt)) === key).length;
            return <button key={key} className={`${count ? 'has-sessions' : ''} ${selectedDate === key ? 'selected' : ''}`} aria-pressed={selectedDate === key} aria-label={`${index + 1} ${monthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}, ${count} ${count === 1 ? 'session' : 'sessions'}`} onClick={() => setParams({ tab: 'calendar', month: monthKey, ...(selectedDate === key ? {} : { date: key }) })}>{index + 1}{count > 0 && <span />}</button>;
          })}
        </div>
        {selectedDate && <button className="session-text-button" onClick={() => setParams({ tab: 'calendar', month: monthKey })}>Show whole month <ArrowRight size={14} /></button>}
      </section>}
      {tab === 'map' && <SessionMap sessions={located} selected={selectedLocation} onSelect={setSelectedLocation} />}

      <section aria-labelledby="session-list-title">
        <div className="sessions-section-heading"><h2 id="session-list-title">{tab === 'catches' ? 'Catch History' : tab === 'calendar' ? selectedDate ? 'Sessions on this day' : 'Sessions this month' : tab === 'map' ? 'Sessions on the map' : showAll ? 'All Sessions' : 'Recent Sessions'}</h2>{tab === 'sessions' && sorted.length > 4 && <button className="session-text-button" onClick={() => setParams(showAll ? {} : { view: 'all' })}>{showAll ? 'Show recent' : 'View all'}<ArrowRight size={16} /></button>}{tab === 'catches' && <button className="session-text-button" onClick={() => setView('sessions')}>My sessions <ArrowRight size={16} /></button>}</div>
        {tab === 'catches' ? catchList.length ? <div className="card">{catchList.map(renderCatch)}</div> : <div className="session-view-message"><Fish size={28} /><h3>No catches recorded</h3><p>Your logged catches will appear here.</p></div> : visibleSessions.length ? <div className="session-journal-list">{visibleSessions.map(session => <SessionCard key={session.id} session={session} catches={catchesBySession.get(session.id) || []} />)}</div> : <div className="session-view-message"><Calendar size={28} /><h3>{sorted.length ? 'No sessions in this view' : 'No sessions yet'}</h3><p>{sorted.length ? 'Choose another date or view to find your sessions.' : 'Start a session to save your swim, conditions and catches.'}</p></div>}
      </section>
      {tab !== 'catches' && <Link className="session-catch-history" to="/sessions?tab=catches"><Fish size={17} />All catches ({catches.length})<ArrowRight size={16} /></Link>}
    </main>
  );
}
