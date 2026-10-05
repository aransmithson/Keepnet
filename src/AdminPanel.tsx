import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert, Users, Fish, Calendar, TrendingUp, RefreshCw, Plus, Trash2,
  ExternalLink, Search, Download, Check, X, Shield, MapPin, AlertCircle, ArrowLeft,
  Crown, Gift, Tag, Lock, Unlock, Edit2, ShieldCheck, Sparkles, CheckCircle2,
  Clock, Cloud, AlertTriangle
} from 'lucide-react';
import { useAuth, isUserAdmin } from './auth';
import { UK_FISHERIES, type Fishery } from './fisheries';
import { actions } from './store';

type AdminTab = 'dashboard' | 'fisheries' | 'species' | 'users' | 'backup';

export const AdminPanel = ({ onClose }: { onClose?: () => void }) => {
  const nav = useNavigate();
  const handleExit = () => {
    if (onClose) {
      onClose();
    } else {
      nav('/profile');
    }
  };
  const { user } = useAuth();
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dashboard Data
  const [stats, setStats] = useState<any>(null);

  // Species Tags
  const [speciesList, setSpeciesList] = useState<string[]>([]);
  const [newSpeciesName, setNewSpeciesName] = useState('');
  const [newSpeciesCategory, setNewSpeciesCategory] = useState('Coarse');
  const [speciesSaving, setSpeciesSaving] = useState(false);

  // Fisheries
  const [customFisheries, setCustomFisheries] = useState<Fishery[]>([]);
  const [fisherySearch, setFisherySearch] = useState('');
  const [showAddFishery, setShowAddFishery] = useState(false);
  const [newFishery, setNewFishery] = useState({
    name: '',
    type: 'Coarse Lakes',
    region: 'North West',
    lat: 53.95,
    lon: -2.75,
    website: '',
    targets: 'Carp, Pike, Perch',
    description: '',
  });

  // Angler Accounts Management
  const [usersList, setUsersList] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userTierFilter, setUserTierFilter] = useState<'all' | 'lite' | 'premium'>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'locked' | 'admin'>('all');
  const [actionLoadingUserId, setActionLoadingUserId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ userId: string; message: string; type: 'success' | 'error' } | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [managingSubUserId, setManagingSubUserId] = useState<string | null>(null);
  const [nowTime, setNowTime] = useState(() => Date.now());

  const getHeaders = () => {
    const token = sessionStorage.getItem('keepnet:auth_token') || localStorage.getItem('keepnet:auth_token') || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };


  const fetchDashboardStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stats`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStats(data);
      } else {
        setError(data.error || 'Failed to load admin metrics');
      }
    } catch {
      setError('Network error contacting admin metrics endpoint');
    } finally {
      setLoading(false);
    }
  };

  const fetchSpecies = async () => {
    try {
      const res = await fetch('/api/species');
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.species)) {
        setSpeciesList(data.species);
      }
    } catch {
      // ignore
    }
  };

  const fetchCustomFisheries = async () => {
    try {
      const res = await fetch(`/api/admin/fisheries`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.fisheries)) {
        setCustomFisheries(data.fisheries);
      }
    } catch {
      // ignore
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        q: userSearch,
        tier: userTierFilter,
        status: userStatusFilter,
      });
      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.users)) {
        setUsersList(data.users);
        setNowTime(Date.now());
      }
    } catch {
      // ignore
    } finally {
      setUsersLoading(false);
    }
  };

  const handleUpdateSubscription = async (userId: string, tier: 'lite' | 'premium', durationDays?: number | null, coupon?: string) => {
    setActionLoadingUserId(userId);
    try {
      let expiresAt: string | null = null;
      if (tier === 'premium' && durationDays) {
        const d = new Date();
        d.setDate(d.getDate() + durationDays);
        expiresAt = d.toISOString();
      }
      const res = await fetch(`/api/admin/users`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'update_subscription',
          userId,
          tier,
          expiresAt,
          coupon: coupon || (durationDays === 30 ? 'ADMIN_1M' : durationDays === 365 ? 'ADMIN_1Y' : 'ADMIN_VIP'),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({ userId, message: data.message, type: 'success' });
        setManagingSubUserId(null);

        // Immediately update client store if this is the currently authenticated user
        if (user && (user.id === userId || user.email === usersList.find((u) => u.id === userId)?.email)) {
          actions.setSubscription(
            tier,
            data.appliedCoupon || coupon || null,
            data.expiresAt !== undefined ? data.expiresAt : expiresAt
          );
        }

        await fetchUsers();
        await fetchDashboardStats();
      } else {
        alert(data.error || 'Failed to update subscription');
      }
    } catch {
      alert('Network error updating subscription');
    } finally {
      setActionLoadingUserId(null);
    }
  };

  const handleUnlockUser = async (userId: string) => {
    setActionLoadingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ action: 'unlock', userId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({ userId, message: data.message, type: 'success' });
        await fetchUsers();
        await fetchDashboardStats();
      } else {
        alert(data.error || 'Failed to unlock account');
      }
    } catch {
      alert('Network error unlocking account');
    } finally {
      setActionLoadingUserId(null);
    }
  };

  const handleLockUser = async (userId: string, durationDays = 7) => {
    if (!confirm(`Are you sure you want to temporarily suspend/lock this angler account for ${durationDays} days?`)) return;
    setActionLoadingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'lock',
          userId,
          durationMs: durationDays * 24 * 60 * 60 * 1000,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({ userId, message: data.message, type: 'success' });
        await fetchUsers();
        await fetchDashboardStats();
      } else {
        alert(data.error || 'Failed to lock account');
      }
    } catch {
      alert('Network error locking account');
    } finally {
      setActionLoadingUserId(null);
    }
  };

  const handleToggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    const newAdminVal = !currentIsAdmin;
    if (!confirm(`Are you sure you want to ${newAdminVal ? 'GRANT' : 'REVOKE'} admin access for this account?`)) return;
    setActionLoadingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ action: 'toggle_admin', userId, isAdmin: newAdminVal }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({ userId, message: data.message, type: 'success' });
        await fetchUsers();
      } else {
        alert(data.error || 'Failed to update admin role');
      }
    } catch {
      alert('Network error updating admin role');
    } finally {
      setActionLoadingUserId(null);
    }
  };

  const handleSaveNickname = async (userId: string) => {
    if (!editNickname.trim()) return;
    setActionLoadingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ action: 'update_nickname', userId, nickname: editNickname.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditingUserId(null);
        setEditNickname('');
        setActionFeedback({ userId, message: data.message, type: 'success' });
        await fetchUsers();
      } else {
        alert(data.error || 'Failed to update nickname');
      }
    } catch {
      alert('Network error updating nickname');
    } finally {
      setActionLoadingUserId(null);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`DANGER: Are you sure you want to permanently delete the angler account "${email}"? This will delete all their catches, sessions, and records from Cloudflare D1.`)) return;
    const doubleConfirm = prompt(`Type "DELETE" to confirm permanent deletion of ${email}:`);
    if (doubleConfirm !== 'DELETE') {
      alert('Deletion cancelled.');
      return;
    }
    setActionLoadingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ action: 'delete_user', userId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message);
        await fetchUsers();
        await fetchDashboardStats();
      } else {
        alert(data.error || 'Failed to delete user');
      }
    } catch {
      alert('Network error deleting user');
    } finally {
      setActionLoadingUserId(null);
    }
  };

  useEffect(() => {
    if (isUserAdmin(user)) {
      fetchDashboardStats();
      fetchSpecies();
      fetchCustomFisheries();
      fetchUsers();
    }
  }, [user]);

  useEffect(() => {
    if (tab === 'users' && isUserAdmin(user)) {
      const timer = setTimeout(() => {
        fetchUsers();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [tab, userSearch, userTierFilter, userStatusFilter]);

  // Handle Species Add/Delete
  const handleAddSpecies = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpeciesName.trim()) return;
    setSpeciesSaving(true);
    try {
      const res = await fetch(`/api/species`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'add',
          name: newSpeciesName.trim(),
          category: newSpeciesCategory,
          sortOrder: speciesList.length + 1,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewSpeciesName('');
        await fetchSpecies();
      } else {
        alert(data.error || 'Failed to add species tag');
      }
    } finally {
      setSpeciesSaving(false);
    }
  };

  const handleDeleteSpecies = async (name: string) => {
    if (!confirm(`Remove "${name}" from the species picker?`)) return;
    try {
      const res = await fetch(`/api/species`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ action: 'delete', name }),
      });
      if (res.ok) {
        await fetchSpecies();
      }
    } catch {
      alert('Failed to remove species tag');
    }
  };

  // Handle Fishery Add/Delete
  const handleAddFisherySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFishery.name.trim()) return;
    try {
      const targetsArray = newFishery.targets.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch(`/api/admin/fisheries`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...newFishery,
          targets: targetsArray,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowAddFishery(false);
        setNewFishery({
          name: '',
          type: 'Coarse Lakes',
          region: 'North West',
          lat: 53.95,
          lon: -2.75,
          website: '',
          targets: 'Carp, Pike, Perch',
          description: '',
        });
        await fetchCustomFisheries();
      } else {
        alert(data.error || 'Failed to save fishery');
      }
    } catch {
      alert('Error saving fishery');
    }
  };

  const handleDeleteFishery = async (id: string, name: string) => {
    if (!confirm(`Delete custom fishery "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/fisheries?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.ok) {
        await fetchCustomFisheries();
      }
    } catch {
      alert('Failed to delete fishery');
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const res = await fetch(`/api/admin/backup`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `keepnet-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert(data.error || 'Backup export failed');
      }
    } catch {
      alert('Network error downloading backup');
    }
  };

  if (!isUserAdmin(user)) {
    return (
      <div className="admin-container" style={{ alignItems: 'center', justifyContent: 'center', padding: '40px 20px', minHeight: '80vh' }}>
        <div className="card" style={{ maxWidth: 440, width: '100%', margin: '40px auto', padding: 24, textAlign: 'center' }}>
          <ShieldAlert size={48} color="var(--danger)" style={{ margin: '0 auto 12px' }} />
          <h2 className="serif" style={{ fontSize: 20, marginBottom: 8 }}>Access Denied</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            The Keepnet Admin Console is restricted strictly to authorized platform administrators ({user?.email || 'Guest'}).
          </p>
          <button className="btn-primary" onClick={handleExit} style={{ width: '100%' }}>
            Back to Profile
          </button>
        </div>
      </div>
    );
  }

  // Combine static UK fisheries with custom D1 fisheries for directory view
  const allFisheries = [...customFisheries, ...UK_FISHERIES];
  const filteredFisheries = fisherySearch.trim()
    ? allFisheries.filter(
        (f) =>
          f.name.toLowerCase().includes(fisherySearch.toLowerCase()) ||
          f.region.toLowerCase().includes(fisherySearch.toLowerCase()) ||
          f.type.toLowerCase().includes(fisherySearch.toLowerCase())
      )
    : allFisheries.slice(0, 50);

  return (
    <div className="admin-container">
      {/* Admin Top Header */}
      <header className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="icon-btn" onClick={handleExit} aria-label="Exit Admin">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 className="serif" style={{ fontSize: 20, margin: 0 }}>Keepnet Admin Console</h1>
              <span className="admin-badge">
                <Shield size={12} /> Owner
              </span>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>{user?.email}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="icon-btn" onClick={fetchDashboardStats} disabled={loading} title="Refresh data">
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
          <button className="icon-btn" onClick={handleExit} aria-label="Close Admin">
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Admin Tab Navigation */}
      <div className="admin-nav-bar">
        <button className={`admin-tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
          <TrendingUp size={15} /> Dashboard & Growth
        </button>
        <button className={`admin-tab ${tab === 'fisheries' ? 'active' : ''}`} onClick={() => setTab('fisheries')}>
          <MapPin size={15} /> Fisheries Directory ({allFisheries.length})
        </button>
        <button className={`admin-tab ${tab === 'species' ? 'active' : ''}`} onClick={() => setTab('species')}>
          <Fish size={15} /> Species Tags ({speciesList.length})
        </button>
        <button className={`admin-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          <Users size={15} /> Angler Accounts
        </button>
        <button className={`admin-tab ${tab === 'backup' ? 'active' : ''}`} onClick={() => setTab('backup')}>
          <Download size={15} /> Database Backup
        </button>
      </div>

      {error && (
        <div className="auth-message error" style={{ margin: '16px 20px 0' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="admin-content">
        {/* ================= TAB 1: DASHBOARD & METRICS ================= */}
        {tab === 'dashboard' && (
          <div className="stack" style={{ gap: 20 }}>
            {/* KPI Cards */}
            <div className="admin-kpi-grid">
              <div className="kpi-card">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(1, 71, 49, 0.1)', color: 'var(--accent-green)' }}>
                  <Fish size={22} />
                </div>
                <div className="kpi-num serif">{stats?.totals?.catches ?? '—'}</div>
                <div className="kpi-label">Total Catch Reports</div>
                <div className="kpi-sub">
                  {stats?.totals?.sharedCatches ?? 0} public on map
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(201, 119, 43, 0.1)', color: 'var(--copper)' }}>
                  <Users size={22} />
                </div>
                <div className="kpi-num serif">{stats?.totals?.users ?? '—'}</div>
                <div className="kpi-label">Registered Anglers</div>
                <div className="kpi-sub">Cloud sync active</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(47, 128, 237, 0.1)', color: '#2F80ED' }}>
                  <Calendar size={22} />
                </div>
                <div className="kpi-num serif">{stats?.totals?.sessions ?? '—'}</div>
                <div className="kpi-label">Fishing Sessions</div>
                <div className="kpi-sub">
                  {stats?.totals?.sharedSessions ?? 0} shared swims
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
                  <Shield size={22} />
                </div>
                <div className="kpi-num serif">Active</div>
                <div className="kpi-label">System Security</div>
                <div className="kpi-sub">
                  {stats?.totals?.activeLockouts ?? 0} locked accounts
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(201, 119, 43, 0.15)', color: 'var(--copper)' }}>
                  <Crown size={22} />
                </div>
                <div className="kpi-num serif">{stats?.subscriptions?.activeTrials ?? stats?.totals?.activeTrials ?? 0}</div>
                <div className="kpi-label">Active Premium Trials</div>
                <div className="kpi-sub">30-day passes active</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                  <Gift size={22} />
                </div>
                <div className="kpi-num serif">{stats?.subscriptions?.totalCouponsRedeemed ?? stats?.totals?.totalCouponsRedeemed ?? 0}</div>
                <div className="kpi-label">Coupons Redeemed</div>
                <div className="kpi-sub">KEEPNET1M & promos</div>
              </div>
            </div>

            {/* Membership & Coupon Campaigns Card */}
            <div className="card">
              <div className="row-between" style={{ alignItems: 'baseline', marginBottom: 12 }}>
                <div>
                  <h2 className="serif" style={{ fontSize: 17, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Crown size={18} color="var(--copper)" /> Membership & 1-Month Free Trial Coupons
                  </h2>
                  <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    Free 1-month trial redemption stats and active promotional codes
                  </p>
                </div>
                <span className="badge" style={{ fontSize: 12 }}>1-Month Free Trial</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: '12px 14px', background: 'var(--surface-sunken)', borderRadius: 10 }}>
                  <div className="eyebrow" style={{ color: 'var(--copper)' }}>Active Promo Codes</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {['KEEPNET1M', 'ANGLER30', 'CARP1MONTH', 'FREETRIAL30', 'SPECIMEN30'].map((code) => (
                      <span key={code} className="count-pill" style={{ fontSize: 11, background: 'rgba(201, 119, 43, 0.15)', color: 'var(--copper)', fontWeight: 700 }}>
                        <Tag size={10} style={{ marginRight: 3 }} />{code}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '12px 14px', background: 'var(--surface-sunken)', borderRadius: 10 }}>
                  <div className="eyebrow" style={{ color: '#10b981' }}>Membership access</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    <strong>Lite:</strong> £0 Free Forever · <strong>Premium:</strong> £1.49/mo or £10.49/yr
                  </div>
                </div>
              </div>

              {stats?.subscriptions?.breakdown && stats.subscriptions.breakdown.length > 0 ? (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Redemptions by Coupon Code</div>
                  <div className="stack" style={{ gap: 6 }}>
                    {stats.subscriptions.breakdown.map((b: any) => (
                      <div key={b.code} className="row-between" style={{ padding: '8px 12px', background: 'var(--surface-sunken)', borderRadius: 8, fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{b.code}</span>
                        <span className="badge">{b.count} redeemed</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  No coupon redemptions recorded in the cloud database yet. Anglers redeeming on the subscription page will appear here.
                </p>
              )}
            </div>

            {/* Growth Over Time Card */}
            <div className="card">
              <div className="row-between" style={{ alignItems: 'baseline', marginBottom: 12 }}>
                <div>
                  <h2 className="serif" style={{ fontSize: 17, margin: 0 }}>Activity & Growth Trends</h2>
                  <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    Daily reports and registration activity over the last 14 days
                  </p>
                </div>
                <span className="badge" style={{ fontSize: 12 }}>Live Cloudflare D1</span>
              </div>

              <div className="growth-bars-container">
                {stats?.growth?.catches && stats.growth.catches.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {stats.growth.catches.map((item: any) => (
                      <div key={item.date} className="growth-row">
                        <span className="growth-date">{item.date}</span>
                        <div className="growth-bar-track">
                          <div
                            className="growth-bar-fill"
                            style={{
                              width: `${Math.min(100, Math.max(12, (item.count / 10) * 100))}%`,
                            }}
                          >
                            <span className="growth-bar-val">{item.count} catches</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted" style={{ textAlign: 'center', padding: '24px 0', fontSize: 13 }}>
                    No historical logs in the 14-day window yet. New activity will generate daily trend bars automatically.
                  </div>
                )}
              </div>
            </div>

            {/* Top Species & Recent Catches Grid */}
            <div className="admin-split-grid">
              {/* Species Breakdown */}
              <div className="card">
                <h3 className="serif" style={{ fontSize: 16, marginBottom: 12 }}>Top Reported Species</h3>
                {stats?.species && stats.species.length > 0 ? (
                  <div className="stack" style={{ gap: 8 }}>
                    {stats.species.map((sp: any, i: number) => {
                      const maxLb = Math.floor(sp.max_oz / 16);
                      const maxRemOz = sp.max_oz % 16;
                      return (
                        <div key={sp.species} className="row-between" style={{ padding: '8px 12px', background: 'var(--surface-sunken)', borderRadius: 8, fontSize: 13 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, color: 'var(--copper)', width: 16 }}>#{i + 1}</span>
                            <span style={{ fontWeight: 600 }}>{sp.species}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span className="muted">{sp.count} logged</span>
                            <span style={{ fontWeight: 600, color: 'var(--accent-green)' }}>Best: {maxLb}lb {maxRemOz}oz</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted" style={{ fontSize: 13 }}>No species logged yet.</p>
                )}
              </div>

              {/* Latest Community Reports */}
              <div className="card">
                <h3 className="serif" style={{ fontSize: 16, marginBottom: 12 }}>Latest Catches Live Feed</h3>
                {stats?.recentCatches && stats.recentCatches.length > 0 ? (
                  <div className="stack" style={{ gap: 8 }}>
                    {stats.recentCatches.slice(0, 5).map((c: any) => (
                      <div key={c.id} className="row-between" style={{ padding: '8px 12px', background: 'var(--surface-sunken)', borderRadius: 8, fontSize: 13 }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.species} · {c.weight_lb}lb {c.weight_oz}oz</div>
                          <div className="muted" style={{ fontSize: 11 }}>by {c.user_name} · Bait: {c.bait}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className={`mini-badge ${c.is_shared ? 'shared' : 'private'}`}>
                            {c.is_shared ? 'Shared' : 'Private'}
                          </span>
                          <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>
                            {new Date(c.caught_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted" style={{ fontSize: 13 }}>No recent catches found.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: FISHERIES DIRECTORY ================= */}
        {tab === 'fisheries' && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <div className="row-between" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 160px', minWidth: 0 }}>
                  <Search size={16} className="muted" />
                  <input
                    type="text"
                    placeholder="Search UK fisheries by name, region, or lake type..."
                    value={fisherySearch}
                    onChange={(e) => setFisherySearch(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowAddFishery(!showAddFishery)}
                  style={{ fontSize: 13, padding: '8px 16px' }}
                >
                  <Plus size={16} /> {showAddFishery ? 'Cancel' : 'Add New Fishery'}
                </button>
              </div>

              {/* Add New Fishery Form */}
              {showAddFishery && (
                <form onSubmit={handleAddFisherySubmit} className="stack" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color)', gap: 12 }}>
                  <h3 className="serif" style={{ fontSize: 17 }}>Create New Verified Fishery</h3>
                  <div className="desktop-grid-2">
                    <label className="field">
                      <span>Fishery Name *</span>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Wyreside Lakes"
                        value={newFishery.name}
                        onChange={(e) => setNewFishery({ ...newFishery, name: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Type</span>
                      <input
                        type="text"
                        placeholder="e.g. Coarse Lakes & River"
                        value={newFishery.type}
                        onChange={(e) => setNewFishery({ ...newFishery, type: e.target.value })}
                      />
                    </label>
                  </div>

                  <div className="desktop-grid-2">
                    <label className="field">
                      <span>Latitude</span>
                      <input
                        type="number"
                        step="0.00001"
                        required
                        value={newFishery.lat}
                        onChange={(e) => setNewFishery({ ...newFishery, lat: parseFloat(e.target.value) || 0 })}
                      />
                    </label>
                    <label className="field">
                      <span>Longitude</span>
                      <input
                        type="number"
                        step="0.00001"
                        required
                        value={newFishery.lon}
                        onChange={(e) => setNewFishery({ ...newFishery, lon: parseFloat(e.target.value) || 0 })}
                      />
                    </label>
                  </div>

                  <div className="desktop-grid-2">
                    <label className="field">
                      <span>Region / County</span>
                      <input
                        type="text"
                        placeholder="e.g. Lancashire"
                        value={newFishery.region}
                        onChange={(e) => setNewFishery({ ...newFishery, region: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Website URL</span>
                      <input
                        type="url"
                        placeholder="https://example.com"
                        value={newFishery.website}
                        onChange={(e) => setNewFishery({ ...newFishery, website: e.target.value })}
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>Target Species (comma-separated)</span>
                    <input
                      type="text"
                      placeholder="Carp, Pike, Perch, Roach"
                      value={newFishery.targets}
                      onChange={(e) => setNewFishery({ ...newFishery, targets: e.target.value })}
                    />
                  </label>

                  <label className="field">
                    <span>Description & Angling Rules</span>
                    <textarea
                      rows={3}
                      placeholder="Ticket information, bait rules, opening times..."
                      value={newFishery.description}
                      onChange={(e) => setNewFishery({ ...newFishery, description: e.target.value })}
                    />
                  </label>

                  <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                    <Check size={16} /> Save Fishery to Database
                  </button>
                </form>
              )}
            </div>

            {/* Fisheries List */}
            <div className="stack" style={{ gap: 10 }}>
              <div className="muted" style={{ fontSize: 13, padding: '0 4px' }}>
                Showing {filteredFisheries.length} venues ({customFisheries.length} custom database entries)
              </div>
              {filteredFisheries.map((f) => {
                const isCustom = customFisheries.some((cf) => cf.id === f.id);
                return (
                  <div key={f.id} className="card fishery-admin-row">
                    <div className="row-between" style={{ alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 700 }}>{f.name}</span>
                          <span className="mini-badge shared">{f.type}</span>
                          {isCustom && <span className="admin-badge">Custom D1</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {f.region} · GPS: {f.lat.toFixed(4)}, {f.lon.toFixed(4)}
                        </div>
                        <p style={{ fontSize: 13, marginTop: 6, color: 'var(--text-secondary)' }}>
                          {f.description?.slice(0, 140)}...
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {f.website && (
                          <a
                            href={f.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="icon-btn"
                            title="Visit website"
                          >
                            <ExternalLink size={15} />
                          </a>
                        )}
                        {isCustom && (
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => handleDeleteFishery(f.id, f.name)}
                            title="Delete custom fishery"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 3: SPECIES TAGS ================= */}
        {tab === 'species' && (
          <div className="stack" style={{ gap: 20 }}>
            {/* Add Species Tag Card */}
            <div className="card">
              <h2 className="serif" style={{ fontSize: 17, marginBottom: 4 }}>Add Fish Species Tag</h2>
              <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
                These tags appear immediately in the "Add Catch" button for all anglers across the platform.
              </p>
              <form onSubmit={handleAddSpecies} className="row-between" style={{ gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  required
                  placeholder="e.g. Zander, Crucian carp, Catfish"
                  value={newSpeciesName}
                  onChange={(e) => setNewSpeciesName(e.target.value)}
                  style={{ flex: 1.5, minWidth: 200 }}
                />
                <select
                  value={newSpeciesCategory}
                  onChange={(e) => setNewSpeciesCategory(e.target.value)}
                  style={{ flex: 1, minWidth: 140, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                >
                  <option value="Coarse">Coarse</option>
                  <option value="Predator">Predator</option>
                  <option value="River">River</option>
                  <option value="Game">Game / Trout</option>
                  <option value="Specimen">Specimen</option>
                  <option value="Sea">Sea / Estuary</option>
                </select>
                <button type="submit" className="btn-primary" disabled={speciesSaving} style={{ padding: '10px 20px' }}>
                  <Plus size={16} /> Add Tag
                </button>
              </form>
            </div>

            {/* Current Tags Manager */}
            <div className="card">
              <div className="row-between" style={{ alignItems: 'baseline', marginBottom: 12 }}>
                <h3 className="serif" style={{ fontSize: 16 }}>Active Species Tags ({speciesList.length})</h3>
                <span className="muted" style={{ fontSize: 12 }}>Tap the trash icon to remove any tag</span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {speciesList.map((sp) => (
                  <div key={sp} className="admin-species-chip">
                    <Fish size={14} style={{ color: 'var(--accent-green)' }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{sp}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteSpecies(sp)}
                      className="chip-del-btn"
                      aria-label={`Remove ${sp}`}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: ANGLER ACCOUNTS ================= */}
        {tab === 'users' && (
          <div className="stack" style={{ gap: 16 }}>
            {/* Filter and Search Bar Card */}
            <div className="card" style={{ padding: 16 }}>
              <div className="row-between" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 160px', minWidth: 0 }}>
                  <Search size={16} className="muted" />
                  <input
                    type="text"
                    placeholder="Search by angler nickname or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {userSearch && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setUserSearch('')}
                      aria-label="Clear search"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={fetchUsers}
                    disabled={usersLoading}
                    style={{ fontSize: 13, padding: '7px 12px' }}
                    title="Reload Anglers"
                  >
                    <RefreshCw size={14} className={usersLoading ? 'spin' : ''} />
                    <span>Refresh</span>
                  </button>
                  <span className="badge" style={{ fontSize: 12, fontWeight: 700 }}>
                    {usersList.length} {usersList.length === 1 ? 'Angler' : 'Anglers'}
                  </span>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="angler-filter-bar">
                <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>Tier:</span>
                {(['all', 'lite', 'premium'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    className={`angler-filter-pill ${userTierFilter === tier ? 'active' : ''}`}
                    onClick={() => setUserTierFilter(tier)}
                  >
                    {tier === 'all' ? 'All Plans' : tier === 'premium' ? 'Premium Suite' : 'Lite Free'}
                  </button>
                ))}

                <span className="muted" style={{ fontSize: 12, margin: '0 4px 0 12px' }}>Status:</span>
                {(['all', 'active', 'locked', 'admin'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`angler-filter-pill ${userStatusFilter === st ? 'active' : ''}`}
                    onClick={() => setUserStatusFilter(st)}
                  >
                    {st === 'all' ? 'All Status' : st === 'active' ? 'Active' : st === 'locked' ? 'Locked' : 'Admins'}
                  </button>
                ))}
              </div>
            </div>

            {/* Angler Accounts List */}
            {usersLoading && usersList.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px', color: 'var(--accent-green)' }} />
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>Loading registered anglers from Cloudflare D1...</p>
              </div>
            ) : usersList.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
                <Users size={32} className="muted" style={{ margin: '0 auto 12px' }} />
                <h3 className="serif" style={{ fontSize: 16, margin: '0 0 6px' }}>No Anglers Found</h3>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  No accounts matched your search or filter criteria.
                </p>
              </div>
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                {usersList.map((u: any) => {
                  const isLocked = Boolean(u.locked_until && nowTime < Number(u.locked_until));
                  const isOwnerAccount = u.email === 'aransmithson@gmail.com' || u.email === 'aransmithson@googlemail.com';
                  const isPremiumTier = u.subscription_tier === 'premium';
                  const isEditingThisUser = editingUserId === u.id;
                  const isManagingSubThisUser = managingSubUserId === u.id;
                  const isBusy = actionLoadingUserId === u.id;

                  return (
                    <div
                      key={u.id}
                      className={`card angler-admin-card ${isLocked ? 'is-locked' : ''} ${isPremiumTier ? 'is-premium' : ''}`}
                    >
                      {/* Top Header Row */}
                      <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {/* Nickname & Inline Edit */}
                            {isEditingThisUser ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <input
                                  type="text"
                                  value={editNickname}
                                  onChange={(e) => setEditNickname(e.target.value)}
                                  placeholder="Enter new nickname..."
                                  style={{ padding: '4px 8px', fontSize: 14, height: 32, borderRadius: 6, minWidth: 160 }}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveNickname(u.id);
                                    if (e.key === 'Escape') setEditingUserId(null);
                                  }}
                                />
                                <button
                                  type="button"
                                  className="btn-primary"
                                  style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                                  onClick={() => handleSaveNickname(u.id)}
                                  disabled={isBusy}
                                  title="Save nickname"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ height: 32, padding: '0 8px' }}
                                  onClick={() => setEditingUserId(null)}
                                  title="Cancel"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {u.nickname || u.name || 'Anonymous Angler'}
                                </span>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  style={{ width: 26, height: 26 }}
                                  onClick={() => {
                                    setEditingUserId(u.id);
                                    setEditNickname(u.nickname || u.name || '');
                                  }}
                                  title="Edit angler nickname"
                                >
                                  <Edit2 size={12} />
                                </button>
                              </div>
                            )}

                            {/* Status Badges */}
                            {isOwnerAccount && (
                              <span className="admin-badge" title="Platform Owner">
                                <ShieldCheck size={11} /> Owner
                              </span>
                            )}
                            {!isOwnerAccount && u.is_admin === 1 && (
                              <span className="admin-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.35)' }}>
                                <Shield size={11} /> Admin
                              </span>
                            )}
                            {isLocked && (
                              <span className="mini-badge" style={{ background: 'var(--danger)', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Lock size={10} /> Locked ({u.failed_logins} failed)
                              </span>
                            )}
                            {isPremiumTier ? (
                              <span
                                className="mini-badge"
                                style={{
                                  borderColor: 'rgba(201, 119, 43, 0.4)',
                                  background: 'rgba(201, 119, 43, 0.12)',
                                  color: 'var(--copper)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontWeight: 700,
                                }}
                              >
                                <Crown size={12} /> Premium {u.applied_coupon ? `(${u.applied_coupon})` : 'Active'}
                              </span>
                            ) : (
                              <span className="mini-badge" style={{ opacity: 0.75, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                Lite (Free)
                              </span>
                            )}
                          </div>

                          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                            {u.email}
                          </div>
                        </div>

                        {/* Top Right: Subscription Expiry / Quick Info */}
                        <div style={{ textAlign: 'right', fontSize: 12 }}>
                          {isPremiumTier ? (
                            <div style={{ color: 'var(--copper)', fontWeight: 600 }}>
                              {u.subscription_expires_at
                                ? `Expires ${new Date(u.subscription_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                : 'Lifetime / Permanent VIP'}
                            </div>
                          ) : (
                            <div className="muted">Keepnet Lite · £0 Forever</div>
                          )}
                        </div>
                      </div>

                      {/* Stat Chips Row */}
                      <div className="angler-stat-chips">
                        <span className="angler-stat-chip">
                          <Fish size={12} color="var(--accent-green)" />
                          <span>{u.catch_count || 0} catches</span>
                        </span>
                        <span className="angler-stat-chip">
                          <Calendar size={12} color="#2F80ED" />
                          <span>{u.session_count || 0} sessions</span>
                        </span>
                        <span className="angler-stat-chip">
                          <Cloud size={12} />
                          <span>Sync: {u.storage_mode || 'cloud'}</span>
                        </span>
                        <span className="angler-stat-chip">
                          <Clock size={12} />
                          <span>Joined: {new Date(u.created_at).toLocaleDateString('en-GB')}</span>
                        </span>
                        {isLocked && (
                          <span className="angler-stat-chip" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}>
                            <AlertTriangle size={12} />
                            <span>Locked until {new Date(Number(u.locked_until)).toLocaleString('en-GB')}</span>
                          </span>
                        )}
                      </div>

                      {/* Feedback notification if triggered */}
                      {actionFeedback && actionFeedback.userId === u.id && (
                        <div
                          className={`auth-message ${actionFeedback.type === 'success' ? 'success' : 'error'}`}
                          style={{ margin: 0, padding: '8px 12px', fontSize: 12 }}
                        >
                          <CheckCircle2 size={14} />
                          <span>{actionFeedback.message}</span>
                        </div>
                      )}

                      {/* Expandable Subscription Granter Drawer */}
                      {isManagingSubThisUser && (
                        <div className="angler-sub-drawer">
                          <div className="row-between" style={{ alignItems: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Crown size={15} color="var(--copper)" />
                              <span>Administer Subscription for {u.nickname || u.name}</span>
                            </div>
                            <button
                              type="button"
                              className="icon-btn"
                              style={{ width: 24, height: 24 }}
                              onClick={() => setManagingSubUserId(null)}
                            >
                              <X size={14} />
                            </button>
                          </div>

                          <div className="angler-sub-options">
                            <button
                              type="button"
                              className="angler-btn-action success"
                              disabled={isBusy}
                              onClick={() => handleUpdateSubscription(u.id, 'premium', 30, 'ADMIN_1M')}
                            >
                              <Gift size={13} /> Grant 1-Month Trial (30d)
                            </button>
                            <button
                              type="button"
                              className="angler-btn-action success"
                              disabled={isBusy}
                              onClick={() => handleUpdateSubscription(u.id, 'premium', 365, 'ADMIN_1Y')}
                            >
                              <Crown size={13} /> Grant 1-Year Pass (365d)
                            </button>
                            <button
                              type="button"
                              className="angler-btn-action success"
                              disabled={isBusy}
                              onClick={() => handleUpdateSubscription(u.id, 'premium', null, 'ADMIN_VIP')}
                            >
                              <Sparkles size={13} /> Grant Lifetime VIP (No Expiry)
                            </button>
                            {isPremiumTier && (
                              <button
                                type="button"
                                className="angler-btn-action warning"
                                disabled={isBusy}
                                onClick={() => handleUpdateSubscription(u.id, 'lite', null)}
                              >
                                Return to Keepnet Lite (Free)
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Main Action Bar */}
                      <div className="angler-action-bar">
                        {/* Manage Subscription Button */}
                        <button
                          type="button"
                          className={`angler-btn-action ${isManagingSubThisUser ? 'warning' : ''}`}
                          onClick={() => setManagingSubUserId(isManagingSubThisUser ? null : u.id)}
                          disabled={isBusy}
                        >
                          <Crown size={13} color="var(--copper)" />
                          <span>{isManagingSubThisUser ? 'Close Sub Menu' : 'Manage Subscription'}</span>
                        </button>

                        {/* Lock / Unlock Buttons */}
                        {isLocked ? (
                          <button
                            type="button"
                            className="angler-btn-action success"
                            onClick={() => handleUnlockUser(u.id)}
                            disabled={isBusy}
                            title="Unlock account and clear failed logins"
                          >
                            <Unlock size={13} />
                            <span>Unlock Account</span>
                          </button>
                        ) : !isOwnerAccount ? (
                          <button
                            type="button"
                            className="angler-btn-action warning"
                            onClick={() => handleLockUser(u.id, 7)}
                            disabled={isBusy}
                            title="Suspend/lock account for 7 days"
                          >
                            <Lock size={13} />
                            <span>Lock Account (7d)</span>
                          </button>
                        ) : null}

                        {/* Admin Privilege Toggle */}
                        {!isOwnerAccount ? (
                          <button
                            type="button"
                            className="angler-btn-action"
                            onClick={() => handleToggleAdmin(u.id, u.is_admin === 1)}
                            disabled={isBusy}
                          >
                            <Shield size={13} />
                            <span>{u.is_admin === 1 ? 'Revoke Admin' : 'Grant Admin'}</span>
                          </button>
                        ) : null}

                        {/* Delete User Button (Owner protected) */}
                        {!isOwnerAccount && (
                          <button
                            type="button"
                            className="angler-btn-action danger"
                            style={{ marginLeft: 'auto' }}
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            disabled={isBusy}
                            title="Permanently delete user and their cloud records"
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: DATABASE BACKUP ================= */}
        {tab === 'backup' && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
              <Download size={44} style={{ color: 'var(--accent-green)', margin: '0 auto 16px' }} />
              <h2 className="serif" style={{ fontSize: 20, marginBottom: 8 }}>Export Database Backup</h2>
              <p className="muted" style={{ fontSize: 13, maxWidth: 460, margin: '0 auto 20px' }}>
                Download a complete, structured JSON export of all database tables (Users, Sessions, Catches, Custom Fisheries, and Species Tags).
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={handleDownloadBackup}
                style={{ margin: '0 auto', padding: '12px 24px', fontSize: 14 }}
              >
                <Download size={16} /> Download Full Database JSON
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
