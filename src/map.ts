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
    // Google calls this when the key is invalid / referrer not allowed / billing disabled
    window.gm_authFailure = () => {
      console.warn('[Keepnet] Google Maps rejected the API key — falling back to OpenStreetMap.');
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

/** Muted, earthy style to match the Keepnet palette (water highlighted). */
const GOOGLE_STYLE: google.maps.MapTypeStyle[] = [
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

const pinSvg = (fill: string) =>
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><path d="M18 42s14-13.5 14-24A14 14 0 0 0 4 18c0 10.5 14 24 14 24z" fill="${fill}" stroke="#fff" stroke-width="3"/></svg>`);

async function createGoogle(el: HTMLElement, center: [number, number], zoom: number): Promise<MapEngine> {
  await loadGoogle(GOOGLE_KEY!);
  const map = new google.maps.Map(el, {
    center: { lat: center[0], lng: center[1] },
    zoom,
    styles: GOOGLE_STYLE,
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
          icon: { url: pinSvg(m.kind === 'venue' ? GREEN : COPPER), scaledSize: new google.maps.Size(32, 40), labelOrigin: new google.maps.Point(16, 15) },
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

/* ---------------- Leaflet / OpenStreetMap fallback ---------------- */

const leafletPin = (cls: string, label = '') =>
  L.divIcon({ className: '', html: `<div class="map-pin ${cls}"><span>${label}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });

function createLeaflet(el: HTMLElement, center: [number, number], zoom: number): MapEngine {
  const map = L.map(el, { zoomControl: false }).setView(center, zoom);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: '&copy; Esri, USGS, Ordnance Survey',
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

/** Google Maps when a key is configured, otherwise (or on failure) OpenStreetMap. */
export async function createMap(el: HTMLElement, center: [number, number], zoom: number, forceFallback = false): Promise<MapEngine> {
  if (GOOGLE_KEY && !forceFallback) {
    try {
      return await createGoogle(el, center, zoom);
    } catch (e) {
      console.warn('[Keepnet] Google Maps unavailable, using OpenStreetMap', e);
    }
  }
  return createLeaflet(el, center, zoom);
}
