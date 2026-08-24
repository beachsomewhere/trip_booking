import { NextResponse, type NextRequest } from 'next/server';
import { isPlacesConfigured, photoProxyUrl, searchLodging } from '@/lib/google/places';
import { createClient, getUser } from '@/lib/supabase/server';

/**
 * Lodging inside the trip's agreed circle.
 *
 * The search parameters come from the trip row, not the query string, so a
 * member cannot use this as a general-purpose billable Places relay.
 */
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const tripId = request.nextUrl.searchParams.get('tripId');
  if (!tripId) return NextResponse.json({ error: 'tripId is required.' }, { status: 400 });

  if (!isPlacesConfigured()) {
    return NextResponse.json({ configured: false, places: [] });
  }

  // RLS means a non-member simply gets no row back.
  const supabase = await createClient();
  const { data: trip } = await supabase
    .from('trips')
    .select(
      'anchor_lat, anchor_lng, anchor_radius_mi, destination_lat, destination_lng, housing_types',
    )
    .eq('id', tripId)
    .maybeSingle();

  // The `anchor_*` columns are what the retired area step used to set. They are
  // now seeded from the destination, but fall back explicitly so a trip that
  // predates that, or one whose destination was typed as free text, still
  // behaves sensibly.
  const lat = trip?.anchor_lat ?? trip?.destination_lat ?? null;
  const lng = trip?.anchor_lng ?? trip?.destination_lng ?? null;

  // A destination with no map pin (possible when Places is unconfigured) is a
  // normal state, not an error — the group just adds links by hand instead.
  if (lat == null || lng == null) {
    return NextResponse.json({ configured: true, places: [], noCoordinates: true });
  }

  try {
    const places = await searchLodging({
      lat,
      lng,
      radiusMi: Number(trip?.anchor_radius_mi ?? 15),
      housingTypes: trip?.housing_types ?? undefined,
    });

    return NextResponse.json({
      configured: true,
      places: places.map((p) => ({
        ...p,
        photoUrl: p.photoName ? photoProxyUrl(p.photoName) : null,
      })),
    });
  } catch (err) {
    console.error('[places/lodging]', err);
    return NextResponse.json(
      { configured: true, places: [], error: 'Could not search for places right now.' },
      { status: 502 },
    );
  }
}
