import { useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, useParams, Navigate } from 'react-router-dom';
import {
  Fish, User, MapPin, Calendar, ChevronRight, Plus, X, Thermometer, Wind, Droplets, Gauge,
  Cloud, RefreshCw, Camera, Trash2, ArrowLeft, Clock, Trophy, LocateFixed, Square, Images, Check,
} from 'lucide-react';
import './index.css';
import Discover from './Discover';
import Logo from './Logo';
import { VENUES, SPECIES, actions, useStore, fmtWeight, fmtDay, fmtTime, totalOz, resizeImage, type Venue, type Session, type Catch } from './store';
import { fetchWeather, getDevicePosition, compass } from './weather';

/* ---------- Weather logging ---------- */

async function logWeather(session: Pick<Session, 'id' | 'lat' | 'lon' | 'venueName'>) {
  actions.updateSession(session.id, { weatherError: undefined });
  try {
    const weather = await fetchWeather(session.lat, session.lon);
    actions.updateSession(session.id, { weather });
    console.groupCollapsed(`[Keepnet] Weather logged for ${session.venueName} @ ${fmtTime(weather.fetchedAt)}`);
    console.table({ ...weather, lat: session.lat, lon: session.lon });
    console.groupEnd();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Weather unavailable';
    actions.updateSession(session.id, { weatherError: msg });
    console.warn('[Keepnet] Weather fetch failed', e);
  }
}

/* ---------- Shared bits ---------- */

const CatchRow = ({ c }: { c: Catch }) => (
  <Link to={`/catches/${c.id}`} className="catch-item" id={`catch-${c.id}`}>
    {c.image ? <img src={c.image} alt={c.species} className="catch-img" loading="lazy" /> : <div className="catch-img placeholder"><Fish size={24} /></div>}
    <div className="catch-info">
      <div className="catch-species">{c.species}</div>
      <div className="catch-weight">{fmtWeight(c)}</div>
      <div className="catch-meta">{c.bait} · {fmtDay(c.caughtAt)}</div>
    </div>
    <ChevronRight size={20} color="var(--text-secondary)" />
  </Link>
);

const WeatherCard = ({ s }: { s: Session }) => {
  const w = s.weather;
  const live = !s.endedAt;
  return (
    <div className="card weather-card">
      <div className="weather-head">
        <div>
          <div className="eyebrow">Conditions{w ? ` · ${fmtTime(w.fetchedAt)}` : ''}</div>
          {w ? (
            <div className="weather-main"><span className="weather-temp serif">{Math.round(w.temperature)}°</span><span>{w.description}</span></div>
          ) : s.weatherError ? (
            <div className="muted">Couldn't fetch weather: {s.weatherError}</div>
          ) : (
            <div className="muted shimmer-text">Fetching latest weather…</div>
          )}
        </div>
        {live && (
          <button className="icon-btn" id="weather-refresh-btn" onClick={() => logWeather(s)} aria-label="Refresh weather"><RefreshCw size={18} /></button>
        )}
      </div>
      {w && (
        <div className="weather-grid">
          <div><Thermometer size={16} /><span>Feels {Math.round(w.feelsLike)}°</span></div>
          <div><Wind size={16} /><span>{Math.round(w.windSpeed)} mph {compass(w.windDirection)}</span></div>
          <div><Droplets size={16} /><span>{w.humidity}% · {w.precipitation}mm</span></div>
          <div><Gauge size={16} /><span>{Math.round(w.pressure)} hPa</span></div>
          <div><Cloud size={16} /><span>{w.cloudCover}% cloud</span></div>
        </div>
      )}
    </div>
  );
};

const Sheet = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => (
  <div className="sheet-backdrop" onClick={onClose}>
    <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
      <div className="sheet-head">
        <h2 className="serif">{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      {children}
    </div>
  </div>
);

/* ---------- Photo picker (camera on mobile, file picker on desktop) ---------- */

const PhotoPicker = ({ id, value, onChange, label = 'Add photo' }: { id: string; value?: string; onChange: (v: string) => void; label?: string }) => (
  <>
    <label className={`photo-pick ${value ? 'has-photo' : ''}`} htmlFor={id}>
      {value ? (
        <><img src={value} alt="Selected" /><span className="photo-change"><Camera size={14} /> Retake</span></>
      ) : (
        <><Camera size={28} /><span>{label}</span><small className="muted">Optional</small></>
      )}
    </label>
    <input id={id} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange(await resizeImage(f, 1024)); e.target.value = ''; }} />
  </>
);

/* ---------- Start session ---------- */

const StartSessionSheet = ({ initial, onClose, onStart }: { initial?: Venue; onClose: () => void; onStart: (v: Venue | 'current', photo?: string) => void }) => {
  const [choice, setChoice] = useState<string>(initial?.id ?? VENUES[0].id);
  const [photo, setPhoto] = useState<string>();
  return (
    <Sheet title="Start a session" onClose={onClose}>
      <p className="muted" style={{ marginBottom: 4 }}>Snap your swim and we'll log the latest weather when the session begins.</p>
      <PhotoPicker id="session-photo" value={photo} onChange={setPhoto} label="Photo of the location" />
      <div className="choice-list">
        <button id="venue-choice-current" className={`list-row ${choice === 'current' ? 'selected' : ''}`} onClick={() => setChoice('current')}>
          <div className="list-icon"><LocateFixed size={18} /></div>
          <div className="catch-info"><div className="catch-species">My current location</div><div className="catch-meta">Uses device GPS</div></div>
        </button>
        {VENUES.map((v) => (
          <button key={v.id} id={`venue-choice-${v.id}`} className={`list-row ${choice === v.id ? 'selected' : ''}`} onClick={() => setChoice(v.id)}>
            <div className="list-icon"><MapPin size={18} /></div>
            <div className="catch-info"><div className="catch-species">{v.name}</div><div className="catch-meta">{v.type}</div></div>
          </button>
        ))}
      </div>
      <button className="btn-primary" id="confirm-start-btn" style={{ marginTop: 16 }} onClick={() => onStart(choice === 'current' ? 'current' : VENUES.find((v) => v.id === choice)!, photo)}>
        <Plus size={20} /> Start session
      </button>
    </Sheet>
  );
};

/* ---------- Pages ---------- */

const Home = ({ onStart }: { onStart: (v?: Venue) => void }) => {
  const { catches, sessions } = useStore();
  const active = sessions.find((s) => !s.endedAt);
  const next = VENUES[0];
  return (
    <div className="content">
      <h1 className="hero-title">Time by the water.</h1>
      <p className="hero-subtitle">Your private fishing journal</p>

      <div className="hero-image-container">
        <img src="/images/hero-river.jpg" alt="Misty river at dawn with an angler on a wooden peg" className="hero-image" />
      </div>

      {active ? (
        <Link to={`/sessions/${active.id}`} className="card card-link live-card" id="active-session-card">
          <div className="eyebrow"><span className="live-dot" /> Session in progress</div>
          <div className="row-between"><h2 className="serif" style={{ fontSize: 24 }}>{active.venueName}</h2><ChevronRight size={20} color="var(--text-secondary)" /></div>
          <div className="muted">Started {fmtTime(active.startedAt)}{active.weather ? ` · ${Math.round(active.weather.temperature)}° ${active.weather.description}` : ''}</div>
        </Link>
      ) : (
        <div className="card">
          <div className="eyebrow">Next Session</div>
          <Link to="/discover" className="row-between" style={{ marginBottom: 12 }}>
            <h2 className="serif" style={{ fontSize: 24 }}>{next.name}</h2>
            <ChevronRight size={20} color="var(--text-secondary)" />
          </Link>
          <div className="tag-row">
            <div className="tag"><MapPin size={14} /> {next.type}</div>
            <div className="tag"><span style={{ color: 'var(--danger)' }}>◎</span> Target: {next.targets.join(', ')}</div>
          </div>
          <button className="btn-primary" id="start-session-btn" onClick={() => onStart(next)}><Plus size={20} /> Start session</button>
        </div>
      )}

      <div className="section-header">
        <h2 className="serif section-title">Recent catches</h2>
        <Link to="/sessions" className="view-all">View all <ChevronRight size={16} /></Link>
      </div>
      <div className="card">
        {catches.length ? catches.slice(0, 3).map((c) => <CatchRow key={c.id} c={c} />) : <p className="muted">No catches yet — start a session!</p>}
      </div>
    </div>
  );
};

const Sessions = ({ onStart }: { onStart: () => void }) => {
  const { sessions, catches } = useStore();
  return (
    <div className="content">
      <div className="row-between"><h1 className="page-title">Sessions</h1><button className="icon-btn filled" id="new-session-btn" onClick={onStart} aria-label="New session"><Plus size={20} /></button></div>
      <p className="page-subtitle">{sessions.length} sessions logged</p>
      {sessions.map((s) => {
        const n = catches.filter((c) => c.sessionId === s.id).length;
        return (
          <Link key={s.id} to={`/sessions/${s.id}`} className="card card-link session-card" id={`session-${s.id}`}>
            {s.photo && <img src={s.photo} alt={`${s.venueName} swim`} className="session-thumb" loading="lazy" />}
            <div className="row-between">
              <div>
                <div className="eyebrow">{!s.endedAt && <span className="live-dot" />}{fmtDay(s.startedAt)} · {fmtTime(s.startedAt)}</div>
                <h2 className="serif" style={{ fontSize: 20 }}>{s.venueName}</h2>
              </div>
              <ChevronRight size={20} color="var(--text-secondary)" />
            </div>
            <div className="tag-row" style={{ marginTop: 10, marginBottom: 0 }}>
              <span className="tag"><Fish size={14} /> {n} {n === 1 ? 'catch' : 'catches'}</span>
              {s.weather && <span className="tag"><Thermometer size={14} /> {Math.round(s.weather.temperature)}° {s.weather.description}</span>}
              {s.weather && <span className="tag"><Wind size={14} /> {Math.round(s.weather.windSpeed)} mph</span>}
            </div>
          </Link>
        );
      })}
    </div>
  );
};

const AddCatchSheet = ({ sessionId, onClose }: { sessionId: string; onClose: () => void }) => {
  const [species, setSpecies] = useState(SPECIES[0]);
  const [lb, setLb] = useState(0);
  const [oz, setOz] = useState(0);
  const [bait, setBait] = useState('');
  const [notes, setNotes] = useState('');
  const [image, setImage] = useState<string>();
  return (
    <Sheet title="Log a catch" onClose={onClose}>
      <PhotoPicker id="catch-photo" value={image} onChange={setImage} label="Photo of your catch" />
      <label className="field"><span>Species</span>
        <select id="catch-species" value={species} onChange={(e) => setSpecies(e.target.value)}>{SPECIES.map((s) => <option key={s}>{s}</option>)}</select>
      </label>
      <div className="field-row">
        <label className="field"><span>lb</span><input id="catch-lb" type="number" min={0} value={lb} onChange={(e) => setLb(Math.max(0, +e.target.value))} /></label>
        <label className="field"><span>oz</span><input id="catch-oz" type="number" min={0} max={15} value={oz} onChange={(e) => setOz(Math.min(15, Math.max(0, +e.target.value)))} /></label>
      </div>
      <label className="field"><span>Bait</span><input id="catch-bait" placeholder="e.g. Worm, Bread, Maggot" value={bait} onChange={(e) => setBait(e.target.value)} /></label>
      <label className="field"><span>Notes</span><textarea id="catch-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <button className="btn-primary" id="save-catch-btn" onClick={() => { actions.addCatch({ sessionId, species, weightLb: lb, weightOz: oz, bait: bait || 'Unknown', notes, image, caughtAt: new Date().toISOString() }); onClose(); }}>
        <Plus size={20} /> Save catch
      </button>
    </Sheet>
  );
};

const SessionDetail = () => {
  const { id } = useParams();
  const { sessions, catches } = useStore();
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const s = sessions.find((x) => x.id === id);
  if (!s) return <Navigate to="/sessions" replace />;
  const list = catches.filter((c) => c.sessionId === s.id);
  const live = !s.endedAt;
  // Every photo belonging to this session: location shots, legacy cover, then catch photos.
  const gallery = [...new Set([...(s.photos ?? []), ...(s.photo ? [s.photo] : []), ...list.flatMap((c) => (c.image ? [c.image] : []))])];
  return (
    <div className="content">
      <Link to="/sessions" className="back-link"><ArrowLeft size={18} /> Sessions</Link>
      <div className="eyebrow">{live && <span className="live-dot" />}{live ? 'In progress' : fmtDay(s.startedAt)}</div>
      <h1 className="page-title">{s.venueName}</h1>
      <p className="page-subtitle"><Clock size={14} style={{ verticalAlign: -2 }} /> {fmtTime(s.startedAt)}{s.endedAt ? ` – ${fmtTime(s.endedAt)}` : ' – now'}</p>

      <div className={`session-photo ${s.photo ? '' : 'empty'}`}>
        {s.photo ? <img src={s.photo} alt={`${s.venueName} swim`} /> : <><Camera size={26} /><span>Add a photo of your swim</span></>}
        <div className="photo-actions">
          {gallery.length > 1 || (gallery.length === 1 && gallery[0] !== s.photo) ? (
            <button className="photo-change static" id="change-cover-btn" onClick={() => setPicking(true)}><Images size={14} /> Change cover</button>
          ) : null}
          <label htmlFor="session-photo-edit" className="photo-change static" id="session-photo-btn"><Camera size={14} /> {s.photo ? 'Add photo' : 'Take photo'}</label>
        </div>
        <input id="session-photo-edit" type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) actions.addSessionPhoto(s.id, await resizeImage(f, 1024)); e.target.value = ''; }} />
      </div>

      {picking && (
        <Sheet title="Choose cover photo" onClose={() => setPicking(false)}>
          <p className="muted" style={{ marginBottom: 12 }}>Pick any photo from this session.</p>
          <div className="cover-grid">
            {gallery.map((src, i) => (
              <button key={i} id={`cover-option-${i}`} className={`cover-option ${src === s.photo ? 'selected' : ''}`} onClick={() => { actions.updateSession(s.id, { photo: src }); setPicking(false); }}>
                <img src={src} alt={`Session photo ${i + 1}`} />
                {src === s.photo && <span className="cover-check"><Check size={14} /></span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      <WeatherCard s={s} />

      <div className="section-header"><h2 className="serif section-title">Catches ({list.length})</h2></div>
      <div className="card">{list.length ? list.map((c) => <CatchRow key={c.id} c={c} />) : <p className="muted">Nothing in the net yet.</p>}</div>

      {live && (
        <div className="stack">
          <button className="btn-primary" id="add-catch-btn" onClick={() => setAdding(true)}><Fish size={20} /> Log a catch</button>
          <button className="btn-secondary" id="end-session-btn" onClick={() => actions.updateSession(s.id, { endedAt: new Date().toISOString() })}><Square size={16} /> End session</button>
        </div>
      )}
      {adding && <AddCatchSheet sessionId={s.id} onClose={() => setAdding(false)} />}
    </div>
  );
};

const CatchDetail = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const { catches, sessions } = useStore();
  const c = catches.find((x) => x.id === id);
  if (!c) return <Navigate to="/" replace />;
  const s = sessions.find((x) => x.id === c.sessionId);
  return (
    <div className="content">
      <button className="back-link" onClick={() => nav(-1)}><ArrowLeft size={18} /> Back</button>
      {c.image && <div className="hero-image-container"><img src={c.image} alt={c.species} className="hero-image tall" /></div>}
      <div className="eyebrow">{fmtDay(c.caughtAt)} · {fmtTime(c.caughtAt)}</div>
      <h1 className="page-title">{c.species}</h1>
      <p className="catch-big-weight serif">{fmtWeight(c)}</p>
      <div className="tag-row"><span className="tag">Bait: {c.bait}</span>{s && <Link to={`/sessions/${s.id}`} className="tag"><MapPin size={14} /> {s.venueName}</Link>}</div>
      {c.notes && <div className="card"><p>{c.notes}</p></div>}
      {s && <WeatherCard s={{ ...s, endedAt: s.endedAt ?? 'x' }} />}
      <button className="btn-secondary danger" id="delete-catch-btn" onClick={() => { actions.deleteCatch(c.id); nav(-1); }}><Trash2 size={16} /> Delete catch</button>
    </div>
  );
};

const Profile = () => {
  const { catches, sessions, name } = useStore();
  const species = [...new Set(catches.map((c) => c.species))];
  const best = [...catches].sort((a, b) => totalOz(b) - totalOz(a))[0];
  const pbs = species.map((sp) => catches.filter((c) => c.species === sp).sort((a, b) => totalOz(b) - totalOz(a))[0]);
  const hours = sessions.reduce((t, s) => t + ((s.endedAt ? new Date(s.endedAt).getTime() : Date.now()) - new Date(s.startedAt).getTime()) / 3600000, 0);
  return (
    <div className="content">
      <div className="profile-hero">
        <img src="/images/logo.jpg" alt="Keepnet" className="avatar" />
        <div>
          <input className="name-input serif" id="profile-name" value={name} onChange={(e) => actions.setName(e.target.value)} aria-label="Your name" />
          <div className="muted">Angling since {sessions.length ? new Date(sessions[sessions.length - 1].startedAt).getFullYear() : new Date().getFullYear()}</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat"><span className="stat-num serif">{sessions.length}</span><span>Sessions</span></div>
        <div className="stat"><span className="stat-num serif">{catches.length}</span><span>Catches</span></div>
        <div className="stat"><span className="stat-num serif">{species.length}</span><span>Species</span></div>
        <div className="stat"><span className="stat-num serif">{Math.round(hours)}</span><span>Hours</span></div>
      </div>

      {best && (
        <Link to={`/catches/${best.id}`} className="card card-link best-card">
          {best.image && <img src={best.image} alt={best.species} />}
          <div className="best-overlay">
            <div className="eyebrow light"><Trophy size={14} /> Biggest fish</div>
            <div className="serif" style={{ fontSize: 22 }}>{best.species} · {fmtWeight(best)}</div>
          </div>
        </Link>
      )}

      <div className="section-header"><h2 className="serif section-title">Personal bests</h2></div>
      <div className="card">{pbs.length ? pbs.map((c) => <CatchRow key={c.id} c={c} />) : <p className="muted">No catches yet.</p>}</div>

      <button className="btn-secondary" id="reset-data-btn" onClick={() => confirm('Reset journal to demo data?') && actions.reset()}>Reset demo data</button>
    </div>
  );
};

/* ---------- Shell ---------- */

const Navigation = () => {
  const { pathname } = useLocation();
  const is = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p));
  return (
    <nav className="bottom-nav">
      <Link to="/" id="nav-home" className={`nav-item ${is('/') || pathname.startsWith('/catches') ? 'active' : ''}`}><Fish className="nav-icon" />Home</Link>
      <Link to="/sessions" id="nav-sessions" className={`nav-item ${is('/sessions') ? 'active' : ''}`}><Calendar className="nav-icon" />Sessions</Link>
      <Link to="/discover" id="nav-discover" className={`nav-item ${is('/discover') ? 'active' : ''}`}><MapPin className="nav-icon" />Discover</Link>
      <Link to="/profile" id="nav-profile" className={`nav-item ${is('/profile') ? 'active' : ''}`}><User className="nav-icon" />Profile</Link>
    </nav>
  );
};

const Shell = () => {
  const nav = useNavigate();
  const [sheet, setSheet] = useState<{ venue?: Venue } | null>(null);

  const begin = async (v: Venue | 'current', photo?: string) => {
    setSheet(null);
    if (v === 'current') {
      const s = actions.startSession({ venueId: 'current', venueName: 'Current location', lat: VENUES[0].lat, lon: VENUES[0].lon, photo });
      nav(`/sessions/${s.id}`);
      const pos = await getDevicePosition();
      const at = pos ?? { lat: s.lat, lon: s.lon };
      actions.updateSession(s.id, { ...at, venueName: pos ? 'Current location' : `${VENUES[0].name} (GPS unavailable)` });
      await logWeather({ ...s, ...at });
    } else {
      const s = actions.startSession({ venueId: v.id, venueName: v.name, lat: v.lat, lon: v.lon, photo });
      nav(`/sessions/${s.id}`);
      await logWeather(s);
    }
  };

  return (
    <div className="app-container">
      <header className="top-bar">
        <Link to="/" className="logo-header" aria-label="Keepnet home"><Logo height={34} /></Link>
        <Link to="/profile" className="profile-btn" id="header-profile-btn" aria-label="Profile"><User size={20} /></Link>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home onStart={(venue) => setSheet({ venue })} />} />
          <Route path="/sessions" element={<Sessions onStart={() => setSheet({})} />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/catches/:id" element={<CatchDetail />} />
          <Route path="/discover" element={<Discover onStart={(venue) => setSheet({ venue })} />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Navigation />
      {sheet && <StartSessionSheet initial={sheet.venue} onClose={() => setSheet(null)} onStart={begin} />}
    </div>
  );
};

const App = () => (
  <BrowserRouter>
    <Shell />
  </BrowserRouter>
);

export default App;
