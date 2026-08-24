import { NextResponse, type NextRequest } from 'next/server';
import { fetchPhoto, isPlacesConfigured } from '@/lib/google/places';

/**
 * Streams a Places photo. Exists because the direct media URL carries the API
 * key as a query parameter — putting one in an <img src> would publish it.
 */
export async function GET(request: NextRequest) {
  if (!isPlacesConfigured()) return new NextResponse(null, { status: 404 });

  const name = request.nextUrl.searchParams.get('name');
  const height = Number(request.nextUrl.searchParams.get('h') ?? 400);
  // Photo resource names always look like places/<id>/photos/<ref>; anything
  // else is someone probing the proxy for a general-purpose fetcher.
  if (!name || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(name)) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const upstream = await fetchPhoto(name, Math.min(Math.max(height, 80), 1600));
    if (!upstream.ok || !upstream.body) return new NextResponse(null, { status: 404 });

    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (err) {
    console.error('[places/photo]', err);
    return new NextResponse(null, { status: 502 });
  }
}
