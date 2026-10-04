import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type MapMarker = { id: string; lat: number; lon: number; title: string; label?: string; kind: 'venue' | 'custom' };

export interface MapEngine {
  name: 'google' | 'leaflet';
  setMarkers(markers: MapMarker[], onClick: (id: string) => void): void;
  flyTo(lat: number, lon: number, zoom?: number): void;
  showMe(lat: number, lon: number): void;
  destroy(): void;
}

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY as string | undefined;

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const GREEN = '#014731';
const COPPER = '#C9772B';

/* ---------------- Google Maps ---------------- */

let googlePromise: Promise<void> | null = null;

declare global {
  interface Window { __keepnetGmInit?: () => void; gm_authFailure?: () => void }
}

function loadGoogle(key: string): Promise<void> {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (googlePromise) return googlePromise;
  googlePromise = new Promise((resolve, reject) => {
    window.__keepnetGmInit = () => resolve();
    window.gm_authFailure = () => {
      console.warn('[Keepnet] Google Maps rejected the API key — falling back to Leaflet CARTO.');
      window.dispatchEvent(new Event('keepnet:gm-auth-failure'));
    };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__keepnetGmInit`;
    s.async = true;
    s.onerror = () => { googlePromise = null; reject(new Error('Google Maps failed to load')); };
    document.head.appendChild(s);
  });
  return googlePromise;
}

const GOOGLE_LIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#efece2' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5a5a5a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f3eb' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d6e3c8' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#e3e8d2' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f1e3c6' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#a9cfd6' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#2f6b75' }] },
];

const GOOGLE_DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#131e18' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8fa89b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1511' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f2f27' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a3d33' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#091f1a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#2eb872' }] },
];

const pinSvg = (fill: string) =>
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><path d="M18 42s14-13.5 14-24A14 14 0 0 0 4 18c0 10.5 14 24 14 24z" fill="${fill}" stroke="#fff" stroke-width="3"/></svg>`);

async function createGoogle(el: HTMLElement, center: [number, number], zoom: number, isDark: boolean): Promise<MapEngine> {
  await loadGoogle(GOOGLE_KEY!);
  const map = new google.maps.Map(el, {
    center: { lat: center[0], lng: center[1] },
    zoom,
    styles: isDark ? GOOGLE_DARK_STYLE : GOOGLE_LIGHT_STYLE,
    disableDefaultUI: true,
    zoomControl: true,
    gestureHandling: 'greedy',
    clickableIcons: false,
  });
  let markers: google.maps.Marker[] = [];
  let me: google.maps.Marker | null = null;
  return {
    name: 'google',
    setMarkers(list, onClick) {
      markers.forEach((m) => m.setMap(null));
      markers = list.map((m) => {
        const mk = new google.maps.Marker({
          map,
          position: { lat: m.lat, lng: m.lon },
          title: m.title,
          icon: { url: pinSvg(m.kind === 'venue' ? (isDark ? '#2EB872' : GREEN) : COPPER), scaledSize: new google.maps.Size(32, 40), labelOrigin: new google.maps.Point(16, 15) },
          label: m.label ? { text: m.label, color: '#fff', fontSize: '11px', fontWeight: '700' } : undefined,
        });
        mk.addListener('click', () => onClick(m.id));
        return mk;
      });
    },
    flyTo(lat, lon, z = 13) { map.panTo({ lat, lng: lon }); map.setZoom(z); },
    showMe(lat, lon) {
      me?.setMap(null);
      me = new google.maps.Marker({
        map, position: { lat, lng: lon }, title: 'You are here',
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#2F80ED', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
      });
      map.panTo({ lat, lng: lon }); map.setZoom(12);
    },
    destroy() { markers.forEach((m) => m.setMap(null)); me?.setMap(null); el.innerHTML = ''; },
  };
}

/* ---------------- Leaflet (CARTO with verified key + Esri fallback) ---------------- */

const leafletPin = (cls: string, label = '') => {
  const safeCls = escapeHtml(cls);
  const safeLabel = escapeHtml(label);
  return L.divIcon({
    className: '',
    html: `<div class="map-pin ${safeCls}"><span>${safeLabel}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
};

function createLeaflet(el: HTMLElement, center: [number, number], zoom: number, isDark: boolean): MapEngine {
  const map = L.map(el, { zoomControl: false }).setView(center, zoom);

  // CARTO basemap with clean Dark Matter / Voyager styles
  const cartoStyle = isDark ? 'dark_all' : 'voyager';
  const tileUrl = CARTO_KEY
    ? `https://{s}.basemaps.cartocdn.com/rastertiles/${cartoStyle}/{z}/{x}/{y}.png?key=${encodeURIComponent(CARTO_KEY)}`
    : `https://{s}.basemaps.cartocdn.com/rastertiles/${cartoStyle}/{z}/{x}/{y}.png`;

  L.tileLayer(tileUrl, {
    maxZoom: 20,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  setTimeout(() => map.invalidateSize(), 50);

  return {
    name: 'leaflet',
    setMarkers(list, onClick) {
      layer.clearLayers();
      list.forEach((m) =>
        L.marker([m.lat, m.lon], { icon: leafletPin(m.kind, m.label) })
          .addTo(layer)
          .bindTooltip(m.title, { direction: 'top', offset: [0, -28] })
          .on('click', () => onClick(m.id)),
      );
    },
    flyTo(lat, lon, z = 13) { map.flyTo([lat, lon], z, { duration: 0.8 }); },
    showMe(lat, lon) {
      L.circleMarker([lat, lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#2F80ED', fillOpacity: 1 }).addTo(map);
      map.flyTo([lat, lon], 12);
    },
    destroy() { map.remove(); },
  };
}

/** Creates map engine: Google Maps if configured, or Leaflet CARTO with verified key. */
export async function createMap(
  el: HTMLElement,
  center: [number, number],
  zoom: number,
  isDark = false,
  forceFallback = false
): Promise<MapEngine> {
  if (GOOGLE_KEY && !forceFallback) {
    try {
      return await createGoogle(el, center, zoom, isDark);
    } catch (e) {
      console.warn('[Keepnet] Google Maps unavailable, using CARTO', e);
    }
  }
  return createLeaflet(el, center, zoom, isDark);
}
