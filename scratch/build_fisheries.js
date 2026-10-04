import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '..', 'keepnet_uk_fisheries', 'keepnet_uk_fisheries.json');
const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

function formatType(str) {
  if (!str) return 'Coarse fishery';
  return str.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').replace(' And ', ' & ');
}

function formatAccess(str) {
  if (!str) return 'Day Ticket';
  return str.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function cap(s) {
  if (!s) return '';
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const records = raw.records.map(r => ({
  id: r.id,
  name: r.name,
  type: formatType(r.fishery_type),
  lat: r.latitude ?? 0,
  lon: r.longitude ?? 0,
  targets: (r.species || []).map(cap),
  description: r.access_notes || r.verification_notes || '',
  country: r.country,
  region: r.region || '',
  nearestTown: r.nearest_town || null,
  address: r.address || null,
  postcode: r.postcode || null,
  hasCoordinates: !!r.has_coordinates && r.latitude !== null && r.longitude !== null,
  coordinatePrecision: r.coordinate_precision,
  needsPinReview: !!r.needs_pin_review,
  website: r.website || null,
  accessType: formatAccess(r.access_type),
  fisheryType: formatType(r.fishery_type),
  accessNotes: r.access_notes || '',
  verificationNotes: r.verification_notes || '',
  sourceUrl: r.source_url || (r.source_urls && r.source_urls[0]) || null,
  sourceUrls: r.source_urls || [],
}));

const content = `import type { Venue } from './store';

export type Fishery = Venue & {
  country: string;
  region: string;
  nearestTown: string | null;
  address: string | null;
  postcode: string | null;
  hasCoordinates: boolean;
  coordinatePrecision: string;
  needsPinReview: boolean;
  website: string | null;
  accessType: string;
  fisheryType: string;
  accessNotes: string;
  verificationNotes: string;
  sourceUrl: string | null;
  sourceUrls: string[];
};

export const UK_FISHERIES: Fishery[] = ${JSON.stringify(records, null, 2)};

export const MAP_FISHERIES: Fishery[] = UK_FISHERIES.filter((f) => f.hasCoordinates);
`;

const outPath = path.join(__dirname, '..', 'src', 'fisheries.ts');
fs.writeFileSync(outPath, content, 'utf8');
console.log('Successfully wrote src/fisheries.ts with ' + records.length + ' records (' + records.filter(r => r.hasCoordinates).length + ' with map coordinates).');
