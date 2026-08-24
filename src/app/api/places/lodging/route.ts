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
    .select('anchor_lat, anchor_lng, anchor_radius_mi, housing_types')
    .eq('id', tripId)
    .maybeSingle();

  if (!trip?.anchor_lat || !trip?.anchor_lng) {
    return NextResponse.json(
      { configured: true, places: [], error: 'This trip has no search area yet.' },
      { status: 409 },
    );
  }

  try {
    const places = await searchLodging({
      lat: trip.anchor_lat,
      lng: trip.anchor_lng,
      radiusMi: Number(trip.anchor_radius_mi ?? 5),
      housingTypes: trip.housing_types ?? undefined,
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
