import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Cloud, HardDrive, Lock, RefreshCw, KeyRound, LogOut,
  Mail, Scale, Sun, Moon, Download, Smartphone, Check, ShieldCheck,
  Trash2, AlertTriangle, User
} from 'lucide-react';
import { useStore, actions } from './store';
import { useAuth, authActions, isUserAdmin } from './auth';
import { useTheme, themeActions } from './theme';
import { fetchUserCloudData, flushPendingQueue } from './cloud';

export const Settings = ({ onOpenAuth }: { onOpenAuth: () => void }) => {
  const nav = useNavigate();
  const { unitSystem = 'imperial' } = useStore();
  const { user, storageMode } = useAuth();
  const theme = useTheme();
  const isAdmin = isUserAdmin(user);

  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  // Global PWA installation event handling
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      setInstallPrompt(e);
    };
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
      setInstallPrompt(null);
    }
  };

  const handleManualSync = async () => {
    if (!user) return;
    setSyncing(true);
    setSyncSuccess(false);
    try {
      await flushPendingQueue();
      const data = await fetchUserCloudData(user);
      if (data && data.sessions.length > 0) {
        actions.replaceWithRemoteData(data.sessions, data.catches);
      }
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearJournal = () => {
    const confirmed = window.confirm(
      'Are you sure you want to clear all journal sessions and catches from this device? This action cannot be undone.'
    );
    if (confirmed) {
      actions.clearAll();
      alert('Journal data has been reset.');
      nav('/');
    }
  };

  return (
    <div className="content settings-page">
      {/* Top Header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="icon-btn"
          onClick={() => nav('/profile')}
          aria-label="Back to Profile"
          id="settings-back-btn"
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
            <User size={13} /> App Configuration
          </div>
          <h1 className="serif page-title" style={{ margin: 0, fontSize: 22 }}>
            Settings & Preferences
          </h1>
        </div>
      </div>

      {/* Account & Cloud Sync Section */}
      <div className="card account-card">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              {storageMode === 'cloud' && user ? <Cloud size={14} /> : <HardDrive size={14} />}
              {storageMode === 'cloud' && user ? 'Keepnet Cloud Account' : 'Local Storage Mode'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {user ? (
                <>
                  <Lock size={14} style={{ color: 'var(--muted)' }} />
                  <span>{user.email}</span>
                  <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: 4, color: 'var(--muted)', fontWeight: 500 }}>
                    Private
                  </span>
                </>
              ) : (
                'Local Guest Journal'
              )}
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {storageMode === 'cloud' && user
                ? 'Your catches, swim photos, and sessions are securely encrypted and synced across all your devices.'
                : 'All catches and sessions are stored privately on this device and are not uploaded to remote servers.'}
            </p>
          </div>
        </div>

        {syncSuccess && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 8, fontSize: 13, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={15} /> Cloud sync complete — all catches up to date.
          </div>
        )}

        <div className="stack" style={{ marginTop: 14 }}>
          {user ? (
            <div className="field-row">
              <button
                type="button"
                className="btn-secondary"
                id="settings-sync-btn"
                style={{ flex: 1 }}
                onClick={handleManualSync}
                disabled={syncing}
              >
                <RefreshCw size={15} className={syncing ? 'spin' : ''} />
                <span>{syncing ? 'Syncing...' : 'Sync Cloud'}</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="settings-password-btn"
                style={{ flex: 1 }}
                onClick={onOpenAuth}
              >
                <KeyRound size={15} />
                <span>Password</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="settings-signout-btn"
                style={{ flex: 1 }}
                onClick={() => authActions.signOut()}
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="field-row">
              <button
                type="button"
                className="btn-primary"
                id="settings-signin-btn"
                style={{ flex: 1 }}
                onClick={onOpenAuth}
              >
                <Mail size={16} /> Sign In / Create Cloud Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Preferences Card (Units + Theme) */}
      <div className="card preferences-card">
        <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Scale size={14} /> Measurement Units
        </div>

        {/* Units of Measurement */}
        <div className="pref-row">
          <div className="pref-info">
            <div className="pref-title">Units of Weight</div>
            <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
              Display, record, and evaluate catches in {unitSystem === 'metric' ? 'Metric (kg, g)' : 'Imperial (lb, oz)'}
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
            <div className="pref-title">App Theme & Appearance</div>
            <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
              Currently using {theme === 'dark' ? 'Night bankside dark' : 'Daylight river light'} palette
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
            <div className="pref-title">Install Keepnet App (PWA)</div>
            <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
              {isStandalone
                ? 'Keepnet is installed and running in standalone app mode with full offline caching.'
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
              onClick={() => alert('To install Keepnet, tap your browser menu (⋮ or Share) and select "Install App" or "Add to Home Screen".')}
            >
              <Smartphone size={14} /> Install Guide
            </button>
          )}
        </div>
      </div>

      {/* Administrator Console Card (Exclusive to Admin) */}
      {isAdmin && (
        <div className="card admin-promo-card">
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#10b981', marginBottom: 4 }}>
                <ShieldCheck size={14} /> Master Administrator
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Keepnet Admin Console
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Access total catch reports, user trends over time, UK fisheries directory management, and database exports.
              </p>
            </div>
            <span className="admin-badge">Admin</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <Link
              to="/admin"
              id="settings-open-admin-btn"
              className="btn-primary"
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, textDecoration: 'none' }}
            >
              <ShieldCheck size={16} /> Open Keepnet Admin Console
            </Link>
          </div>
        </div>
      )}

      {/* Danger Zone: Journal Reset */}
      <div className="card danger-card" style={{ borderColor: 'rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.04)' }}>
        <div className="eyebrow" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <AlertTriangle size={14} /> Danger Zone
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          Reset Device Journal Data
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Permanently clear all local catches, sessions, photos, and personal best records from this device.
        </p>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn-secondary danger"
            id="clear-journal-btn"
            style={{ width: '100%', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}
            onClick={handleClearJournal}
          >
            <Trash2 size={15} /> Clear All Local Journal Data
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
