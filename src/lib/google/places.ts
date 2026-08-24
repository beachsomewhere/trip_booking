import 'server-only';

/**
 * Google Places API (New) — server-side only.
 *
 * Every call is proxied through /api/places/* so GOOGLE_MAPS_API_KEY never
 * reaches the browser. Photos are proxied too, since a Places photo URL embeds
 * the key.
 *
 * Two limits worth knowing, because they shape the lodging phase:
 *   * Places returns no capacity ("sleeps 8") and no nightly rate. Only a
 *     coarse priceLevel. Families annotate capacity by hand.
 *   * searchNearby caps the circle at 50 km.
 */

const BASE = 'https://places.googleapis.com/v1';
const MILES_TO_M = 1609.34;
export const MAX_RADIUS_MI = 31; // 50 km, the Places circle limit.

export function isPlacesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

function key(): string {
  const k = process.env.GOOGLE_MAPS_API_KEY;
  if (!k) throw new PlacesNotConfiguredError();
  return k;
}

export class PlacesNotConfiguredError extends Error {
  constructor() {
    super('Google Places is not configured on this deployment.');
    this.name = 'PlacesNotConfiguredError';
  }
}

export interface PlaceSuggestion {
  placeId: string;
  primary: string;
  secondary: string;
}

export interface PlaceDetail {
  placeId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  photoName: string | null;
  rating: number | null;
  websiteUri: string | null;
  mapsUri: string | null;
  priceLevel: string | null;
}

interface AutocompleteResponse {
  suggestions?: {
    placePrediction?: {
      placeId: string;
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      text?: { text?: string };
    };
  }[];
}

export async function autocomplete(input: string): Promise<PlaceSuggestion[]> {
  if (input.trim().length < 2) return [];

  const res = await fetch(`${BASE}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key() },
    body: JSON.stringify({ input }),
    // Suggestions for the same prefix are stable enough to cache briefly.
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error(`Places autocomplete failed (${res.status}): ${await res.text()}`);

  const json = (await res.json()) as AutocompleteResponse;
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .map((p) => ({
      placeId: p.placeId,
      primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? 'Unnamed place',
      secondary: p.structuredFormat?.secondaryText?.text ?? '',
    }));
}

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  photos?: { name?: string }[];
  rating?: number;
  websiteUri?: string;
  googleMapsUri?: string;
  priceLevel?: string;
}

const DETAIL_FIELDS =
  'id,displayName,formattedAddress,location,photos,rating,websiteUri,googleMapsUri,priceLevel';

function toDetail(p: RawPlace): PlaceDetail {
  return {
    placeId: p.id ?? '',
    name: p.displayName?.text ?? 'Unnamed place',
    address: p.formattedAddress ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    photoName: p.photos?.[0]?.name ?? null,
    rating: p.rating ?? null,
    websiteUri: p.websiteUri ?? null,
    mapsUri: p.googleMapsUri ?? null,
    priceLevel: p.priceLevel ?? null,
  };
}

export async function placeDetails(placeId: string): Promise<PlaceDetail> {
  const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': DETAIL_FIELDS },
    next: { revalidate: 86_400 },
  });
  if (!res.ok) throw new Error(`Place details failed (${res.status}): ${await res.text()}`);
  return toDetail((await res.json()) as RawPlace);
}

/** Maps our housing types onto the Places type vocabulary. */
export const PLACE_TYPES: Record<string, string[]> = {
  hotel: ['hotel', 'motel'],
  short_term_rental: ['guest_house', 'cottage', 'apartment_complex'],
  resort: ['resort_hotel'],
  cabin: ['cottage', 'campground'],
  hostel: ['hostel'],
};

export async function searchLodging(opts: {
  lat: number;
  lng: number;
  radiusMi: number;
  housingTypes?: string[];
  limit?: number;
}): Promise<PlaceDetail[]> {
  const radiusM = Math.min(opts.radiusMi, MAX_RADIUS_MI) * MILES_TO_M;

  const included = [
    ...new Set((opts.housingTypes ?? []).flatMap((t) => PLACE_TYPES[t] ?? [])),
  ];

  const res = await fetch(`${BASE}/places:searchNearby`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key(),
      'X-Goog-FieldMask': DETAIL_FIELDS.split(',')
        .map((f) => `places.${f}`)
        .join(','),
    },
    body: JSON.stringify({
      // Falling back to the broad `lodging` type matters: the narrow types
      // return almost nothing outside dense cities.
      includedTypes: included.length > 0 ? included : ['lodging'],
      maxResultCount: Math.min(opts.limit ?? 20, 20),
      rankPreference: 'POPULARITY',
      locationRestriction: {
        circle: { center: { latitude: opts.lat, longitude: opts.lng }, radius: radiusM },
      },
    }),
    next: { revalidate: 3600 },
  });

  if (!res.ok) throw new Error(`Lodging search failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { places?: RawPlace[] };
  return (json.places ?? []).map(toDetail);
}

/** Proxied photo URL — the raw Places media URL would leak the API key. */
export function photoProxyUrl(photoName: string, maxHeightPx = 400): string {
  return `/api/places/photo?name=${encodeURIComponent(photoName)}&h=${maxHeightPx}`;
}

export async function fetchPhoto(photoName: string, maxHeightPx: number): Promise<Response> {
  return fetch(
    `${BASE}/${photoName}/media?maxHeightPx=${maxHeightPx}&key=${key()}`,
    { next: { revalidate: 86_400 } },
  );
}
