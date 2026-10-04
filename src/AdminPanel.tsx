import { useState, useEffect } from 'react';
import {
  ShieldAlert, Users, Fish, Calendar, TrendingUp, RefreshCw, Plus, Trash2,
  ExternalLink, Search, Download, Check, X, Shield, MapPin, AlertCircle, ArrowLeft
} from 'lucide-react';
import { useAuth, isUserAdmin } from './auth';
import { UK_FISHERIES, type Fishery } from './fisheries';

type AdminTab = 'dashboard' | 'fisheries' | 'species' | 'users' | 'backup';

export const AdminPanel = ({ onClose }: { onClose: () => void }) => {
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

  const getHeaders = () => {
    const token = sessionStorage.getItem('keepnet:auth_token') || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const getAdminQuery = () => `adminEmail=${encodeURIComponent(user?.email || 'aransmithson@gmail.com')}`;

  const fetchDashboardStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stats?${getAdminQuery()}`, {
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
      const res = await fetch(`/api/admin/fisheries?${getAdminQuery()}`, {
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

  useEffect(() => {
    if (isUserAdmin(user)) {
      fetchDashboardStats();
      fetchSpecies();
      fetchCustomFisheries();
    }
  }, [user]);

  // Handle Species Add/Delete
  const handleAddSpecies = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpeciesName.trim()) return;
    setSpeciesSaving(true);
    try {
      const res = await fetch(`/api/species?${getAdminQuery()}`, {
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
      const res = await fetch(`/api/species?${getAdminQuery()}`, {
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
      const res = await fetch(`/api/admin/fisheries?${getAdminQuery()}`, {
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
      const res = await fetch(`/api/admin/fisheries?id=${encodeURIComponent(id)}&${getAdminQuery()}`, {
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
      const res = await fetch(`/api/admin/backup?${getAdminQuery()}`, {
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
      <div className="admin-overlay">
        <div className="card" style={{ maxWidth: 440, margin: '60px auto', padding: 24, textAlign: 'center' }}>
          <ShieldAlert size={48} color="var(--danger)" style={{ margin: '0 auto 12px' }} />
          <h2 className="serif" style={{ fontSize: 20, marginBottom: 8 }}>Access Denied</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            The Keepnet Admin Console is restricted strictly to authorized platform administrators ({user?.email || 'Guest'}).
          </p>
          <button className="btn-primary" onClick={onClose}>
            Back to App
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
          <button className="icon-btn" onClick={onClose} aria-label="Exit Admin">
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
          <button className="icon-btn" onClick={onClose} aria-label="Close Admin">
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 240 }}>
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
            <div className="card">
              <div className="row-between" style={{ alignItems: 'baseline', marginBottom: 12 }}>
                <div>
                  <h2 className="serif" style={{ fontSize: 17, margin: 0 }}>Registered Angler Accounts</h2>
                  <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    Active accounts registered in Cloudflare D1
                  </p>
                </div>
                <span className="badge">{stats?.recentUsers?.length ?? 0} Accounts</span>
              </div>

              <div className="stack" style={{ gap: 8 }}>
                {stats?.recentUsers?.map((u: any) => {
                  const isLocked = u.locked_until && Date.now() < Number(u.locked_until);
                  const isOwnerAccount = u.email === 'aransmithson@gmail.com' || u.email === 'aransmithson@googlemail.com';
                  return (
                    <div key={u.id} className="row-between" style={{ padding: '12px 14px', background: 'var(--surface-sunken)', borderRadius: 10, fontSize: 13, alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{u.nickname || u.name}</span>
                          {isOwnerAccount && <span className="admin-badge">Owner</span>}
                          {isLocked && <span className="mini-badge" style={{ background: 'var(--danger)', color: '#fff' }}>Locked</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {u.email} · Mode: {u.storage_mode || 'cloud'} · Joined {new Date(u.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: u.failed_logins > 0 ? 'var(--danger)' : 'var(--muted)' }}>
                          Failed logins: {u.failed_logins || 0}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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
