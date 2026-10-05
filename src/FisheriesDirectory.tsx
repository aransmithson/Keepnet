import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Search, MapPin, Navigation as NavIcon,
  LocateFixed, Fish, Plus, X, Globe, Sparkles, Crown, Gift, ChevronRight, EyeOff, Compass, ShieldCheck
} from 'lucide-react';
import { UK_FISHERIES, calculateDistanceMiles, type Fishery } from './fisheries';
import { createMap, type MapEngine, type MapMarker } from './map';
import { getDevicePosition } from './weather';
import { useTheme } from './theme';
import { actions, type Venue } from './store';

export const FisheriesDirectory = ({ onStart }: { onStart: (v: Venue) => void }) => {
  const nav = useNavigate();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapEngine | null>(null);
  const [, setReady] = useState(0);
  const [fallback, setFallback] = useState(false);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState<string>('All');
  const [selectedFishery, setSelectedFishery] = useState<Fishery | null>(null);

  // User geolocation state
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Google Maps fallback listener
  useEffect(() => {
    const onFail = () => setFallback(true);
    window.addEventListener('keepnet:gm-auth-failure', onFail);
    return () => window.removeEventListener('keepnet:gm-auth-failure', onFail);
  }, []);

  const theme = useTheme();

  // Create map
  useEffect(() => {
    if (!el.current) return;
    let cancelled = false;
    let engine: MapEngine | null = null;
    el.current.innerHTML = '';
    const initialCenter: [number, number] = userLocation
      ? [userLocation.lat, userLocation.lon]
      : [53.5, -2.2];
    const initialZoom = userLocation ? 9 : 6;

    createMap(el.current, initialCenter, initialZoom, theme === 'dark', fallback).then((m) => {
      if (cancelled) { m.destroy(); return; }
      engine = m;
      map.current = m;
      setReady((n) => n + 1);
    });
    return () => { cancelled = true; engine?.destroy(); map.current = null; };
  }, [theme, fallback]);

  // Handle Find Fisheries Near Me
  const handleFindNearMe = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const pos = await getDevicePosition(10000);
      if (pos) {
        setUserLocation(pos);
        if (map.current) {
          map.current.flyTo(pos.lat, pos.lon, 9);
        }
      } else {
        setLocationError('Could not obtain GPS position. Please check your browser location permissions.');
      }
    } catch {
      setLocationError('Location request failed. Please check permissions.');
    } finally {
      setLocating(false);
    }
  };

  // Filter and sort fisheries by distance if user location is available
  const processedFisheries = useMemo(() => {
    let list = UK_FISHERIES;
    if (country !== 'All') {
      list = list.filter((f) => f.country === country);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((f) =>
        f.name.toLowerCase().includes(q) ||
        (f.region && f.region.toLowerCase().includes(q)) ||
        (f.nearestTown && f.nearestTown.toLowerCase().includes(q)) ||
        (f.postcode && f.postcode.toLowerCase().includes(q)) ||
        f.targets.some((sp) => sp.toLowerCase().includes(q))
      );
    }

    if (userLocation) {
      return [...list].map((f) => ({
        ...f,
        distanceMiles: f.hasCoordinates ? calculateDistanceMiles(userLocation.lat, userLocation.lon, f.lat, f.lon) : null,
      })).sort((a, b) => {
        if (a.distanceMiles === null) return 1;
        if (b.distanceMiles === null) return -1;
        return a.distanceMiles - b.distanceMiles;
      });
    }

    return list.map((f) => ({ ...f, distanceMiles: null as number | null }));
  }, [search, country, userLocation]);

  // Sync map markers
  useEffect(() => {
    if (!map.current) return;
    const markers: MapMarker[] = [];

    // User location marker
    if (userLocation) {
      markers.push({
        id: 'user-location-marker',
        lat: userLocation.lat,
        lon: userLocation.lon,
        title: 'Your Location',
        kind: 'custom',
      });
    }

    // Fisheries markers
    processedFisheries.slice(0, 75).forEach((f) => {
      if (f.hasCoordinates) {
        markers.push({
          id: f.id,
          lat: f.lat,
          lon: f.lon,
          title: `${f.name} · ${f.nearestTown || f.region}${f.distanceMiles !== null ? ` (${f.distanceMiles} mi)` : ''}`,
          kind: 'venue',
        });
      }
    });

    map.current.setMarkers(markers, (id) => {
      if (id === 'user-location-marker') return;
      const target = UK_FISHERIES.find((v) => v.id === id);
      if (target) {
        setSelectedFishery(target);
      }
    });
  }, [processedFisheries, userLocation]);

  const focusFishery = (f: Fishery) => {
    setSelectedFishery(f);
    if (map.current && f.hasCoordinates) {
      map.current.flyTo(f.lat, f.lon, 12);
      // Smooth scroll to map on mobile
      const mapEl = document.getElementById('fisheries-map-container');
      if (mapEl && window.innerWidth < 768) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  const countries = ['All', 'England', 'Wales', 'Scotland', 'Northern Ireland'];

  const isPremiumActive = actions.isPremium();

  // If user is on Lite tier (not Premium / Trial), show static benefits preview per monetisation plan
  if (!isPremiumActive) {
    const previewVenues = UK_FISHERIES.slice(0, 3);
    return (
      <div className="content fisheries-page">
        {/* Lite Free Forever Reassurance Banner */}
        <div className="lite-free-reassurance-banner">
          <div className="lite-free-reassurance-icon">
            <ShieldCheck size={20} />
          </div>
          <div className="lite-free-reassurance-content">
            <strong>Keepnet Lite is 100% Free Forever</strong>
            <span>Personal fishing sessions, custom swims, catches, weights, and offline mode will always remain completely free.</span>
          </div>
        </div>

        {/* Top Header */}
        <div className="page-header" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => nav(-1)}
            aria-label="Go back"
            id="fisheries-back-btn"
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--copper, #C9772B)' }}>
              <Crown size={13} /> Optional Community Directory
            </div>
            <h1 className="serif page-title" style={{ margin: 0, fontSize: 22 }}>
              UK Fisheries & Venues
            </h1>
          </div>
        </div>

        {/* Hero Benefits Card */}
        <div className="card discover-preview-hero">
          <div className="discover-preview-badge">
            <Sparkles size={14} /> Specimen Suite
          </div>
          <h2 className="serif" style={{ fontSize: 24, margin: '8px 0 6px' }}>
            60+ Verified UK Fisheries & Venues
          </h2>
          <p className="muted" style={{ fontSize: 13, maxWidth: 540, margin: '0 auto 16px', lineHeight: 1.5 }}>
            While your personal fishing journal is always 100% free with Keepnet Lite, Premium adds live GPS distance sorting, Google Maps turn-by-turn directions, and day-ticket intel for 60+ UK commercial waters.
          </p>

          <div className="discover-benefits-grid">
            <div className="discover-benefit-item">
              <Compass size={18} color="var(--accent-green)" />
              <div>
                <strong>Find Fisheries Near Me</strong>
                <span>GPS distance calculation to 60+ commercial waters</span>
              </div>
            </div>
            <div className="discover-benefit-item">
              <MapPin size={18} color="var(--accent-green)" />
              <div>
                <strong>Interactive Venue Map</strong>
                <span>Center on your location and view day-ticket pinpoints</span>
              </div>
            </div>
            <div className="discover-benefit-item">
              <NavIcon size={18} color="var(--copper, #C9772B)" />
              <div>
                <strong>Turn-by-Turn Directions</strong>
                <span>Direct navigation to fishery gates via Google Maps</span>
              </div>
            </div>
            <div className="discover-benefit-item">
              <Fish size={18} color="var(--copper, #C9772B)" />
              <div>
                <strong>Target Species & Rules</strong>
                <span>Researched fish stocks, ticket types and contact info</span>
              </div>
            </div>
          </div>

          <div className="discover-preview-actions">
            <button
              type="button"
              id="fisheries-start-trial-btn"
              className="btn-primary"
              style={{ height: 46, padding: '0 20px', fontSize: 14, gap: 8 }}
              onClick={() => actions.applyCoupon('KEEPNET1M')}
            >
              <Gift size={16} /> Start 1-Month Free Trial
            </button>

            <Link
              to="/subscription"
              id="fisheries-view-plans-btn"
              className="btn-secondary"
              style={{ height: 46, padding: '0 18px', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span>Unlock Premium (£1.49/mo or £10.49/yr)</span>
              <ChevronRight size={15} />
            </Link>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
            Keepnet Lite remains free forever · No credit card required · Never pay to log your catches
          </div>
        </div>

        {/* Static Sample Venues Showcase */}
        <div style={{ marginTop: 20 }}>
          <div className="static-preview-header">
            <div>
              <h2 className="serif" style={{ fontSize: 18, margin: 0 }}>Sample UK Fisheries</h2>
              <span className="muted" style={{ fontSize: 12 }}>60+ waters available in Keepnet Premium</span>
            </div>
            <span className="static-preview-pill">
              <EyeOff size={12} /> Static Preview
            </span>
          </div>

          <div className="card list-card">
            {previewVenues.map((f) => (
              <div key={f.id} className="list-row" style={{ textAlign: 'left', opacity: 0.9 }}>
                <div className="list-icon" style={{ background: 'rgba(1, 71, 49, 0.12)', color: 'var(--accent-green)' }}>
                  <MapPin size={18} />
                </div>
                <div className="catch-info" style={{ flex: 1 }}>
                  <div className="catch-species" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span>{f.name}</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--accent-light)', color: 'var(--accent-green)', borderRadius: 4, fontWeight: 600 }}>
                      {f.accessType || 'Day Ticket'}
                    </span>
                  </div>
                  <div className="catch-meta">
                    {f.nearestTown ? `${f.nearestTown}, ` : ''}{f.region} · {f.country}
                    {f.targets.length > 0 ? ` · Targets: ${f.targets.slice(0, 3).join(', ')}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="count-pill"
                  style={{ background: 'var(--accent-light)', color: 'var(--accent-green)', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none' }}
                  onClick={() => actions.applyCoupon('KEEPNET1M')}
                >
                  Unlock
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content fisheries-page">
      {/* Top Header */}
      <div className="page-header" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className="icon-btn"
          onClick={() => nav(-1)}
          aria-label="Go back"
          id="fisheries-back-btn"
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-green)' }}>
            <Fish size={13} /> UK Water Directory
          </div>
          <h1 className="serif page-title" style={{ margin: 0, fontSize: 22 }}>
            Fisheries & Venues
          </h1>
        </div>
      </div>

      {/* "Find Fisheries Near Me" Hero Action Card */}
      <div className="card find-near-me-card" style={{ marginBottom: 16 }}>
        <div className="row-between" style={{ alignItems: 'center', gap: 12 }}>
          <div>
            <h2 className="serif" style={{ fontSize: 16, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <LocateFixed size={18} color="var(--accent-green)" /> Find Fisheries Near Me
            </h2>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              {userLocation
                ? `GPS active · Showing ${processedFisheries.length} waters sorted closest to you`
                : 'Sort 60+ verified commercial lakes, syndicates and rivers by distance'}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ height: 38, padding: '0 14px', fontSize: 13, gap: 6, flexShrink: 0 }}
            onClick={handleFindNearMe}
            disabled={locating}
            id="locate-near-me-btn"
          >
            <LocateFixed size={15} className={locating ? 'spin' : ''} />
            <span>{locating ? 'Locating...' : userLocation ? 'Update GPS' : 'Find Near Me'}</span>
          </button>
        </div>

        {locationError && (
          <div className="auth-message error" style={{ marginTop: 10, fontSize: 12 }}>
            {locationError}
          </div>
        )}
      </div>

      {/* Search Input & Country Filter Chips */}
      <div className="search-wrap" style={{ marginBottom: 12 }}>
        <Search size={18} className="search-icon" />
        <input
          type="text"
          id="fisheries-search-input"
          placeholder="Search UK fisheries, towns, regions or species (Carp, Pike, Barbel)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search UK fisheries"
        />
        {search && (
          <button
            type="button"
            className="icon-btn search-clear-btn"
            onClick={() => setSearch('')}
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Country Filter Pills */}
      <div className="country-pills-row" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, marginBottom: 12 }}>
        {countries.map((c) => (
          <button
            key={c}
            type="button"
            className={`pill-btn ${country === c ? 'active' : ''}`}
            onClick={() => setCountry(c)}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid var(--border-color)',
              background: country === c ? 'var(--accent-green)' : 'var(--surface-sunken)',
              color: country === c ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Interactive Map Box */}
      <div
        id="fisheries-map-container"
        ref={el}
        className="map-container"
        style={{ height: 260, borderRadius: 14, marginBottom: 16, overflow: 'hidden' }}
      />

      {/* Selected Fishery Detail Card */}
      {selectedFishery && (
        <div className="card selected-fishery-card" style={{ marginBottom: 16, border: '1px solid var(--accent-green)' }}>
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="eyebrow" style={{ color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={12} /> {selectedFishery.region} · {selectedFishery.country}
              </div>
              <h2 className="serif" style={{ fontSize: 20, margin: '2px 0 4px' }}>
                {selectedFishery.name}
              </h2>
              {selectedFishery.nearestTown && (
                <div className="muted" style={{ fontSize: 13 }}>
                  Nearest town: <strong>{selectedFishery.nearestTown}</strong> {selectedFishery.postcode ? `(${selectedFishery.postcode})` : ''}
                </div>
              )}
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSelectedFishery(null)}
              aria-label="Close details"
            >
              <X size={18} />
            </button>
          </div>

          <div className="tag-row" style={{ marginTop: 10, marginBottom: 8 }}>
            <span className="tag" style={{ background: 'var(--accent-light)', color: 'var(--accent-green)', fontWeight: 600 }}>
              {selectedFishery.type}
            </span>
            <span className="tag">{selectedFishery.accessType || 'Day Ticket'}</span>
            {userLocation && (
              <span className="tag" style={{ background: 'rgba(201, 119, 43, 0.15)', color: 'var(--copper)', fontWeight: 700 }}>
                <LocateFixed size={11} /> {calculateDistanceMiles(userLocation.lat, userLocation.lon, selectedFishery.lat, selectedFishery.lon)} miles away
              </span>
            )}
          </div>

          {selectedFishery.targets.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Target species: </span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedFishery.targets.join(', ')}</span>
            </div>
          )}

          {selectedFishery.description && (
            <p className="muted" style={{ fontSize: 13, margin: '8px 0', lineHeight: 1.4 }}>
              {selectedFishery.description}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              style={{ flex: 1, minWidth: 160 }}
              onClick={() => {
                onStart(selectedFishery);
                nav('/sessions');
              }}
            >
              <Plus size={16} /> Start Session Here
            </button>

            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${selectedFishery.lat},${selectedFishery.lon}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
            >
              <NavIcon size={15} /> Directions
            </a>

            {selectedFishery.website && (
              <a
                href={selectedFishery.website}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
              >
                <Globe size={15} /> Website
              </a>
            )}
          </div>
        </div>
      )}

      {/* Fisheries List */}
      <div className="card list-card">
        <div className="row-between" style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
          <span className="eyebrow" style={{ margin: 0 }}>
            {processedFisheries.length} UK Waters Found
          </span>
          {userLocation && (
            <span className="muted" style={{ fontSize: 11 }}>
              Sorted by nearest distance
            </span>
          )}
        </div>

        {processedFisheries.length > 0 ? (
          processedFisheries.map((f) => {
            const isSelected = selectedFishery?.id === f.id;
            return (
              <button
                key={f.id}
                id={`fishery-row-${f.id}`}
                className={`list-row ${isSelected ? 'selected' : ''}`}
                onClick={() => focusFishery(f)}
                style={{ textAlign: 'left', width: '100%' }}
              >
                <div className="list-icon" style={{ background: 'rgba(1, 71, 49, 0.12)', color: 'var(--accent-green)' }}>
                  <Fish size={18} />
                </div>
                <div className="catch-info" style={{ flex: 1 }}>
                  <div className="catch-species" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{f.name}</span>
                    {f.distanceMiles !== null && (
                      <span className="count-pill" style={{ fontSize: 10, background: 'rgba(201, 119, 43, 0.15)', color: 'var(--copper)', fontWeight: 700 }}>
                        {f.distanceMiles} mi
                      </span>
                    )}
                  </div>
                  <div className="catch-meta">
                    {f.nearestTown ? `${f.nearestTown}, ` : ''}{f.region} · {f.type}
                  </div>
                  {f.targets.length > 0 && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                      {f.targets.slice(0, 4).join(', ')}
                    </div>
                  )}
                </div>
                <span className="count-pill" style={{ fontSize: 11 }}>
                  {f.accessType || 'Day Ticket'}
                </span>
              </button>
            );
          })
        ) : (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>No fisheries match your search</p>
            <p className="muted" style={{ fontSize: 13 }}>
              Try searching for another UK town, county, or target species name.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FisheriesDirectory;
