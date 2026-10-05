import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, useParams, Navigate, useSearchParams } from 'react-router-dom';
import {
  Fish, User, MapPin, Calendar, ChevronRight, ChevronLeft, Plus, X, Thermometer, Wind, Droplets, Gauge,
  Cloud, RefreshCw, Camera, Trash2, ArrowLeft, Clock, Trophy, LocateFixed, Square, Images, Check,
  Share2, Globe, Lock, Copy, HardDrive, KeyRound, Mail, Pencil, Search, ShieldCheck,
  Compass, Sparkles, Download, AlertCircle, Settings as SettingsIcon, Heart, Crown, Waves,
  EyeOff, Zap, Gift, Bookmark, MessageSquare, MoreHorizontal, CheckCircle2, Home as HomeIcon
} from 'lucide-react';
import './index.css';
import Discover from './Discover';
import FisheriesDirectory from './FisheriesDirectory';
import Logo from './Logo';
import Settings from './Settings';
import AchievementsPage from './AchievementsPage';
import SubscriptionPage from './SubscriptionPage';
import {
  VENUES, actions, useStore, fmtWeight, fmtDay, fmtTime, totalOz, resizeImage,
  metricToImperial, imperialToMetric, type Venue, type Session, type Catch, type UnitSystem
} from './store';
import { fetchWeather, getDevicePosition, compass, type Weather } from './weather';
import { useAuth, authActions, isUserAdmin } from './auth';
import AdminPanel from './AdminPanel';
import { evaluateAchievements, getEquippedAchievement } from './achievements';
import { syncUserWithCloud, fetchUserCloudData, useCloudSyncStatus, flushPendingQueue, fetchPublicSharedData } from './cloud';
import CatchComments from './CatchComments';
import PersonalBests from './PersonalBests';
import { usePremiumMembership } from './membership';

// Global PWA installation event capture
let globalInstallPrompt: any = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalInstallPrompt = e;
    window.dispatchEvent(new Event('keepnet:installable'));
  });
}

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
      <div className="row-between" style={{ alignItems: 'baseline' }}>
        <div className="catch-species">{c.species}</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {c.isConfidential && (
            <span className="mini-badge private" style={{ borderColor: 'rgba(201, 119, 43, 0.4)', color: 'var(--copper, #C9772B)' }} title="Syndicate / Secret water privacy enabled">
              <EyeOff size={10} /> Syndicate
            </span>
          )}
          {c.isShared ? (
            <span className="mini-badge shared" title="Shared on Discover map"><Globe size={11} /> Shared</span>
          ) : (
            <span className="mini-badge private" title="Private to your journal"><Lock size={11} /> Private</span>
          )}
        </div>
      </div>
      <div className="catch-weight">{fmtWeight(c)}</div>
      <div className="catch-meta">{c.bait} · {fmtDay(c.caughtAt)}</div>
    </div>
    <ChevronRight size={20} color="var(--text-secondary)" />
  </Link>
);

function getSolunarPrediction(pressure?: number, fetchedAt?: string) {
  if (!pressure) return null;
  const p = Math.round(pressure);
  const hour = fetchedAt ? new Date(fetchedAt).getHours() : new Date().getHours();
  const isDawnOrDusk = (hour >= 5 && hour <= 9) || (hour >= 17 && hour <= 21);

  let rating: string;
  let score: number;
  let advice: string;

  if (p >= 1012 && p <= 1022 && isDawnOrDusk) {
    rating = 'Prime Bite Window';
    score = 94;
    advice = 'Optimal barometric stability combined with dawn/dusk solunar feeding peak.';
  } else if (p < 1010) {
    rating = 'High Activity';
    score = 86;
    advice = 'Low pressure front active — stimulates carp, tench and pike aggressive bottom feeding.';
  } else if (p > 1022) {
    rating = 'Moderate Activity';
    score = 72;
    advice = 'High pressure ceiling — focus on zigs, floating baits, or deeper oxygenated margins.';
  } else {
    rating = 'Steady Feeding';
    score = 78;
    advice = 'Stable atmospheric conditions. Regular loose feeding should produce consistent bites.';
  }

  return { rating, score, advice, pressure: p };
}

const WeatherCard = ({ s }: { s: Session }) => {
  const w = s.weather;
  const live = !s.endedAt;
  const isPremiumActive = usePremiumMembership();
  const solunar = getSolunarPrediction(w?.pressure, w?.fetchedAt);

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
      {w && solunar && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.18)' }}>
          {isPremiumActive ? (
            <div>
              <div className="row-between" style={{ alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12, color: '#fde047' }}>
                  <Zap size={14} /> Solunar & Barometric Predictor
                </div>
                <span className="count-pill" style={{ fontSize: 11, background: 'rgba(253, 224, 71, 0.2)', color: '#fde047', fontWeight: 700 }}>
                  {solunar.rating} ({solunar.score}%)
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.92, lineHeight: 1.4 }}>
                {solunar.advice}
              </p>
            </div>
          ) : (
            <Link to="/subscription" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row-between" style={{ alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Crown size={14} style={{ color: '#fde047' }} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Specimen Bite Window Predictor</span>
                </div>
                <span style={{ fontSize: 11, color: '#fde047', fontWeight: 700 }}>1-Month Free Trial →</span>
              </div>
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

const WeatherSummary = ({ weather }: { weather?: Weather }) => {
  const [expanded, setExpanded] = useState(false);
  if (!weather) return null;
  return (
    <div className="weather-accordion">
      <button
        type="button"
        className="weather-accordion-header"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Thermometer size={15} color="var(--accent-green)" />
          <span>Conditions: <strong>{Math.round(weather.temperature)}° {weather.description}</strong> · {Math.round(weather.windSpeed)} mph {compass(weather.windDirection)}</span>
        </div>
        <ChevronRight size={16} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
          <div className="weather-grid" style={{ color: 'var(--text-primary)' }}>
            <div><Thermometer size={15} /><span>Feels {Math.round(weather.feelsLike)}°</span></div>
            <div><Wind size={15} /><span>{Math.round(weather.windSpeed)} mph</span></div>
            <div><Droplets size={15} /><span>{weather.humidity}% humidity</span></div>
            <div><Gauge size={15} /><span>{Math.round(weather.pressure)} hPa</span></div>
            <div><Cloud size={15} /><span>{weather.cloudCover}% cloud cover</span></div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- Accessible Sheet Modal Primitive ---------- */

const Sheet = ({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pointerDownOnBackdropRef = useRef(false);

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = origOverflow;
      window.removeEventListener('keydown', onKeyDown);
      if (openerRef.current && typeof openerRef.current.focus === 'function') {
        openerRef.current.focus();
      }
    };
  }, []); // Only runs once on mount and cleans up on unmount

  return (
    <div
      className="sheet-backdrop"
      onPointerDown={(e) => {
        // Track whether pointer down began directly on the backdrop (not inside sheet or on inputs)
        pointerDownOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Only close if BOTH pointerdown AND click occurred directly on the backdrop
        if (e.target === e.currentTarget && pointerDownOnBackdropRef.current) {
          onCloseRef.current();
        }
        pointerDownOnBackdropRef.current = false;
      }}
    >
      <div
        ref={dialogRef}
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-head">
          <h2 className="serif">{title}</h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="sheet-close-btn"
            onClick={(e) => {
              e.stopPropagation();
              onCloseRef.current();
            }}
            aria-label={`Close ${title}`}
          >
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">
          {children}
        </div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
};

/* ---------- Photo picker (Gallery & Camera on mobile & desktop) ---------- */

const PhotoPicker = ({
  id,
  value,
  onChange,
  label = 'Add photo',
}: {
  id: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  label?: string;
}) => {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onChange(await resizeImage(f, 1024));
    e.target.value = '';
  };

  return (
    <div className="photo-picker-container" style={{ margin: '8px 0 14px' }}>
      {label && <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>}
      {value ? (
        <div className="photo-pick has-photo" style={{ margin: 0, position: 'relative' }}>
          <img src={value} alt="Selected" />
          <div className="photo-change-options">
            <button
              type="button"
              className="photo-change-btn"
              onClick={() => cameraRef.current?.click()}
              title="Take new photo with camera"
            >
              <Camera size={13} /> Camera
            </button>
            <button
              type="button"
              className="photo-change-btn"
              onClick={() => galleryRef.current?.click()}
              title="Choose photo from gallery"
            >
              <Images size={13} /> Gallery
            </button>
            <button
              type="button"
              className="photo-change-btn danger"
              onClick={() => onChange(undefined)}
              title="Remove photo"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div className="photo-pick-actions">
          <button
            type="button"
            className="photo-pick-box"
            onClick={() => galleryRef.current?.click()}
            id={`${id}-gallery-btn`}
          >
            <Images size={26} color="var(--accent-green)" />
            <span style={{ fontWeight: 600, fontSize: 13 }}>Choose from Gallery</span>
            <small className="muted" style={{ fontSize: 11 }}>Camera roll & library</small>
          </button>
          <button
            type="button"
            className="photo-pick-box"
            onClick={() => cameraRef.current?.click()}
            id={`${id}-camera-btn`}
          >
            <Camera size={26} color="var(--accent-green)" />
            <span style={{ fontWeight: 600, fontSize: 13 }}>Take Photo</span>
            <small className="muted" style={{ fontSize: 11 }}>Open camera</small>
          </button>
        </div>
      )}

      {/* Camera capture input: forces camera */}
      <input
        ref={cameraRef}
        id={`${id}-camera`}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFile}
      />

      {/* Gallery file input: opens photo library without camera lock */}
      <input
        ref={galleryRef}
        id={`${id}-gallery`}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFile}
      />
    </div>
  );
};

/* ---------- Sharing Modal ---------- */

const ShareModal = ({
  title,
  subtitle,
  isShared,
  onToggleShared,
  shareText,
  onClose,
}: {
  title: string;
  subtitle: string;
  isShared: boolean;
  onToggleShared?: () => void;
  shareText: string;
  onClose: () => void;
}) => {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url: window.location.href,
        });
        return;
      } catch {
        // user dismissed share dialog
      }
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <Sheet title="Share" onClose={onClose}>
      <div className="share-sheet-body">
        <div className="share-preview-card">
          <h3 className="serif" style={{ fontSize: 18, marginBottom: 4 }}>{title}</h3>
          <p className="muted" style={{ fontSize: 13 }}>{subtitle}</p>
        </div>

        {/* Discover Map Toggle */}
        {onToggleShared && (
          <div className="share-toggle-card">
            <div className="share-toggle-info">
              <div className="share-toggle-title">
                <Globe size={18} color="var(--accent-green)" />
                <span>Share to Discover map</span>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                When enabled, this appears publicly on the community Discover map. When disabled, it remains private to your journal.
              </p>
            </div>
            <button
              className={`toggle-switch ${isShared ? 'active' : ''}`}
              onClick={onToggleShared}
              role="switch"
              aria-checked={isShared}
              aria-label="Toggle share to Discover"
            >
              <span className="toggle-thumb" />
            </button>
          </div>
        )}

        {/* Share via Link / Apps */}
        <div className="stack" style={{ marginTop: 16 }}>
          <button className="btn-primary" onClick={handleShare}>
            {copied ? <Check size={18} /> : ('share' in navigator ? <Share2 size={18} /> : <Copy size={18} />)}
            {copied ? 'Link Copied to Clipboard!' : ('share' in navigator ? 'Share with Anglers' : 'Copy Link to Share')}
          </button>
        </div>
      </div>
    </Sheet>
  );
};

/* ---------- Auth Modal ---------- */

const AuthModal = ({ onClose }: { onClose: () => void }) => {
  const { sessions, catches } = useStore();
  const [tab, setTab] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [saveLocallyOnly, setSaveLocallyOnly] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await authActions.signIn(email, password);
      if (res.success) {
        const user = authActions.getCurrentUser();
        if (user) {
          actions.setName(user.nickname || user.name || user.email.split('@')[0]);
          if (user.storageMode !== 'local') {
            fetchUserCloudData(user).then((data) => {
              if (data) {
                actions.replaceWithRemoteData(data.sessions, data.catches, data.subscription);
              }
            });
          }
        }
        onClose();
      } else {
        setMsg({ text: res.error || 'Failed to sign in', error: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const cleanNick = (nickname || '').trim() || email.split('@')[0];
      const res = await authActions.signUp(email, password, cleanNick, saveLocallyOnly);
      if (res.success) {
        actions.setName(cleanNick);
        const user = authActions.getCurrentUser();
        if (user && user.storageMode !== 'local') {
          syncUserWithCloud(user, sessions, catches).then((data) => {
            if (data) actions.mergeRemoteData(data.sessions, data.catches);
          });
        }
        onClose();
      } else {
        setMsg({ text: res.error || 'Failed to sign up', error: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await authActions.requestPasswordReset(email);
      if (res.success) {
        setResetSent(true);
        setResetCode('');
        setMsg({
          text: res.message || 'Verification code sent! Please check your email inbox for the 6-digit code.',
          error: false,
        });
      } else {
        setMsg({ text: res.error || 'Password reset request failed', error: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await authActions.confirmPasswordReset(email, resetCode, newPassword);
      if (res.success) {
        setMsg({ text: 'Password reset successfully! Signing you in...', error: false });
        const loginRes = await authActions.signIn(email, newPassword);
        if (loginRes.success) {
          setTimeout(() => {
            onClose();
          }, 800);
        } else {
          setTimeout(() => {
            setTab('signin');
            setResetSent(false);
          }, 1200);
        }
      } else {
        setMsg({ text: res.error || 'Invalid code or password', error: true });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet title={tab === 'signin' ? 'Sign In' : tab === 'signup' ? 'Create Account' : 'Reset Password'} onClose={onClose}>
      <div className="auth-tab-bar">
        <button className={`auth-tab ${tab === 'signin' ? 'active' : ''}`} onClick={() => { setTab('signin'); setMsg(null); }}>
          Sign In
        </button>
        <button className={`auth-tab ${tab === 'signup' ? 'active' : ''}`} onClick={() => { setTab('signup'); setMsg(null); }}>
          Sign Up
        </button>
        <button className={`auth-tab ${tab === 'reset' ? 'active' : ''}`} onClick={() => { setTab('reset'); setMsg(null); }}>
          Reset
        </button>
      </div>

      {msg && (
        <div className={`auth-message ${msg.error ? 'error' : 'success'}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>{msg.text}</div>
          {msg.error && (msg.text.includes('No account found') || msg.text.includes('no account found')) && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 13, padding: '6px 12px', marginTop: 4, alignSelf: 'flex-start' }}
              onClick={() => {
                setTab('signup');
                setMsg(null);
              }}
            >
              Create an account with this email →
            </button>
          )}
        </div>
      )}

      {tab === 'signin' && (
        <form onSubmit={handleSignIn} className="stack" style={{ gap: 12 }}>
          <label className="field">
            <span>Email</span>
            <input type="email" required autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" placeholder="angler@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
          <div style={{ textAlign: 'right', marginTop: -4 }}>
            <button type="button" className="link-button" onClick={() => { setTab('reset'); setMsg(null); }}>
              Forgot password?
            </button>
          </div>
          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => { authActions.setStorageMode('local'); onClose(); }}>
            <HardDrive size={16} /> Continue as Local Guest (No Cloud)
          </button>
        </form>
      )}

      {tab === 'signup' && (
        <form onSubmit={handleSignUp} className="stack" style={{ gap: 12 }}>
          <label className="field">
            <div className="row-between">
              <span>Public Angler Nickname</span>
              <span className="mini-badge private" style={{ fontSize: 10, padding: '2px 6px' }}>
                <Lock size={10} /> Real email hidden
              </span>
            </div>
            <input
              type="text"
              required
              placeholder="e.g. RiverRoamer, CarpHunter, LuneAngler"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <span className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              Only this nickname is shown on your profile, discover map, and shared catches. Your real personal email remains 100% private.
            </span>
          </label>

          <label className="field">
            <span>Email (Private Account Login)</span>
            <input type="email" required autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" placeholder="angler@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>

          {/* Option on sign up to save locally and not use cloud data */}
          <div className="local-opt-card">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={saveLocallyOnly}
                onChange={(e) => setSaveLocallyOnly(e.target.checked)}
              />
              <span className="checkbox-title">Save locally only (Do not use cloud data)</span>
            </label>
            <p className="muted" style={{ fontSize: 12, marginTop: 4, marginLeft: 24 }}>
              Keeps all catches, swim photos, and sessions strictly on this device without uploading to any remote cloud database.
            </p>
          </div>

          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Creating Account...' : (saveLocallyOnly ? 'Start Private Local Journal' : 'Create Cloud Account')}
          </button>
        </form>
      )}

      {tab === 'reset' && (
        <div>
          {!resetSent ? (
            <form onSubmit={handleRequestReset} className="stack" style={{ gap: 12 }}>
              <p className="muted" style={{ fontSize: 13 }}>
                Enter the email associated with your account. We'll send a secure 6-digit verification code to your inbox to reset your password.
              </p>
              <label className="field">
                <span>Email</span>
                <input type="email" required placeholder="angler@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
                <KeyRound size={16} /> Send Reset Code
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirmReset} className="stack" style={{ gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--accent-light)', borderRadius: 8, fontSize: 13, color: 'var(--text-primary)' }}>
                <Mail size={16} style={{ flexShrink: 0, color: 'var(--accent-green)' }} />
                <span>Check your inbox at <strong>{email}</strong> for your 6-digit verification code.</span>
              </div>
              <label className="field">
                <span>Reset Code (6 digits)</span>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="e.g. 123456"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
              <label className="field">
                <span>New Password</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  spellCheck={false}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </label>
              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
                Set New Password
              </button>
              <button
                type="button"
                className="link-button"
                style={{ textAlign: 'center', marginTop: 4, fontSize: 12 }}
                onClick={() => { setResetSent(false); setMsg(null); }}
              >
                Didn't receive the code? Request another
              </button>
            </form>
          )}
        </div>
      )}
    </Sheet>
  );
};

/* ---------- Start session ---------- */

const StartSessionSheet = ({
  initial,
  onClose,
  onStart,
}: {
  initial?: Venue;
  onClose: () => void;
  onStart: (v: Venue | 'current' | { id: string; name: string; type: string; lat: number; lon: number; targets: string[]; description: string }, photo?: string, isShared?: boolean) => void;
}) => {
  const nav = useNavigate();
  const [choice, setChoice] = useState<string>(initial?.id ?? 'current');
  const [customName, setCustomName] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [photo, setPhoto] = useState<string>();
  const [isShared, setIsShared] = useState<boolean>(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const filteredVenues = VENUES.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.type.toLowerCase().includes(search.toLowerCase()) ||
    v.targets.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  const handleStart = () => {
    if (choice === 'current') {
      onStart('current', photo, isShared);
    } else if (choice === 'custom') {
      const name = customName.trim() || search.trim() || 'Custom Swim';
      onStart({
        id: 'custom-' + Date.now(),
        name,
        type: 'Custom location',
        lat: VENUES[0].lat,
        lon: VENUES[0].lon,
        targets: ['Coarse fish'],
        description: 'Custom fishing location',
      }, photo, isShared);
    } else {
      const v = VENUES.find((x) => x.id === choice) ?? VENUES[0];
      onStart(v, photo, isShared);
    }
  };

  return (
    <Sheet
      title="Start a session"
      onClose={onClose}
      footer={
        <div className="stack" style={{ gap: 10 }}>
          <div className="toggle-row">
            <div className="toggle-label-wrap">
              <div className="toggle-label-title"><Globe size={16} /> Share to Discover map</div>
              <div className="muted" style={{ fontSize: 11 }}>Private by default · Only shared sessions appear on the map</div>
            </div>
            <button
              type="button"
              className={`toggle-switch ${isShared ? 'active' : ''}`}
              onClick={() => setIsShared(!isShared)}
              role="switch"
              aria-checked={isShared}
              aria-label="Share session on map"
            >
              <span className="toggle-thumb" />
            </button>
          </div>

          <button
            className="btn-primary"
            id="confirm-start-btn"
            style={{ height: 50 }}
            onClick={handleStart}
          >
            <Plus size={20} /> Start session
          </button>
        </div>
      }
    >
      {/* Venue search box */}
      <div className="venue-search-box">
        <Search size={18} color="var(--text-secondary)" />
        <input
          type="text"
          placeholder="Search or enter venue name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {search && (
          <button
            type="button"
            className="link-button"
            onClick={() => setSearch('')}
            style={{ padding: '0 4px', fontSize: 12 }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Compact swim photo picker with Gallery & Camera */}
      <div className="compact-photo-row" style={{ cursor: 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          {photo ? (
            <img src={photo} alt="Swim" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <Camera size={18} color="var(--accent-green)" style={{ flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {photo ? 'Swim photo attached' : 'Swim photo (optional)'}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              {photo ? 'Ready to log' : 'Camera or Gallery'}
            </div>
          </div>
        </div>

        <div className="compact-photo-btns">
          <button
            type="button"
            className="btn-photo-pill"
            id="start-session-gallery-btn"
            onClick={() => galleryInputRef.current?.click()}
            title="Upload from gallery"
          >
            <Images size={14} /> Gallery
          </button>
          <button
            type="button"
            className="btn-photo-pill"
            id="start-session-camera-btn"
            onClick={() => cameraInputRef.current?.click()}
            title="Take with camera"
          >
            <Camera size={14} /> Camera
          </button>
          {photo && (
            <button
              type="button"
              className="btn-photo-pill"
              style={{ color: 'var(--danger)', padding: '6px 8px' }}
              onClick={() => setPhoto(undefined)}
              title="Remove photo"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setPhoto(await resizeImage(f, 1024));
            e.target.value = '';
          }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setPhoto(await resizeImage(f, 1024));
            e.target.value = '';
          }}
        />
      </div>

      {/* Quick Find Fisheries Near Me shortcut */}
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          id="start-session-find-fisheries-btn"
          className="btn-secondary"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            height: 42,
            borderColor: 'var(--accent-green)',
            color: 'var(--accent-green)',
            background: 'var(--accent-light)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
          onClick={() => {
            onClose();
            nav('/fisheries');
          }}
        >
          <Compass size={16} />
          <span>Find Fisheries Near Me (60+ UK Venues)</span>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Venue choice list */}
      <div className="choice-list">
        {/* GPS location option */}
        <button
          id="venue-choice-current"
          className={`list-row ${choice === 'current' ? 'selected' : ''}`}
          onClick={() => { setChoice('current'); setCustomName(''); }}
        >
          <div className="list-icon"><LocateFixed size={18} /></div>
          <div className="catch-info">
            <div className="catch-species">My current location</div>
            <div className="catch-meta">Uses device GPS & logs live weather</div>
          </div>
        </button>

        {/* Custom venue option if user typed something not matching */}
        {search.trim().length > 0 && (
          <button
            id="venue-choice-custom"
            className={`list-row ${choice === 'custom' ? 'selected' : ''}`}
            onClick={() => { setChoice('custom'); setCustomName(search); }}
          >
            <div className="list-icon"><Plus size={18} /></div>
            <div className="catch-info">
              <div className="catch-species">Use "{search.trim()}"</div>
              <div className="catch-meta">Create custom fishing spot</div>
            </div>
          </button>
        )}

        {/* Preset venues */}
        {filteredVenues.map((v) => (
          <button
            key={v.id}
            id={`venue-choice-${v.id}`}
            className={`list-row ${choice === v.id ? 'selected' : ''}`}
            onClick={() => { setChoice(v.id); setCustomName(''); }}
          >
            <div className="list-icon"><MapPin size={18} /></div>
            <div className="catch-info">
              <div className="catch-species">{v.name}</div>
              <div className="catch-meta">{v.type} · {v.targets.join(', ')}</div>
            </div>
          </button>
        ))}
      </div>
    </Sheet>
  );
};

/* ---------- Pages ---------- */

const Home = ({ onStart }: { onStart: (v?: Venue) => void }) => {
  const { catches, sessions } = useStore();
  const { user } = useAuth();
  const [loggingForSession, setLoggingForSession] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const active = sessions.find((s) => !s.endedAt);

  // Unlogged-in or new users get the dedicated welcome landing page
  if (!user) {
    return (
      <div className="content">
        {/* Active Session Priority Card (if guest started one) */}
        {active && (
          <div className="card live-card" id="active-session-card" style={{ marginBottom: 20 }}>
            <div className="row-between" style={{ marginBottom: 4 }}>
              <div className="eyebrow" style={{ marginBottom: 0 }}>
                <span className="live-dot" /> Session in progress
              </div>
              <Link to={`/sessions/${active.id}`} className="view-all" style={{ fontSize: 13 }}>
                View session <ChevronRight size={14} />
              </Link>
            </div>
            <h2 className="serif" style={{ fontSize: 24, margin: '4px 0' }}>{active.venueName}</h2>
            <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Started {fmtTime(active.startedAt)}
              {active.weather ? ` · ${Math.round(active.weather.temperature)}° ${active.weather.description}` : ''}
            </div>
            <button
              className="btn-primary"
              id="home-log-catch-btn"
              style={{ width: '100%', height: 48 }}
              onClick={() => setLoggingForSession(active.id)}
            >
              <Fish size={18} /> Log a catch now
            </button>
          </div>
        )}

        {/* Welcome Hero with evocative imagery */}
        <div className="welcome-hero">
          <img src="/images/welcome-hero.jpg" alt="Tranquil misty lake at sunrise with carp rods and keepnet" />
          <div className="welcome-hero-overlay" />
          <div className="welcome-hero-content">
            <div className="welcome-badge">
              <Compass size={13} />
              <span>Modern Angling Journal & Live Map</span>
            </div>
            <h1 className="welcome-title serif">Every cast, every catch, every story.</h1>
            <p className="welcome-explainer">
              Keepnet is your personal angling companion. Record every catch with automatic live weather, log swim locations and personal bests, and explore shared community waters across the UK — with 100% privacy control.
            </p>
            <div className="welcome-actions">
              <button
                className="btn-primary"
                onClick={() => setAuthOpen(true)}
                id="welcome-get-started-btn"
              >
                <Sparkles size={16} /> Get Started Free
              </button>
              <Link to="/discover" className="btn-secondary" id="welcome-explore-map-btn">
                <MapPin size={16} /> Explore Live Map
              </Link>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onStart()}
                id="welcome-guest-btn"
                title="Start a quick session as a guest on this device"
              >
                <Plus size={16} /> Try as Guest
              </button>
            </div>
            <div className="welcome-pill-row">
              <span className="welcome-pill"><ShieldCheck size={14} style={{ color: '#4ade80' }} /> 100% Private Option</span>
              <span className="welcome-pill"><Cloud size={14} style={{ color: '#60a5fa' }} /> Live GPS Weather</span>
              <span className="welcome-pill"><Fish size={14} style={{ color: '#fbbf24' }} /> Community Swims</span>
              <span className="welcome-pill"><HardDrive size={14} style={{ color: '#c084fc' }} /> Works Offline</span>
            </div>
          </div>
        </div>

        {/* 4 Core Features Explainer Grid */}
        <div className="section-header" style={{ marginBottom: 14 }}>
          <h2 className="serif section-title" style={{ fontSize: 20 }}>Built for anglers by the water</h2>
        </div>

        <div className="welcome-grid">
          <div className="welcome-feature-card">
            <div className="welcome-feature-icon">
              <Thermometer size={22} />
            </div>
            <h3 className="welcome-feature-title">Automatic Live Weather</h3>
            <p className="welcome-feature-desc">
              Every time you start a session or log a fish, Keepnet records live atmospheric pressure, wind speed, wind direction, and temperature via GPS so you can correlate catches with conditions.
            </p>
          </div>

          <div className="welcome-feature-card">
            <div className="welcome-feature-icon">
              <ShieldCheck size={22} />
            </div>
            <h3 className="welcome-feature-title">Your Secret Spots Stay Private</h3>
            <p className="welcome-feature-desc">
              Keep your honey-holes and notes strictly to yourself on your device, or choose to share public catches using your angler nickname. Your real email and identity are never exposed.
            </p>
          </div>

          <div className="welcome-feature-card">
            <div className="welcome-feature-icon">
              <Camera size={22} />
            </div>
            <h3 className="welcome-feature-title">Photo Log & Personal Bests</h3>
            <p className="welcome-feature-desc">
              Snap photos directly on the bank or upload from your camera roll. Track exact weights in pounds and ounces, baits, rig notes, and monitor your personal bests per species.
            </p>
          </div>

          <div className="welcome-feature-card">
            <div className="welcome-feature-icon">
              <MapPin size={22} />
            </div>
            <h3 className="welcome-feature-title">Community Angler Map</h3>
            <p className="welcome-feature-desc">
              Explore public waters, swims, and catches shared by fellow community anglers in real time. See what species are biting near you.
            </p>
          </div>
        </div>

        {/* Bottom CTA Banner */}
        <div className="welcome-cta-banner">
          <h2 className="serif">Ready to start your fishing journal?</h2>
          <p>
            Create your free account to sync your journal across your devices, or jump straight in with an offline guest session.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
            <button
              className="btn-primary"
              style={{ background: '#fff', color: 'var(--accent-green)', fontWeight: 700 }}
              onClick={() => setAuthOpen(true)}
            >
              <User size={16} /> Create Free Account
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ borderColor: 'rgba(255,255,255,0.4)', color: '#fff' }}
              onClick={() => setAuthOpen(true)}
            >
              Sign In
            </button>
          </div>
        </div>

        {loggingForSession && (
          <AddCatchSheet sessionId={loggingForSession} onClose={() => setLoggingForSession(null)} />
        )}
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      </div>
    );
  }

  // Logged-in Angler Dashboard
  return (
    <div className="content">
      {/* Active Session Priority Card */}
      {active && (
        <div className="card live-card" id="active-session-card" style={{ marginBottom: 16 }}>
          <div className="row-between" style={{ marginBottom: 4 }}>
            <div className="eyebrow" style={{ marginBottom: 0 }}>
              <span className="live-dot" /> Session in progress
            </div>
            <Link to={`/sessions/${active.id}`} className="view-all" style={{ fontSize: 13 }}>
              View session <ChevronRight size={14} />
            </Link>
          </div>
          <h2 className="serif" style={{ fontSize: 24, margin: '4px 0' }}>{active.venueName}</h2>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Started {fmtTime(active.startedAt)}
            {active.weather ? ` · ${Math.round(active.weather.temperature)}° ${active.weather.description}` : ''}
          </div>
          <button
            className="btn-primary"
            id="home-log-catch-btn"
            style={{ width: '100%', height: 48 }}
            onClick={() => setLoggingForSession(active.id)}
          >
            <Fish size={18} /> Log a catch now
          </button>
        </div>
      )}

      {/* Compact Editorial Hero */}
      <div className="hero-compact">
        <img src="/images/welcome-hero.jpg" alt="Misty river at dawn" />
        <div className="hero-compact-overlay" />
        <div className="hero-compact-content">
          <h1 className="hero-title-compact serif">Time by the water.</h1>
          <p className="hero-subtitle-compact">Your personal fishing journal</p>
        </div>
      </div>

      <div className="desktop-grid-2">
        {/* Next / Quick Session Card */}
        {!active && (
          <div className="card">
            <div className="eyebrow">Start Fishing</div>
            <h2 className="serif" style={{ fontSize: 24, margin: '4px 0 8px' }}>Ready for your next session?</h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              Log your swim, capture live weather conditions via GPS, and record every catch.
            </p>
            <button className="btn-primary" id="start-session-btn" onClick={() => onStart()}>
              <Plus size={20} /> New Fishing Session
            </button>
          </div>
        )}

        {/* Recent Catches Card */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-header" style={{ marginBottom: 8 }}>
            <h2 className="serif section-title" style={{ margin: 0 }}>Recent catches</h2>
            {catches.length > 0 && (
              <Link to="/sessions?tab=catches" className="view-all">
                View all catches <ChevronRight size={16} />
              </Link>
            )}
          </div>
          {catches.length ? (
            catches.slice(0, 3).map((c) => <CatchRow key={c.id} c={c} />)
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 12px' }}>
              <Fish size={28} color="var(--text-secondary)" style={{ opacity: 0.5, marginBottom: 8 }} />
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>No catches logged yet</div>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>Start a session to log your first catch by the water.</p>
            </div>
          )}
        </div>
      </div>

      {loggingForSession && (
        <AddCatchSheet sessionId={loggingForSession} onClose={() => setLoggingForSession(null)} />
      )}
    </div>
  );
};

const Sessions = ({ onStart }: { onStart: () => void }) => {
  const { sessions, catches } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'catches' ? 'catches' : 'sessions';

  return (
    <div className="content">
      <div className="row-between" style={{ marginBottom: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Journal</h1>
        <button
          className="new-session-cta"
          id="new-session-btn"
          onClick={onStart}
          aria-label="New session"
        >
          <Plus size={18} />
          <span>New Session</span>
        </button>
      </div>

      {/* View switch: Sessions vs Catches */}
      <div className="auth-tab-bar" style={{ marginBottom: 16 }}>
        <button
          className={`auth-tab ${tab === 'sessions' ? 'active' : ''}`}
          onClick={() => setParams({})}
        >
          Sessions ({sessions.length})
        </button>
        <button
          className={`auth-tab ${tab === 'catches' ? 'active' : ''}`}
          onClick={() => setParams({ tab: 'catches' })}
        >
          All Catches ({catches.length})
        </button>
      </div>

      {tab === 'sessions' ? (
        sessions.length === 0 ? (
          <div className="card" style={{ padding: '36px 20px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-sunken)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Calendar size={26} color="var(--primary)" />
            </div>
            <h2 className="serif" style={{ fontSize: 20, marginBottom: 8 }}>No sessions yet</h2>
            <p className="muted" style={{ fontSize: 14, maxWidth: 320, margin: '0 auto 20px' }}>
              Start your first fishing session to log your swims, track weather automatically, and record your catches.
            </p>
            <button className="btn-primary" onClick={onStart} style={{ maxWidth: 220, margin: '0 auto' }}>
              <Plus size={18} /> Start a session
            </button>
          </div>
        ) : (
          sessions.map((s) => {
            const n = catches.filter((c) => c.sessionId === s.id).length;
            return (
              <Link key={s.id} to={`/sessions/${s.id}`} className="card card-link session-card" id={`session-${s.id}`}>
                {s.photo && <img src={s.photo} alt={`${s.venueName} swim`} className="session-thumb" loading="lazy" />}
                <div className="row-between">
                  <div>
                    <div className="eyebrow">
                      {!s.endedAt && <span className="live-dot" />}
                      {fmtDay(s.startedAt)} · {fmtTime(s.startedAt)}
                      {s.isShared ? (
                        <span className="mini-badge shared" style={{ marginLeft: 6 }}><Globe size={10} /> Shared</span>
                      ) : (
                        <span className="mini-badge private" style={{ marginLeft: 6 }}><Lock size={10} /> Private</span>
                      )}
                    </div>
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
          })
        )
      ) : (
        catches.length === 0 ? (
          <div className="card" style={{ padding: '36px 20px', textAlign: 'center' }}>
            <Fish size={32} color="var(--text-secondary)" style={{ opacity: 0.5, margin: '0 auto 12px' }} />
            <h2 className="serif" style={{ fontSize: 20, marginBottom: 8 }}>No catches recorded</h2>
            <p className="muted" style={{ fontSize: 14, maxWidth: 320, margin: '0 auto 20px' }}>
              Catches logged during your fishing sessions will appear here in your full catch history.
            </p>
            <button className="btn-primary" onClick={onStart} style={{ maxWidth: 220, margin: '0 auto' }}>
              <Plus size={18} /> Start a session
            </button>
          </div>
        ) : (
          <div className="card">
            {catches.map((c) => (
              <CatchRow key={c.id} c={c} />
            ))}
          </div>
        )
      )}
    </div>
  );
};

/* ---------- Species Tag Picker with Custom Entry ---------- */

const POPULAR_SPECIES = [
  'Carp', 'Pike', 'Perch', 'Chub', 'Roach', 'Bream', 'Tench',
  'Barbel', 'Brown trout', 'Rainbow trout', 'Grayling', 'Dace', 'Rudd'
];

let cachedSpeciesTags: string[] = POPULAR_SPECIES;

const SpeciesTagPicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (species: string) => void;
}) => {
  const [speciesList, setSpeciesList] = useState<string[]>(cachedSpeciesTags);

  useEffect(() => {
    let active = true;
    fetch('/api/species')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && Array.isArray(data.species) && data.species.length > 0) {
          cachedSpeciesTags = data.species;
          setSpeciesList(data.species);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const isPreset = speciesList.some((s) => s.toLowerCase() === (value || '').toLowerCase());
  const [customText, setCustomText] = useState(isPreset ? '' : value);

  const selectPreset = (s: string) => {
    setCustomText('');
    onChange(s);
  };

  const handleCustomChange = (text: string) => {
    setCustomText(text);
    onChange(text.trim() || 'Fish');
  };

  return (
    <div className="field">
      <div className="row-between" style={{ alignItems: 'baseline', marginBottom: 2 }}>
        <span>Species</span>
        {value ? (
          <span style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 600 }}>
            Selected: {value}
          </span>
        ) : null}
      </div>

      <div className="species-tag-grid" role="group" aria-label="Select fish species">
        {speciesList.map((s) => {
          const isSelected = !customText && value.toLowerCase() === s.toLowerCase();
          return (
            <button
              key={s}
              type="button"
              className={`species-tag ${isSelected ? 'selected' : ''}`}
              onClick={() => selectPreset(s)}
            >
              {s}
            </button>
          );
        })}
      </div>

      <div className="species-custom-wrap">
        <Fish size={16} className="species-custom-icon" />
        <input
          type="text"
          id="catch-species-custom"
          placeholder="Or type custom species (e.g. Barbel, Zander, Crucian, Catfish)..."
          value={customText}
          onChange={(e) => handleCustomChange(e.target.value)}
        />
      </div>
    </div>
  );
};

/* ---------- Weight Input with Imperial / Metric toggle ---------- */

const WeightInput = ({
  defaultUnit,
  initialLb = 0,
  initialOz = 0,
  onChange,
}: {
  defaultUnit: UnitSystem;
  initialLb?: number;
  initialOz?: number;
  onChange: (weights: { lb: number; oz: number }) => void;
}) => {
  const [unit, setUnit] = useState<UnitSystem>(defaultUnit);
  const [lb, setLb] = useState<number | ''>(initialLb || '');
  const [oz, setOz] = useState<number | ''>(initialOz || '');

  const initialMetric = imperialToMetric(initialLb, initialOz);
  const [kg, setKg] = useState<number | ''>(initialMetric.kg || '');
  const [g, setG] = useState<number | ''>(initialMetric.g || '');

  const updateImperial = (newLb: number | '', newOz: number | '') => {
    setLb(newLb);
    setOz(newOz);
    const validLb = typeof newLb === 'number' ? newLb : 0;
    const validOz = typeof newOz === 'number' ? newOz : 0;
    const m = imperialToMetric(validLb, validOz);
    setKg(m.kg || '');
    setG(m.g || '');
    onChange({ lb: validLb, oz: validOz });
  };

  const updateMetric = (newKg: number | '', newG: number | '') => {
    setKg(newKg);
    setG(newG);
    const validKg = typeof newKg === 'number' ? newKg : 0;
    const validG = typeof newG === 'number' ? newG : 0;
    const imp = metricToImperial(validKg, validG);
    setLb(imp.weightLb || '');
    setOz(Math.round(imp.weightOz) || '');
    onChange({ lb: imp.weightLb, oz: imp.weightOz });
  };

  const handleUnitSwitch = (targetUnit: UnitSystem) => {
    if (targetUnit === unit) return;
    setUnit(targetUnit);
    if (targetUnit === 'metric') {
      const validLb = typeof lb === 'number' ? lb : 0;
      const validOz = typeof oz === 'number' ? oz : 0;
      const m = imperialToMetric(validLb, validOz);
      setKg(m.kg || '');
      setG(m.g || '');
    } else {
      const validKg = typeof kg === 'number' ? kg : 0;
      const validG = typeof g === 'number' ? g : 0;
      const imp = metricToImperial(validKg, validG);
      setLb(imp.weightLb || '');
      setOz(Math.round(imp.weightOz) || '');
    }
  };

  return (
    <div className="weight-input-container">
      <div className="row-between" style={{ alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Weight</span>
        <div className="unit-pill-group" role="group" aria-label="Weight unit">
          <button
            type="button"
            className={`unit-pill-btn ${unit === 'imperial' ? 'selected' : ''}`}
            onClick={() => handleUnitSwitch('imperial')}
          >
            lb / oz
          </button>
          <button
            type="button"
            className={`unit-pill-btn ${unit === 'metric' ? 'selected' : ''}`}
            onClick={() => handleUnitSwitch('metric')}
          >
            kg / g
          </button>
        </div>
      </div>

      {unit === 'metric' ? (
        <div className="field-row">
          <label className="field">
            <span>Kilograms (kg)</span>
            <input
              id="catch-kg"
              type="number"
              min={0}
              step="any"
              value={kg}
              placeholder="0"
              onChange={(e) => {
                const val = e.target.value;
                if (val.includes('.') && parseFloat(val) >= 0) {
                  const totalKg = parseFloat(val);
                  const k = Math.floor(totalKg);
                  const grams = Math.round((totalKg - k) * 1000);
                  updateMetric(k, grams);
                } else {
                  updateMetric(val === '' ? '' : Math.max(0, parseInt(val, 10) || 0), g);
                }
              }}
            />
          </label>
          <label className="field">
            <span>Grams (g)</span>
            <input
              id="catch-g"
              type="number"
              min={0}
              max={999}
              step={10}
              value={g}
              placeholder="0"
              onChange={(e) => {
                const val = e.target.value;
                updateMetric(kg, val === '' ? '' : Math.min(999, Math.max(0, parseInt(val, 10) || 0)));
              }}
            />
          </label>
        </div>
      ) : (
        <div className="field-row">
          <label className="field">
            <span>Pounds (lb)</span>
            <input
              id="catch-lb"
              type="number"
              min={0}
              value={lb}
              placeholder="0"
              onChange={(e) => {
                const val = e.target.value;
                updateImperial(val === '' ? '' : Math.max(0, parseInt(val, 10) || 0), oz);
              }}
            />
          </label>
          <label className="field">
            <span>Ounces (oz)</span>
            <input
              id="catch-oz"
              type="number"
              min={0}
              max={15}
              value={oz}
              placeholder="0"
              onChange={(e) => {
                const val = e.target.value;
                updateImperial(lb, val === '' ? '' : Math.min(15, Math.max(0, parseInt(val, 10) || 0)));
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
};

const AddCatchSheet = ({ sessionId, onClose }: { sessionId: string; onClose: () => void }) => {
  const { unitSystem = 'imperial' } = useStore();
  const isPremiumActive = usePremiumMembership();
  const [species, setSpecies] = useState(POPULAR_SPECIES[0]);
  const [weight, setWeight] = useState({ lb: 0, oz: 0 });
  const [bait, setBait] = useState('');
  const [notes, setNotes] = useState('');
  const [image, setImage] = useState<string>();
  const [isShared, setIsShared] = useState<boolean>(true);
  const [isConfidential, setIsConfidential] = useState<boolean>(false);

  return (
    <Sheet
      title="Log a catch"
      onClose={onClose}
      footer={
        <button
          className="btn-primary"
          id="save-catch-btn"
          style={{ height: 50 }}
          onClick={() => {
            actions.addCatch({
              sessionId,
              species: species.trim() || 'Fish',
              weightLb: weight.lb,
              weightOz: weight.oz,
              bait: bait || 'Unknown',
              notes,
              image,
              isShared,
              isConfidential,
              caughtAt: new Date().toISOString(),
            });
            onClose();
          }}
        >
          <Plus size={20} /> Save catch
        </button>
      }
    >
      <PhotoPicker id="catch-photo" value={image} onChange={setImage} label="Photo of your catch" />
      <SpeciesTagPicker value={species} onChange={setSpecies} />
      <WeightInput defaultUnit={unitSystem} onChange={setWeight} />
      <label className="field"><span>Bait</span><input id="catch-bait" placeholder="e.g. Worm, Bread, Maggot" value={bait} onChange={(e) => setBait(e.target.value)} /></label>
      <label className="field"><span>Notes</span><textarea id="catch-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>

      {/* Share to Discover toggle */}
      <div className="toggle-row" style={{ marginTop: 8, marginBottom: 8 }}>
        <div className="toggle-label-wrap">
          <div className="toggle-label-title"><Globe size={16} /> Share catch to Discover map</div>
          <div className="muted" style={{ fontSize: 11 }}>Feature this catch on the public venue page</div>
        </div>
        <button
          type="button"
          className={`toggle-switch ${isShared ? 'active' : ''}`}
          onClick={() => setIsShared(!isShared)}
          role="switch"
          aria-checked={isShared}
          aria-label="Share catch on map"
        >
          <span className="toggle-thumb" />
        </button>
      </div>

      {/* Syndicate / Secret Water Privacy toggle (Keepnet Premium) */}
      <div className="toggle-row" style={{ marginTop: 8, marginBottom: 8 }}>
        <div className="toggle-label-wrap">
          <div className="toggle-label-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <EyeOff size={16} color="var(--copper, #C9772B)" />
            <span>Syndicate / Secret Swim Privacy</span>
            {!isPremiumActive && (
              <Link to="/subscription" style={{ textDecoration: 'none' }}>
                <span className="count-pill" style={{ fontSize: 10, background: 'rgba(201, 119, 43, 0.15)', color: 'var(--copper, #C9772B)' }}>
                  Premium Trial
                </span>
              </Link>
            )}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {isPremiumActive
              ? 'Protects secret waters: displays as "Confidential Syndicate Water" on public feeds.'
              : 'Unlock confidential syndicate swim privacy on shared catches with Keepnet Premium.'}
          </div>
        </div>
        <button
          type="button"
          className={`toggle-switch ${isConfidential ? 'active' : ''}`}
          onClick={() => {
            if (isPremiumActive) {
              setIsConfidential(!isConfidential);
            } else {
              window.location.hash = '#/subscription';
            }
          }}
          role="switch"
          aria-checked={isConfidential}
          aria-label="Toggle syndicate privacy"
        >
          <span className="toggle-thumb" />
        </button>
      </div>
    </Sheet>
  );
};

/* ---------- Edit Catch Sheet ---------- */

const EditCatchSheet = ({ c, onClose }: { c: Catch; onClose: () => void }) => {
  const { unitSystem = 'imperial' } = useStore();
  const isPremiumActive = usePremiumMembership();
  const [species, setSpecies] = useState(c.species);
  const [weight, setWeight] = useState({ lb: c.weightLb, oz: c.weightOz });
  const [bait, setBait] = useState(c.bait);
  const [notes, setNotes] = useState(c.notes ?? '');
  const [image, setImage] = useState<string | undefined>(c.image);
  const [isShared, setIsShared] = useState<boolean>(!!c.isShared);
  const [isConfidential, setIsConfidential] = useState<boolean>(!!c.isConfidential);

  const handleSave = () => {
    actions.updateCatch(c.id, {
      species: species.trim() || 'Fish',
      weightLb: weight.lb,
      weightOz: weight.oz,
      bait: bait || 'Unknown',
      notes,
      image,
      isShared,
      isConfidential,
    });
    onClose();
  };

  return (
    <Sheet
      title="Edit catch"
      onClose={onClose}
      footer={
        <button className="btn-primary" id="save-edit-catch-btn" onClick={handleSave} style={{ height: 50 }}>
          <Check size={18} /> Save changes
        </button>
      }
    >
      <PhotoPicker id="edit-catch-photo" value={image} onChange={setImage} label="Change catch photo" />
      <SpeciesTagPicker value={species} onChange={setSpecies} />
      <WeightInput
        defaultUnit={unitSystem}
        initialLb={c.weightLb}
        initialOz={c.weightOz}
        onChange={setWeight}
      />
      <label className="field">
        <span>Bait</span>
        <input placeholder="e.g. Worm, Bread, Maggot" value={bait} onChange={(e) => setBait(e.target.value)} />
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="toggle-row" style={{ marginTop: 8, marginBottom: 8 }}>
        <div className="toggle-label-wrap">
          <div className="toggle-label-title"><Globe size={16} /> Share catch to Discover map</div>
          <div className="muted" style={{ fontSize: 11 }}>Feature this catch on the public venue page</div>
        </div>
        <button
          type="button"
          className={`toggle-switch ${isShared ? 'active' : ''}`}
          onClick={() => setIsShared(!isShared)}
          role="switch"
          aria-checked={isShared}
          aria-label="Share catch on map"
        >
          <span className="toggle-thumb" />
        </button>
      </div>

      {/* Syndicate / Secret Water Privacy toggle (Keepnet Premium) */}
      <div className="toggle-row" style={{ marginTop: 8, marginBottom: 8 }}>
        <div className="toggle-label-wrap">
          <div className="toggle-label-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <EyeOff size={16} color="var(--copper, #C9772B)" />
            <span>Syndicate / Secret Swim Privacy</span>
            {!isPremiumActive && (
              <Link to="/subscription" style={{ textDecoration: 'none' }}>
                <span className="count-pill" style={{ fontSize: 10, background: 'rgba(201, 119, 43, 0.15)', color: 'var(--copper, #C9772B)' }}>
                  Premium Trial
                </span>
              </Link>
            )}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {isPremiumActive
              ? 'Protects secret waters: displays as "Confidential Syndicate Water" on public feeds.'
              : 'Unlock confidential syndicate swim privacy on shared catches with Keepnet Premium.'}
          </div>
        </div>
        <button
          type="button"
          className={`toggle-switch ${isConfidential ? 'active' : ''}`}
          onClick={() => {
            if (isPremiumActive) {
              setIsConfidential(!isConfidential);
            } else {
              window.location.hash = '#/subscription';
            }
          }}
          role="switch"
          aria-checked={isConfidential}
          aria-label="Toggle syndicate privacy"
        >
          <span className="toggle-thumb" />
        </button>
      </div>
    </Sheet>
  );
};

const SessionDetail = () => {
  const { id } = useParams();
  const { sessions, catches } = useStore();
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const sessionCameraRef = useRef<HTMLInputElement>(null);
  const sessionGalleryRef = useRef<HTMLInputElement>(null);
  const s = sessions.find((x) => x.id === id);
  if (!s) return <Navigate to="/sessions" replace />;
  const list = catches.filter((c) => c.sessionId === s.id);
  const live = !s.endedAt;
  const gallery = [...new Set([...(s.photos ?? []), ...(s.photo ? [s.photo] : []), ...list.flatMap((c) => (c.image ? [c.image] : []))])];

  return (
    <div className="content">
      <Link to="/sessions" className="back-link"><ArrowLeft size={18} /> Sessions</Link>

      <div className="row-between" style={{ alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div className="eyebrow">{live && <span className="live-dot" />}{live ? 'In progress' : fmtDay(s.startedAt)}</div>
          <h1 className="page-title">{s.venueName}</h1>
          <p className="page-subtitle" style={{ marginBottom: 6 }}><Clock size={14} style={{ verticalAlign: -2 }} /> {fmtTime(s.startedAt)}{s.endedAt ? ` – ${fmtTime(s.endedAt)}` : ' – now'}</p>
          <div className="tag-row" style={{ marginBottom: 12 }}>
            {s.isShared ? (
              <button className="tag status-pill shared" onClick={() => setSharing(true)}>
                <Globe size={12} /> Shared on Discover
              </button>
            ) : (
              <button className="tag status-pill private" onClick={() => setSharing(true)}>
                <Lock size={12} /> Private Journal
              </button>
            )}
          </div>
        </div>
        <button className="icon-btn" id="share-session-btn" onClick={() => setSharing(true)} aria-label="Share session">
          <Share2 size={18} />
        </button>
      </div>

      <div className={`session-photo ${s.photo ? '' : 'empty'}`}>
        {s.photo ? <img src={s.photo} alt={`${s.venueName} swim`} /> : <><Camera size={26} /><span>Add a photo of your swim</span></>}
        <div className="photo-actions">
          {gallery.length > 1 || (gallery.length === 1 && gallery[0] !== s.photo) ? (
            <button className="photo-change static" id="change-cover-btn" onClick={() => setPicking(true)}><Images size={14} /> Change cover</button>
          ) : null}
          <button
            type="button"
            className="photo-change static"
            id="session-photo-gallery-btn"
            onClick={() => sessionGalleryRef.current?.click()}
          >
            <Images size={14} /> Gallery
          </button>
          <button
            type="button"
            className="photo-change static"
            id="session-photo-camera-btn"
            onClick={() => sessionCameraRef.current?.click()}
          >
            <Camera size={14} /> Camera
          </button>
        </div>
        <input
          ref={sessionCameraRef}
          id="session-photo-camera"
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) actions.addSessionPhoto(s.id, await resizeImage(f, 1024));
            e.target.value = '';
          }}
        />
        <input
          ref={sessionGalleryRef}
          id="session-photo-gallery"
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) actions.addSessionPhoto(s.id, await resizeImage(f, 1024));
            e.target.value = '';
          }}
        />
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

      {sharing && (
        <ShareModal
          title={s.venueName}
          subtitle={`Session · ${fmtDay(s.startedAt)} · ${list.length} ${list.length === 1 ? 'catch' : 'catches'}`}
          isShared={!!s.isShared}
          onToggleShared={() => actions.toggleSessionShare(s.id)}
          shareText={`Fishing session at ${s.venueName} logged with Keepnet! ${list.length} fish caught.`}
          onClose={() => setSharing(false)}
        />
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
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [remoteCatches, setRemoteCatches] = useState<Catch[]>([]);
  const [remoteSessions, setRemoteSessions] = useState<Session[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [likeBounce, setLikeBounce] = useState(false);

  // If catch is not in local journal, fetch from public shared catches
  useEffect(() => {
    if (!catches.some((x) => x.id === id)) {
      setLoadingRemote(true);
      fetchPublicSharedData()
        .then((data) => {
          if (data.catches.length > 0) setRemoteCatches(data.catches);
          if (data.sessions.length > 0) setRemoteSessions(data.sessions);
        })
        .finally(() => setLoadingRemote(false));
    }
  }, [id, catches]);

  // Sample data fallback for featured community catches
  const sampleMap: Record<string, Catch> = {
    'sample-pike-1': {
      id: 'sample-pike-1',
      sessionId: 'sample-sess-wyreside',
      species: 'Pike',
      weightLb: 11,
      weightOz: 7,
      caughtAt: '2026-10-04T16:51:00Z',
      bait: 'Salmo slider lure',
      method: 'Lure fishing',
      notes: 'Cracking pike from this afternoon on the slider. Slow day until this one smashed it on the drop near the reeds. Unreal fight! 🎣',
      image: '/images/catch-pike-1.jpg',
      images: [
        '/images/catch-pike-1.jpg',
        '/images/catch-sophie-pike.jpg',
        '/images/catch-carp-linear.jpg',
        '/images/challenge-pike.jpg',
      ],
      isShared: true,
      userName: 'Aran',
      likesCount: 42,
    },
    'sample-pike-2': {
      id: 'sample-pike-2',
      sessionId: 'sample-sess-ribble',
      species: 'Pike',
      weightLb: 4,
      weightOz: 0,
      caughtAt: '2026-10-03T14:30:00Z',
      bait: 'Smelt',
      method: 'Deadbaiting',
      notes: 'First decent pike on the new setup! 🙌 Such a beautiful fish, released safely.',
      image: '/images/catch-sophie-pike.jpg',
      images: [
        '/images/catch-sophie-pike.jpg',
        '/images/catch-pike-1.jpg',
        '/images/challenge-pike.jpg',
      ],
      isShared: true,
      userName: 'SophieT',
      likesCount: 68,
    },
    'sample-carp-1': {
      id: 'sample-carp-1',
      sessionId: 'sample-sess-linear',
      species: 'Common Carp',
      weightLb: 28,
      weightOz: 6,
      caughtAt: '2026-10-02T07:15:00Z',
      bait: '15mm Mainline Cell',
      method: 'Boilie on Ronnie Rig',
      notes: 'Autumn campaign off to a flyer! 28lb 6oz on the margins just as the mist cleared.',
      image: '/images/catch-carp-linear.jpg',
      images: [
        '/images/catch-carp-linear.jpg',
        '/images/chub.jpg',
        '/images/perch.jpg',
      ],
      isShared: true,
      userName: 'CarpDan',
      likesCount: 98,
    },
  };

  const sampleSessionMap: Record<string, Session> = {
    'sample-sess-wyreside': {
      id: 'sample-sess-wyreside',
      venueId: 'wyreside-lakes',
      venueName: 'Wyreside, Lancashire',
      lat: 53.97,
      lon: -2.78,
      startedAt: '2026-10-04T10:02:00Z',
      photo: '/images/community-hero.jpg',
      isShared: true,
      userName: 'Aran',
      weather: {
        temperature: 11,
        feelsLike: 10,
        description: 'Overcast & calm',
        windSpeed: 6,
        windDirection: 180,
        humidity: 82,
        precipitation: 0,
        pressure: 1018,
        cloudCover: 75,
        code: 3,
        source: 'open-meteo',
        fetchedAt: '2026-10-04T10:02:00Z',
      },
    },
    'sample-sess-ribble': {
      id: 'sample-sess-ribble',
      venueId: 'river-ribble',
      venueName: 'River Ribble, Lancashire',
      lat: 53.8,
      lon: -2.7,
      startedAt: '2026-10-03T11:00:00Z',
      photo: '/images/hero-river.jpg',
      isShared: true,
      userName: 'SophieT',
      weather: {
        temperature: 9,
        feelsLike: 8,
        description: 'Slight drizzle',
        windSpeed: 8,
        windDirection: 210,
        humidity: 88,
        precipitation: 0.2,
        pressure: 1012,
        cloudCover: 90,
        code: 51,
        source: 'open-meteo',
        fetchedAt: '2026-10-03T11:00:00Z',
      },
    },
    'sample-sess-linear': {
      id: 'sample-sess-linear',
      venueId: 'linear-fisheries',
      venueName: 'Linear Fisheries · St Johns',
      lat: 51.76,
      lon: -1.41,
      startedAt: '2026-10-02T06:00:00Z',
      photo: '/images/welcome-hero.jpg',
      isShared: true,
      userName: 'CarpDan',
      weather: {
        temperature: 12,
        feelsLike: 11,
        description: 'Misty dawn',
        windSpeed: 4,
        windDirection: 140,
        humidity: 92,
        precipitation: 0,
        pressure: 1021,
        cloudCover: 40,
        code: 45,
        source: 'open-meteo',
        fetchedAt: '2026-10-02T06:00:00Z',
      },
    },
  };

  const c = catches.find((x) => x.id === id) || remoteCatches.find((x) => x.id === id) || (id ? sampleMap[id] : undefined);
  const isOwner = catches.some((x) => x.id === id);

  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 36) {
      if (diff > 0) {
        // Swiped left -> next photo
        setActivePhotoIdx((prev) => (prev + 1) % displayImages.length);
      } else {
        // Swiped right -> prev photo
        setActivePhotoIdx((prev) => (prev === 0 ? displayImages.length - 1 : prev - 1));
      }
    }
    setTouchStartX(null);
  };

  const displayImages = useMemo(() => {
    if (!c) return ['/images/catch-pike-1.jpg'];
    const list: string[] = [];
    if (c.image) list.push(c.image);
    if (c.images && c.images.length > 0) {
      c.images.forEach((img: string) => {
        if (!list.includes(img)) list.push(img);
      });
    }
    if (list.length === 0) list.push('/images/catch-pike-1.jpg');
    return list;
  }, [c]);

  if (!c) {
    if (loadingRemote) {
      return (
        <div className="content">
          <div className="row-between">
            <button className="back-link" onClick={() => nav(-1)}><ArrowLeft size={18} /> Back</button>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px', color: 'var(--accent-green)' }} />
            <p className="muted">Loading catch report...</p>
          </div>
        </div>
      );
    }
    return <Navigate to="/" replace />;
  }

  const s = sessions.find((x) => x.id === c.sessionId) || remoteSessions.find((x) => x.id === c.sessionId) || (c.sessionId ? sampleSessionMap[c.sessionId] : undefined);
  const isLiked = actions.isCatchLiked(c.id);
  const likesCount = actions.getCatchLikesCount(c.id, c.likesCount);

  return (
    <div className="content catch-detail-page" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      {/* Header bar (Mobile Screen 2) */}
      <div className="row-between catch-detail-header">
        <div className="catch-detail-heading">
          <button className="icon-btn" onClick={() => nav(-1)} aria-label="Go back"><ArrowLeft size={21} /></button>
          <span className="serif">Catch Details</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isOwner && (
            <button className="icon-btn" id="edit-catch-icon-btn" onClick={() => setEditing(true)} aria-label="Edit catch" title="Edit catch">
              <Pencil size={17} />
            </button>
          )}
          <button className="icon-btn" id="share-catch-btn" onClick={() => setSharing(true)} aria-label="Share catch" title="Share catch">
            <Share2 size={17} />
          </button>
          <button className="icon-btn" aria-label="More options" title="Options">
            <MoreHorizontal size={17} />
          </button>
        </div>
      </div>

      {/* Main Catch Photo & Carousel with Touch-Swipe (Mobile Screen 2) */}
      <div
        className="social-card-media-wrap"
        style={{ borderRadius: 14 }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={displayImages[activePhotoIdx] || displayImages[0]}
          alt={c.species}
          className="social-card-img"
          style={{ height: 260 }}
        />
        <div className="carousel-counter-badge">
          {activePhotoIdx + 1}/{displayImages.length}
        </div>
        {displayImages.length > 1 && (
          <>
            <button
              type="button"
              className="carousel-nav-btn prev"
              onClick={() => setActivePhotoIdx((prev) => (prev === 0 ? displayImages.length - 1 : prev - 1))}
              aria-label="Previous photo"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="carousel-nav-btn next"
              onClick={() => setActivePhotoIdx((prev) => (prev + 1) % displayImages.length)}
              aria-label="Next photo"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>

      {/* 4 Thumbnails Row (Mobile Screen 2) */}
      {displayImages.length > 1 && (
        <div className="detail-thumbs-row">
          {displayImages.map((img, idx) => (
            <button
              key={idx}
              type="button"
              className={`detail-thumb-btn ${activePhotoIdx === idx ? 'active' : ''}`}
              onClick={() => setActivePhotoIdx(idx)}
              aria-label={`Select photo ${idx + 1}`}
            >
              <img src={img} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {/* Title, Green Weight & Shared Badge (Mobile Screen 2) */}
      <div className="row-between" style={{ alignItems: 'flex-start', marginTop: 6 }}>
        <div>
          <h1 className="page-title" style={{ margin: '0 0 2px', fontSize: 24 }}>{c.species}</h1>
          <div className="catch-weight-green">
            {fmtWeight(c)}
          </div>
        </div>
        <div style={{ marginTop: 2 }}>
          {c.isShared ? (
            <span
              className="mini-badge"
              style={{
                background: 'rgba(46, 184, 114, 0.15)',
                color: '#2EB872',
                borderColor: 'rgba(46, 184, 114, 0.35)',
                padding: '4px 10px',
                fontSize: 11,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Globe size={11} /> Shared
            </span>
          ) : (
            <span className="mini-badge private" style={{ padding: '4px 10px', fontSize: 11 }}>
              <Lock size={11} /> Private
            </span>
          )}
        </div>
      </div>

      {/* Angler Attribution Row (Mobile Screen 2) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 12px' }}>
        <img
          src={c.id === 'sample-pike-2' ? '/images/catch-sophie-pike.jpg' : c.id === 'sample-carp-1' ? '/images/avatar-tom.jpg' : '/images/avatar-aran.jpg'}
          alt={c.userName || 'Angler'}
          style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }}
        />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{c.userName || s?.userName || 'Keepnet Angler'}</span>
            <CheckCircle2 size={13} fill="#2EB872" color="#fff" />
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {fmtDay(c.caughtAt)} {c.caughtAt ? `· ${fmtTime(c.caughtAt)}` : ''} · 📍 {s?.venueName || 'UK Waters'}
          </div>
        </div>
      </div>

      {/* Narrative Caption */}
      {c.notes && (
        <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-primary)', margin: '8px 0 14px' }}>
          {c.notes}
        </p>
      )}

      {/* Tactical Attribute Tiles Grid (Mobile Screen 2) */}
      <div className="tactical-grid-2x2">
        <div className="tactical-cell">
          <div className="tactical-cell-icon"><Fish size={22} strokeWidth={1.6} aria-hidden="true" /></div>
          <div className="tactical-cell-info">
            <span className="tactical-cell-val">{c.bait || 'Natural bait'}</span>
            <span className="tactical-cell-lbl">Bait</span>
          </div>
        </div>

        <div className="tactical-cell">
          <div className="tactical-cell-icon"><Waves size={22} strokeWidth={1.6} aria-hidden="true" /></div>
          <div className="tactical-cell-info">
            <span className="tactical-cell-val">{s?.venueName || 'Wyreside'}</span>
            <span className="tactical-cell-lbl">Water</span>
          </div>
        </div>
      </div>

      <div className="tactical-grid-3x1">
        <div className="tactical-cell">
          <div className="tactical-cell-icon temperature-icon"><Thermometer size={22} strokeWidth={1.6} aria-hidden="true" /></div>
          <div className="tactical-cell-info">
            <span className="tactical-cell-val">{s?.weather ? `${Math.round(s.weather.temperature)}°C` : '11°C'}</span>
            <span className="tactical-cell-lbl">Conditions</span>
          </div>
        </div>

        <div className="tactical-cell">
          <div className="tactical-cell-icon"><Waves size={22} strokeWidth={1.6} aria-hidden="true" /></div>
          <div className="tactical-cell-info">
            <span className="tactical-cell-val">Clear water</span>
            <span className="tactical-cell-lbl">Water clarity</span>
          </div>
        </div>

        <div className="tactical-cell">
          <div className="tactical-cell-icon"><LocateFixed size={22} strokeWidth={1.6} aria-hidden="true" /></div>
          <div className="tactical-cell-info">
            <span className="tactical-cell-val">{c.method || 'Lure fishing'}</span>
            <span className="tactical-cell-lbl">Method</span>
          </div>
        </div>
      </div>

      {/* Social Actions Bar (Mobile Screen 2) */}
      <div className="social-actions-bar" style={{ margin: '14px 0 6px' }}>
        <div className="social-action-btn-group">
          <button
            type="button"
            className={`social-action-btn ${isLiked ? 'liked' : ''} ${likeBounce ? 'heart-bounce' : ''}`}
            onClick={() => {
              actions.toggleCatchLike(c.id);
              setLikeBounce(true);
              setTimeout(() => setLikeBounce(false), 500);
            }}
          >
            <Heart size={18} fill={isLiked ? '#ef4444' : 'none'} color={isLiked ? '#ef4444' : 'currentColor'} />
            <span>{likesCount}</span>
          </button>

          <button
            type="button"
            className="social-action-btn"
            onClick={() => {
              const el = document.getElementById('comments-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <MessageSquare size={17} />
            <span>8</span>
          </button>

          <button
            type="button"
            className="social-action-btn"
            onClick={() => setSharing(true)}
          >
            <Share2 size={16} />
            <span>Share</span>
          </button>

          <button
            type="button"
            className="social-action-btn"
            onClick={() => alert('Catch saved to your journal!')}
          >
            <Bookmark size={16} />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Liked by Avatar Stack (Mobile Screen 2) */}
      <div className="liked-by-stack">
        <div className="liked-by-avatars">
          <img src="/images/avatar-tom.jpg" alt="" className="liked-by-avatar-img" />
          <img src="/images/catch-sophie-pike.jpg" alt="" className="liked-by-avatar-img" />
          <img src="/images/avatar-ellie.jpg" alt="" className="liked-by-avatar-img" />
          <img src="/images/avatar-aran.jpg" alt="" className="liked-by-avatar-img" />
        </div>
        <span>Liked by <strong>TomL</strong>, <strong>SophieT</strong> and {likesCount > 2 ? likesCount - 2 : 40} others</span>
      </div>

      {/* Associated Session Card (Mobile Screen 2) */}
      {s && (
        <Link to={`/sessions/${s.id}`} className="detail-session-card">
          <img
            src={s.photo || '/images/community-hero.jpg'}
            alt={s.venueName}
            className="detail-session-thumb"
            loading="lazy"
          />
          <div className="detail-session-info">
            <span className="detail-session-label"><Calendar size={12} /> Session</span>
            <div className="detail-session-venue">{s.venueName}</div>
            <div className="detail-session-date">{fmtDay(s.startedAt)} · {fmtTime(s.startedAt)}</div>
          </div>
          <ChevronRight size={18} color="var(--text-secondary)" />
        </Link>
      )}

      {/* Weather Summary (if logged) */}
      {s?.weather && <WeatherSummary weather={s.weather} />}

      {/* Interactive Comments & Discussions Section (Mobile Screen 3) */}
      <div id="comments-section" style={{ marginTop: 14 }}>
        <CatchComments catchId={c.id} isSharedCatch={!!c.isShared} catchSpecies={c.species} />
      </div>

      {/* Similar Catches Carousel (Mobile Screen 3) */}
      <div style={{ marginTop: 22 }}>
        <div className="row-between" style={{ alignItems: 'baseline', marginBottom: 10 }}>
          <h3 className="serif" style={{ margin: 0, fontSize: 16 }}>Similar Catches</h3>
          <Link to="/discover" className="sidebar-widget-link">View all →</Link>
        </div>
        <div className="similar-catches-grid">
          <Link to="/catches/sample-pike-1" className="similar-catch-card">
            <img src="/images/catch-pike-1.jpg" alt="Pike" loading="lazy" />
            <div className="similar-catch-card-body">
              <div className="similar-catch-card-title">
                <span>Pike · 2 lb 8 oz</span>
                <span style={{ color: '#ef4444', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Heart size={10} fill="#ef4444" /> 124
                </span>
              </div>
              <div className="similar-catch-card-meta">TomL · River Ribble</div>
            </div>
          </Link>

          <Link to="/catches/sample-pike-2" className="similar-catch-card">
            <img src="/images/challenge-pike.jpg" alt="Pike" loading="lazy" />
            <div className="similar-catch-card-body">
              <div className="similar-catch-card-title">
                <span>Pike · 3 lb 4 oz</span>
                <span style={{ color: '#ef4444', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Heart size={10} fill="#ef4444" /> 88
                </span>
              </div>
              <div className="similar-catch-card-meta">Dan.Carp · Linear Fisheries</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Community Challenge Banner (Mobile Screen 3) */}
      <div className="card catch-challenge-card" style={{ marginTop: 20, padding: 16, border: '1px solid rgba(46, 184, 114, 0.3)' }}>
        <div className="row-between" style={{ alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--copper)' }}>
            <Trophy size={16} />
            <strong style={{ fontSize: 13 }}>Pike Season Challenge</strong>
          </div>
          <span className="count-pill" style={{ fontSize: 10 }}>Ends in 12 days</span>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 12px', lineHeight: 1.45 }}>
          Log your best pike this month for a chance to win Keepnet gear and be featured!
        </p>
        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', height: 38, fontSize: 13 }}
          onClick={() => nav('/sessions')}
        >
          Join Challenge →
        </button>
      </div>

      {/* Sticky Bottom Action Bar (Mobile Screen 2) */}
      <div className="sticky-catch-footer">
        <button
          type="button"
          className={`btn-sticky-action like-btn ${isLiked ? 'liked' : ''}`}
          onClick={() => actions.toggleCatchLike(c.id)}
        >
          <Heart size={16} fill={isLiked ? '#ef4444' : 'none'} color={isLiked ? '#ef4444' : 'currentColor'} />
          <span>{isLiked ? 'Liked' : 'Like'}</span>
        </button>

        <button
          type="button"
          className="btn-sticky-action comment-btn"
          onClick={() => {
            const el = document.getElementById('comments-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <MessageSquare size={16} />
          <span>Comment</span>
        </button>
      </div>

      {sharing && (
        <ShareModal
          title={`${c.species} (${fmtWeight(c)})`}
          subtitle={`Caught on ${c.bait}${s ? ` at ${s.venueName}` : ''}`}
          isShared={!!c.isShared}
          onToggleShared={isOwner ? () => actions.toggleCatchShare(c.id) : undefined}
          shareText={`🎣 Check out this ${fmtWeight(c)} ${c.species} on Keepnet!`}
          onClose={() => setSharing(false)}
        />
      )}

      {editing && isOwner && (
        <EditCatchSheet c={c} onClose={() => setEditing(false)} />
      )}
    </div>
  );
};

const Profile = () => {
  const { catches, sessions, name, equippedAchievementId, likesGivenCount = 0, appliedCoupon } = useStore();
  const { user } = useAuth();
  const isPremiumActive = usePremiumMembership();
  const isAdmin = isUserAdmin(user);
  const [savingNickname, setSavingNickname] = useState(false);
  const [nicknameSaved, setNicknameSaved] = useState(false);

  const socialStats = useMemo(() => ({
    likesGiven: likesGivenCount || 0,
    likesReceived: actions.getTotalLikesReceived(),
    sharedCount: catches.filter((c) => c.isShared).length,
  }), [likesGivenCount, catches]);

  // Evaluate all achievements against active journal state and social milestones
  const evaluated = useMemo(() => evaluateAchievements(catches, sessions, socialStats), [catches, sessions, socialStats]);
  const unlockedAchievements = useMemo(() => evaluated.filter((a) => a.unlocked), [evaluated]);
  const equipped = useMemo(() => getEquippedAchievement(equippedAchievementId, evaluated), [equippedAchievementId, evaluated]);

  const species = [...new Set(catches.map((c) => c.species))];
  const pbs = useMemo(() => {
    const records = new Map<string, Catch>();
    catches.forEach(c => {
      const speciesKey = c.species.trim().toLowerCase();
      if (!speciesKey || totalOz(c) <= 0) return;
      const previous = records.get(speciesKey);
      if (!previous || totalOz(c) > totalOz(previous)) records.set(speciesKey, c);
    });
    return [...records.values()].sort((a, b) => totalOz(b) - totalOz(a));
  }, [catches]);
  const hours = sessions.reduce((t, s) => t + ((s.endedAt ? new Date(s.endedAt).getTime() : Date.now()) - new Date(s.startedAt).getTime()) / 3600000, 0);

  const unlockedCount = unlockedAchievements.length;
  const totalCount = evaluated.length;
  const progressPct = Math.round((unlockedCount / totalCount) * 100);

  return (
    <div className="content">
      {/* Profile Hero with Equipped Avatar Flair & Badge */}
      <div className="profile-hero">
        <div className={`avatar-container tier-${equipped?.tier || 'none'}`}>
          <div className="avatar-placeholder">
            {equipped ? (
              <span className="avatar-flair-icon" role="img" aria-label={equipped.title}>
                {equipped.icon}
              </span>
            ) : (
              <Fish size={32} />
            )}
          </div>
          {equipped && (
            <div
              className={`avatar-flair-badge tier-badge-${equipped.tier}`}
              title={equipped.flairTitle}
            >
              <span>{equipped.icon}</span>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            {equipped ? (
              <Link to="/achievements" className={`flair-title-pill tier-${equipped.tier}`} title="Click to manage badges">
                <Sparkles size={11} />
                <span>{equipped.flairTitle}</span>
              </Link>
            ) : (
              <Link to="/achievements" className="flair-title-pill" style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}>
                <Trophy size={11} />
                <span>Equip Achievement Flair</span>
              </Link>
            )}

            {isPremiumActive ? (
              <Link to="/subscription" className="flair-title-pill" style={{ background: 'rgba(201, 119, 43, 0.15)', color: 'var(--copper, #C9772B)', borderColor: 'rgba(201, 119, 43, 0.4)' }} title="Manage Keepnet Premium">
                <Crown size={11} />
                <span>{appliedCoupon ? 'Premium Trial Active' : 'Premium Angler'}</span>
              </Link>
            ) : (
              <Link to="/subscription" className="flair-title-pill" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }} title="Claim 1-month free trial">
                <Gift size={11} />
                <span>1-Month Free Trial Available</span>
              </Link>
            )}

            {nicknameSaved && (
              <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Check size={11} /> Saved
              </span>
            )}
            {savingNickname && (
              <span style={{ fontSize: 11, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <RefreshCw size={11} className="spin" /> Saving...
              </span>
            )}
          </div>

          <input 
            className="name-input serif" 
            id="profile-name" 
            value={name} 
            onChange={(e) => actions.setName(e.target.value)} 
            onBlur={async () => {
              const clean = (name || '').trim();
              if (clean) {
                setSavingNickname(true);
                try {
                  await authActions.updateNickname(clean);
                  setNicknameSaved(true);
                  setTimeout(() => setNicknameSaved(false), 2500);
                } finally {
                  setSavingNickname(false);
                }
              }
            }}
            placeholder="Choose your public nickname..."
            aria-label="Public Angler Nickname" 
          />
          <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#10b981', fontWeight: 500 }}>
              <ShieldCheck size={12} /> Email & personal info hidden
            </span>
            <span>·</span>
            <span>
              Angling since {sessions.length ? new Date(sessions[sessions.length - 1].startedAt).getFullYear() : new Date().getFullYear()}
            </span>
          </div>
        </div>
      </div>

      {/* Core Stats Grid */}
      <div className="stats-grid">
        <div className="stat"><span className="stat-num serif">{sessions.length}</span><span>Sessions</span></div>
        <div className="stat"><span className="stat-num serif">{catches.length}</span><span>Catches</span></div>
        <div className="stat"><span className="stat-num serif">{species.length}</span><span>Species</span></div>
        <div className="stat"><span className="stat-num serif">{Math.round(hours)}</span><span>Hours</span></div>
      </div>

      {/* Community Social Stats Pill Bar */}
      <div className="profile-social-bar">
        <div className="profile-social-stat">
          <Heart size={14} color="#ef4444" fill="#ef4444" />
          <span><strong>{socialStats.likesGiven}</strong> Likes Given</span>
        </div>
        <span className="profile-social-divider">·</span>
        <div className="profile-social-stat">
          <Sparkles size={14} color="#f59e0b" />
          <span><strong>{socialStats.likesReceived}</strong> Likes Received</span>
        </div>
        <span className="profile-social-divider">·</span>
        <div className="profile-social-stat">
          <Globe size={14} color="#10b981" />
          <span><strong>{socialStats.sharedCount}</strong> Shared</span>
        </div>
      </div>

      <PersonalBests records={pbs} sessions={sessions} />

      {/* Gamified Achievements Showcase Card */}
      <div className="card profile-achievements-card">
        <div className="row-between" style={{ alignItems: 'baseline' }}>
          <div>
            <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
              <Trophy size={13} /> Angler Achievements & Milestones
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
              {unlockedCount} of {totalCount} Badges Unlocked
            </div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
            {progressPct}%
          </span>
        </div>

        <div className="achievement-progress-track">
          <div className="achievement-progress-fill" style={{ width: `${Math.max(3, progressPct)}%` }} />
        </div>

        <div className="profile-achievements-badges-row">
          {unlockedAchievements.slice(0, 6).map((a) => (
            <div key={a.id} className={`profile-badge-chip tier-${a.tier}`} title={a.title}>
              <span>{a.icon}</span>
              <span>{a.title}</span>
            </div>
          ))}
          {unlockedCount === 0 && (
            <span className="muted" style={{ fontSize: 12, padding: '4px 0' }}>
              Log catches, species, bankside hours & beat personal bests to unlock trophies!
            </span>
          )}
        </div>

        <Link
          to="/achievements"
          id="profile-view-achievements-btn"
          className="btn-primary"
          style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, textDecoration: 'none' }}
        >
          <Trophy size={15} /> View All Achievements & Equip Flair <ChevronRight size={15} />
        </Link>
      </div>

      {/* App & Account Navigation Links */}
      <section className="profile-account-section" aria-labelledby="profile-account-title">
        <h2 id="profile-account-title">App & account</h2>
        <p>Manage your membership and preferences.</p>
        <div className="profile-account-links">
        <Link
          to="/subscription"
          id="profile-to-subscription-btn"
          className="btn-secondary"
          style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, textDecoration: 'none', height: 46, borderColor: 'rgba(201, 119, 43, 0.45)', color: 'var(--copper, #C9772B)' }}
        >
          <Crown size={16} /> {isPremiumActive ? 'Manage Premium membership' : 'Keepnet Membership & 1-Month Free Trial'}
        </Link>

        <Link
          to="/settings"
          id="profile-to-settings-btn"
          className="btn-secondary"
          style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, textDecoration: 'none', height: 46 }}
        >
          <SettingsIcon size={16} /> App & Account Settings
        </Link>

        {isAdmin && (
          <Link
            to="/admin"
            id="profile-to-admin-btn"
            className="btn-secondary"
            style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, textDecoration: 'none', height: 46, borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981' }}
          >
            <ShieldCheck size={16} /> Open Keepnet Admin Console
          </Link>
        )}
        </div>
      </section>
    </div>
  );
};

/* ---------- Shell ---------- */

const Navigation = ({ onStart }: { onStart: () => void }) => {
  const { pathname } = useLocation();
  // On catch detail screen, we hide the main navigation bar so the dedicated sticky action footer ([Like] [Comment]) has full focus per Mobile Screen 2
  if (pathname.startsWith('/catches/')) {
    return null;
  }
  const is = (p: string) => p === '/' ? pathname === '/' : p === '/profile'
    ? ['/profile', '/achievements', '/settings', '/subscription', '/admin'].some(route => pathname.startsWith(route))
    : p === '/discover' ? ['/discover', '/fisheries'].some(route => pathname.startsWith(route)) : pathname.startsWith(p);
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <Link to="/" id="nav-home" aria-current={is('/') ? 'page' : undefined} className={`nav-item ${is('/') ? 'active' : ''}`}><HomeIcon className="nav-icon" />Home</Link>
      <Link to="/sessions" id="nav-sessions" aria-current={is('/sessions') ? 'page' : undefined} className={`nav-item ${is('/sessions') ? 'active' : ''}`}><Calendar className="nav-icon" />Sessions</Link>
      {pathname === '/achievements' && <button type="button" className="badge-nav-add" onClick={onStart} aria-label="Start a fishing session"><Plus size={28} /></button>}
      <Link to="/discover" id="nav-discover" aria-current={is('/discover') ? 'page' : undefined} className={`nav-item ${is('/discover') ? 'active' : ''}`}><MapPin className="nav-icon" />Discover</Link>
      <Link to="/profile" id="nav-profile" aria-current={is('/profile') ? 'page' : undefined} className={`nav-item ${is('/profile') ? 'active' : ''}`}><User className="nav-icon" />Profile</Link>
    </nav>
  );
};

const Shell = () => {
  const nav = useNavigate();
  const location = useLocation();
  const [sheet, setSheet] = useState<{ venue?: Venue } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  // Dynamic document title per review recommendation
  useEffect(() => {
    window.scrollTo(0, 0);
    const mapTitle: Record<string, string> = {
      '/': 'Keepnet — Time by the Water',
      '/sessions': 'Journal & Sessions · Keepnet',
      '/discover': 'Community Catches · Keepnet',
      '/fisheries': 'UK Fisheries & Venues · Keepnet',
      '/profile': 'Angler Profile · Keepnet',
      '/settings': 'Settings & Preferences · Keepnet',
      '/achievements': 'Angler Achievements & Badges · Keepnet',
      '/subscription': 'Keepnet Membership & Plans · Keepnet',
      '/admin': 'Keepnet Admin Console',
    };
    if (mapTitle[location.pathname]) {
      document.title = mapTitle[location.pathname];
    } else if (location.pathname.startsWith('/sessions/')) {
      document.title = 'Session Details · Keepnet';
    } else if (location.pathname.startsWith('/catches/')) {
      document.title = 'Catch Details · Keepnet';
    } else {
      document.title = 'Keepnet — Fishing Journal & Angler Map';
    }
  }, [location.pathname]);

  const begin = async (v: Venue | 'current' | { id: string; name: string; type: string; lat: number; lon: number; targets: string[]; description: string }, photo?: string, isShared?: boolean) => {
    setSheet(null);
    if (v === 'current') {
      const s = actions.startSession({ venueId: 'current', venueName: 'Current location', lat: VENUES[0].lat, lon: VENUES[0].lon, photo, isShared });
      nav(`/sessions/${s.id}`);
      const pos = await getDevicePosition();
      const at = pos ?? { lat: s.lat, lon: s.lon };
      actions.updateSession(s.id, { ...at, venueName: pos ? 'Current location' : `${VENUES[0].name} (GPS unavailable)` });
      await logWeather({ ...s, ...at });
    } else {
      const s = actions.startSession({ venueId: v.id, venueName: v.name, lat: v.lat, lon: v.lon, photo, isShared });
      nav(`/sessions/${s.id}`);
      await logWeather(s);
    }
  };

  const [installPrompt, setInstallPrompt] = useState<any>(globalInstallPrompt);

  useEffect(() => {
    const handler = () => setInstallPrompt(globalInstallPrompt);
    window.addEventListener('keepnet:installable', handler);
    return () => window.removeEventListener('keepnet:installable', handler);
  }, []);

  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );

  const auth = useAuth();
  const store = useStore();
  const syncStatus = useCloudSyncStatus();

  useEffect(() => {
    if (auth.user && auth.storageMode === 'cloud') {
      fetchUserCloudData(auth.user).then((data) => {
        if (data) {
          actions.replaceWithRemoteData(data.sessions, data.catches, data.subscription);
        }
      });
    }
  }, [auth.user?.id]);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice?.outcome === 'accepted') {
      globalInstallPrompt = null;
      setInstallPrompt(null);
    }
  };

  return (
    <div className={`app-container ${location.pathname === '/achievements' ? 'achievements-shell' : ''}`} data-page={location.pathname.split('/')[1] || 'home'}>
      {!location.pathname.startsWith('/catches/') && <header className="top-bar">
        <Link to="/" className="logo-header" aria-label="Keepnet home">
          <Logo height={38} />
        </Link>
        <div className="mobile-header-actions">
          {installPrompt && !isStandalone && (
            <button
              type="button"
              className="header-install-btn"
              id="header-install-btn"
              onClick={handleInstallApp}
              title="Install Keepnet App for offline bankside use"
              aria-label="Install App"
            >
              <Download size={13} />
              <span>Install</span>
            </button>
          )}

          <button
            type="button"
            className="icon-btn"
            id="mobile-search-btn"
            onClick={() => nav('/discover?search=1')}
            aria-label="Search community catches"
            title="Search Catches"
          >
            <Search size={18} />
          </button>

          <button
            type="button"
            className="mobile-header-plus-btn"
            id="mobile-post-catch-btn"
            onClick={() => setSheet({})}
            aria-label="Post catch or start session"
            title="Post Catch"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>

          <Link
            to="/profile"
            className="mobile-header-avatar"
            id="header-profile-btn"
            aria-label="Profile"
            title="Profile"
          >
            <img src="/images/avatar-aran.jpg" alt="Profile" />
          </Link>
        </div>
      </header>}
      {store.storageError && (
        <div className="install-banner" style={{ background: 'rgba(239, 68, 68, 0.12)', borderBottomColor: 'rgba(239, 68, 68, 0.3)' }}>
          <div className="install-banner-content">
            <div className="install-banner-text">
              <strong style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={15} /> Device Storage Limit
              </strong>
              <span>{store.storageError}</span>
            </div>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 28, height: 28 }}
              onClick={() => actions.clearStorageError()}
              aria-label="Dismiss storage warning"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
      {syncStatus.status === 'error' && syncStatus.lastError && (
        <div className="install-banner" style={{ background: 'rgba(245, 158, 11, 0.12)', borderBottomColor: 'rgba(245, 158, 11, 0.3)' }}>
          <div className="install-banner-content">
            <div className="install-banner-text">
              <strong style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Cloud size={15} /> Cloud Sync Notice
              </strong>
              <span>{syncStatus.lastError} {syncStatus.pendingCount > 0 ? `(${syncStatus.pendingCount} offline items queued)` : ''}</span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 12, padding: '4px 10px', height: 28 }}
              onClick={() => flushPendingQueue()}
            >
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        </div>
      )}
      <main>
        <Routes>
          <Route path="/" element={<Home onStart={(venue) => setSheet({ venue })} />} />
          <Route path="/sessions" element={<Sessions onStart={() => setSheet({})} />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/catches/:id" element={<CatchDetail />} />
          <Route path="/discover" element={<Discover onStart={(venue) => setSheet({ venue })} />} />
          <Route path="/fisheries" element={<FisheriesDirectory onStart={(venue) => setSheet({ venue })} />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings onOpenAuth={() => setAuthOpen(true)} />} />
          <Route path="/achievements" element={<AchievementsPage />} />
          <Route path="/subscription" element={<SubscriptionPage />} />
          <Route path="/admin" element={<AdminPanel onClose={() => nav('/profile')} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Navigation onStart={() => setSheet({})} />
      {sheet && <StartSessionSheet initial={sheet.venue} onClose={() => setSheet(null)} onStart={begin} />}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
};

const App = () => (
  <BrowserRouter>
    <Shell />
  </BrowserRouter>
);

export default App;
