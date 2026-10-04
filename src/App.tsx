import { useState, useEffect, useRef, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, useParams, Navigate, useSearchParams } from 'react-router-dom';
import {
  Fish, User, MapPin, Calendar, ChevronRight, Plus, X, Thermometer, Wind, Droplets, Gauge,
  Cloud, RefreshCw, Camera, Trash2, ArrowLeft, Clock, Trophy, LocateFixed, Square, Images, Check,
  Share2, Globe, Lock, Copy, Sun, Moon, HardDrive, KeyRound, LogOut, Mail, Pencil, Search, ShieldCheck,
  Compass, Sparkles, Scale, Download, Smartphone
} from 'lucide-react';
import './index.css';
import Discover from './Discover';
import Logo from './Logo';
import {
  VENUES, actions, useStore, fmtWeight, fmtDay, fmtTime, totalOz, resizeImage,
  metricToImperial, imperialToMetric, type Venue, type Session, type Catch, type UnitSystem
} from './store';
import { fetchWeather, getDevicePosition, compass, type Weather } from './weather';
import { useTheme, themeActions } from './theme';
import { useAuth, authActions } from './auth';
import { syncUserWithCloud } from './cloud';

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
        {c.isShared ? (
          <span className="mini-badge shared" title="Shared on Discover map"><Globe size={11} /> Shared</span>
        ) : (
          <span className="mini-badge private" title="Private to your journal"><Lock size={11} /> Private</span>
        )}
      </div>
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
  onToggleShared: () => void;
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
            syncUserWithCloud(user, sessions, catches).then((data) => {
              if (data) actions.mergeRemoteData(data.sessions, data.catches);
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

const SpeciesTagPicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (species: string) => void;
}) => {
  const isPreset = POPULAR_SPECIES.some((s) => s.toLowerCase() === (value || '').toLowerCase());
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
        {POPULAR_SPECIES.map((s) => {
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
  const [species, setSpecies] = useState(POPULAR_SPECIES[0]);
  const [weight, setWeight] = useState({ lb: 0, oz: 0 });
  const [bait, setBait] = useState('');
  const [notes, setNotes] = useState('');
  const [image, setImage] = useState<string>();
  const [isShared, setIsShared] = useState<boolean>(true);

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
    </Sheet>
  );
};

/* ---------- Edit Catch Sheet ---------- */

const EditCatchSheet = ({ c, onClose }: { c: Catch; onClose: () => void }) => {
  const { unitSystem = 'imperial' } = useStore();
  const [species, setSpecies] = useState(c.species);
  const [weight, setWeight] = useState({ lb: c.weightLb, oz: c.weightOz });
  const [bait, setBait] = useState(c.bait);
  const [notes, setNotes] = useState(c.notes ?? '');
  const [image, setImage] = useState<string | undefined>(c.image);
  const [isShared, setIsShared] = useState<boolean>(!!c.isShared);

  const handleSave = () => {
    actions.updateCatch(c.id, {
      species: species.trim() || 'Fish',
      weightLb: weight.lb,
      weightOz: weight.oz,
      bait: bait || 'Unknown',
      notes,
      image,
      isShared,
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
  const c = catches.find((x) => x.id === id);
  if (!c) return <Navigate to="/" replace />;
  const s = sessions.find((x) => x.id === c.sessionId);

  return (
    <div className="content">
      <div className="row-between">
        <button className="back-link" onClick={() => nav(-1)}><ArrowLeft size={18} /> Back</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="icon-btn" id="edit-catch-icon-btn" onClick={() => setEditing(true)} aria-label="Edit catch" title="Edit catch">
            <Pencil size={18} />
          </button>
          <button className="icon-btn" id="share-catch-btn" onClick={() => setSharing(true)} aria-label="Share catch" title="Share catch">
            <Share2 size={18} />
          </button>
        </div>
      </div>

      {c.image && <div className="hero-image-container"><img src={c.image} alt={c.species} className="hero-image tall" /></div>}

      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="eyebrow">{fmtDay(c.caughtAt)} · {fmtTime(c.caughtAt)}</div>
          <h1 className="page-title">{c.species}</h1>
        </div>
        <div style={{ marginTop: 8 }}>
          {c.isShared ? (
            <button className="tag status-pill shared" onClick={() => setSharing(true)}>
              <Globe size={12} /> Shared
            </button>
          ) : (
            <button className="tag status-pill private" onClick={() => setSharing(true)}>
              <Lock size={12} /> Private
            </button>
          )}
        </div>
      </div>

      <p className="catch-big-weight serif">{fmtWeight(c)}</p>

      {/* Direct link back to session */}
      {s && (
        <Link to={`/sessions/${s.id}`} className="card card-link session-link-card">
          <div className="row-between">
            <div>
              <div className="eyebrow" style={{ marginBottom: 2 }}><Calendar size={13} /> Session</div>
              <div className="serif" style={{ fontSize: 18, color: 'var(--accent-green)' }}>{s.venueName}</div>
              <div className="muted" style={{ fontSize: 12 }}>{fmtDay(s.startedAt)} · {fmtTime(s.startedAt)}</div>
            </div>
            <ChevronRight size={18} color="var(--text-secondary)" />
          </div>
        </Link>
      )}

      <div className="tag-row">
        <span className="tag">Bait: {c.bait}</span>
        {s && <span className="tag"><MapPin size={13} /> {s.venueName}</span>}
      </div>

      {c.notes && (
        <div className="card">
          <div className="eyebrow">Angler notes</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{c.notes}</p>
        </div>
      )}

      {/* Compact weather summary with collapsible breakdown */}
      {s?.weather && <WeatherSummary weather={s.weather} />}

      {/* Action buttons: Edit & Delete */}
      <div className="field-row" style={{ marginTop: 14 }}>
        <button className="btn-primary" id="edit-catch-btn" style={{ flex: 1, height: 48 }} onClick={() => setEditing(true)}>
          <Pencil size={17} /> Edit catch
        </button>
        <button
          className="btn-secondary danger"
          id="delete-catch-btn"
          style={{ flex: 1, height: 48, marginTop: 0 }}
          onClick={() => confirm('Delete this catch from your journal?') && (actions.deleteCatch(c.id), nav(-1))}
        >
          <Trash2 size={16} /> Delete catch
        </button>
      </div>

      {editing && (
        <EditCatchSheet c={c} onClose={() => setEditing(false)} />
      )}

      {sharing && (
        <ShareModal
          title={`${c.species} (${fmtWeight(c)})`}
          subtitle={`Caught on ${c.bait}${s ? ` at ${s.venueName}` : ''}`}
          isShared={!!c.isShared}
          onToggleShared={() => actions.toggleCatchShare(c.id)}
          shareText={`🎣 Caught a ${fmtWeight(c)} ${c.species} on ${c.bait}${s ? ` at ${s.venueName}` : ''}! Logged on Keepnet.`}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
};

const Profile = () => {
  const { catches, sessions, name, unitSystem = 'imperial' } = useStore();
  const { user, storageMode } = useAuth();
  const theme = useTheme();
  const [authOpen, setAuthOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingNickname, setSavingNickname] = useState(false);
  const [nicknameSaved, setNicknameSaved] = useState(false);
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
  const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice?.outcome === 'accepted') {
      globalInstallPrompt = null;
      setInstallPrompt(null);
    }
  };

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const data = await syncUserWithCloud(user, sessions, catches);
      if (data) {
        actions.mergeRemoteData(data.sessions, data.catches);
      }
    } finally {
      setSyncing(false);
    }
  };

  const species = [...new Set(catches.map((c) => c.species))];
  const best = [...catches].sort((a, b) => totalOz(b) - totalOz(a))[0];
  const pbs = species.map((sp) => catches.filter((c) => c.species === sp).sort((a, b) => totalOz(b) - totalOz(a))[0]);
  const hours = sessions.reduce((t, s) => t + ((s.endedAt ? new Date(s.endedAt).getTime() : Date.now()) - new Date(s.startedAt).getTime()) / 3600000, 0);

  return (
    <div className="content">
      <div className="profile-hero">
        <div className="avatar-placeholder">
          <Fish size={32} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Globe size={11} /> Public Angler Nickname
            </span>
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

      <div className="stats-grid">
        <div className="stat"><span className="stat-num serif">{sessions.length}</span><span>Sessions</span></div>
        <div className="stat"><span className="stat-num serif">{catches.length}</span><span>Catches</span></div>
        <div className="stat"><span className="stat-num serif">{species.length}</span><span>Species</span></div>
        <div className="stat"><span className="stat-num serif">{Math.round(hours)}</span><span>Hours</span></div>
      </div>

      {/* Account & Storage Mode Card */}
      <div className="card account-card">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              {storageMode === 'cloud' && user ? <Cloud size={14} /> : <HardDrive size={14} />}
              {storageMode === 'cloud' && user ? 'Cloud Account' : 'Local Storage Mode'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {user ? (
                <>
                  <Lock size={14} style={{ color: 'var(--muted)' }} />
                  <span>{user.email}</span>
                  <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: 4, color: 'var(--muted)', fontWeight: 500 }}>
                    Private
                  </span>
                </>
              ) : (
                'Personal Journal (Local Device Only)'
              )}
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {storageMode === 'cloud' && user
                ? 'Your email and personal account details are strictly private and never shown to other anglers.'
                : 'All catches and sessions are kept private on this phone and not uploaded to the cloud.'}
            </p>
          </div>
        </div>

        <div className="stack" style={{ marginTop: 12 }}>
          {user ? (
            <div className="field-row">
              <button className="btn-secondary" style={{ flex: 1 }} onClick={handleSync} disabled={syncing}>
                <RefreshCw size={15} /> {syncing ? 'Syncing...' : 'Sync Cloud'}
              </button>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setAuthOpen(true)}>
                <KeyRound size={15} /> Password
              </button>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => authActions.signOut()}>
                <LogOut size={15} /> Sign Out
              </button>
            </div>
          ) : (
            <div className="field-row">
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => setAuthOpen(true)}>
                <Mail size={16} /> Sign In / Sign Up
              </button>
            </div>
          )}
        </div>
      </div>

      {/* App Preferences & Settings Card (Units + Theme) */}
      <div className="card preferences-card">
        <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <Gauge size={14} /> App Preferences
        </div>

        {/* Units of Measurement */}
        <div className="pref-row">
          <div className="pref-info">
            <div className="pref-title">Units of Measurement</div>
            <p className="muted" style={{ fontSize: 13 }}>
              Display and record catches in {unitSystem === 'metric' ? 'Metric (kg, g)' : 'Imperial (lb, oz)'}
            </p>
          </div>
          <div className="pref-segmented-control" role="group" aria-label="Select measurement units">
            <button
              type="button"
              id="pref-unit-imperial"
              className={`pref-segment-btn ${unitSystem !== 'metric' ? 'active' : ''}`}
              onClick={() => actions.setUnitSystem('imperial')}
            >
              <Scale size={14} />
              <span>Imperial (lb/oz)</span>
            </button>
            <button
              type="button"
              id="pref-unit-metric"
              className={`pref-segment-btn ${unitSystem === 'metric' ? 'active' : ''}`}
              onClick={() => actions.setUnitSystem('metric')}
            >
              <Scale size={14} />
              <span>Metric (kg/g)</span>
            </button>
          </div>
        </div>

        <div className="pref-divider" />

        {/* Theme & Appearance */}
        <div className="pref-row">
          <div className="pref-info">
            <div className="pref-title">Theme & Appearance</div>
            <p className="muted" style={{ fontSize: 13 }}>
              Currently using {theme === 'dark' ? 'Night bankside dark' : 'Daylight river light'} theme
            </p>
          </div>
          <div className="pref-segmented-control" role="group" aria-label="Select theme appearance">
            <button
              type="button"
              id="pref-theme-light"
              className={`pref-segment-btn ${theme === 'light' ? 'active' : ''}`}
              onClick={() => themeActions.setTheme('light')}
            >
              <Sun size={14} />
              <span>Light Mode</span>
            </button>
            <button
              type="button"
              id="pref-theme-dark"
              className={`pref-segment-btn ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => themeActions.setTheme('dark')}
            >
              <Moon size={14} />
              <span>Dark Mode</span>
            </button>
          </div>
        </div>

        <div className="pref-divider" />

        {/* PWA App Installation */}
        <div className="pref-row">
          <div className="pref-info">
            <div className="pref-title">Install Keepnet App</div>
            <p className="muted" style={{ fontSize: 13 }}>
              {isStandalone
                ? 'Keepnet is installed and running in standalone app mode.'
                : 'Install Keepnet on your home screen or desktop for fast bankside offline logging.'}
            </p>
          </div>
          {isStandalone ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#10b981', fontSize: 13, fontWeight: 600 }}>
              <Check size={16} /> Installed
            </div>
          ) : installPrompt ? (
            <button
              type="button"
              id="pref-install-app-btn"
              className="btn-primary"
              style={{ fontSize: 13, padding: '7px 14px' }}
              onClick={handleInstallApp}
            >
              <Download size={14} /> Install App
            </button>
          ) : isIos ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--surface-sunken)', padding: '6px 10px', borderRadius: 8, maxWidth: 220 }}>
              Tap <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Share</span> in Safari → <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Add to Home Screen</span>
            </div>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 13, padding: '7px 14px' }}
              onClick={() => alert('To install Keepnet, tap your browser menu (⋮ or Share) and choose "Install App" or "Add to Home Screen".')}
            >
              <Smartphone size={14} /> Install Guide
            </button>
          )}
        </div>
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

      <button
        className="btn-secondary"
        id="clear-journal-btn"
        style={{ borderColor: 'rgba(217, 83, 79, 0.4)', color: 'var(--text-secondary)' }}
        onClick={() => confirm('Clear all journal data and start fresh?') && actions.clearAll()}
      >
        <Trash2 size={15} style={{ verticalAlign: -2, marginRight: 6 }} /> Clear all journal data
      </button>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
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
  const location = useLocation();
  const [sheet, setSheet] = useState<{ venue?: Venue } | null>(null);

  // Dynamic document title per review recommendation
  useEffect(() => {
    const mapTitle: Record<string, string> = {
      '/': 'Keepnet — Time by the Water',
      '/sessions': 'Journal & Sessions · Keepnet',
      '/discover': 'Discover Venues · Keepnet',
      '/profile': 'Profile & Settings · Keepnet',
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
  const [dismissedInstall, setDismissedInstall] = useState(false);

  useEffect(() => {
    const handler = () => setInstallPrompt(globalInstallPrompt);
    window.addEventListener('keepnet:installable', handler);
    return () => window.removeEventListener('keepnet:installable', handler);
  }, []);

  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );

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
    <div className="app-container">
      <header className="top-bar">
        <Link to="/" className="logo-header" aria-label="Keepnet home"><Logo height={44} /></Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link to="/profile" className="profile-btn" id="header-profile-btn" aria-label="Profile"><User size={20} /></Link>
        </div>
      </header>
      {installPrompt && !dismissedInstall && !isStandalone && (
        <div className="install-banner">
          <div className="install-banner-content">
            <div className="install-banner-text">
              <strong>Install Keepnet App</strong>
              <span>Fast offline bankside logging</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 12, height: 32 }} onClick={handleInstallApp}>
                <Download size={13} /> Install
              </button>
              <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setDismissedInstall(true)} aria-label="Dismiss banner">
                <X size={15} />
              </button>
            </div>
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
