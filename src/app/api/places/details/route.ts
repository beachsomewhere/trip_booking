import { NextResponse, type NextRequest } from 'next/server';
import { isPlacesConfigured, photoProxyUrl, placeDetails } from '@/lib/google/places';
import { getUser } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!isPlacesConfigured()) {
    return NextResponse.json({ error: 'Places is not configured.' }, { status: 503 });
  }

  const placeId = request.nextUrl.searchParams.get('placeId');
  if (!placeId) return NextResponse.json({ error: 'placeId is required.' }, { status: 400 });

  try {
    const place = await placeDetails(placeId);
    return NextResponse.json({
      ...place,
      photoUrl: place.photoName ? photoProxyUrl(place.photoName) : null,
    });
  } catch (err) {
    console.error('[places/details]', err);
    return NextResponse.json({ error: 'Could not look up that place.' }, { status: 502 });
  }
}
