import { NextResponse, type NextRequest } from 'next/server';
import { autocomplete, isPlacesConfigured } from '@/lib/google/places';
import { getUser } from '@/lib/supabase/server';

/**
 * Proxies Places autocomplete so the API key stays server-side.
 *
 * Requires a signed-in user — otherwise this is an open, billable relay of
 * someone else's Google quota.
 */
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  if (!isPlacesConfigured()) {
    // Not an error: the UI falls back to a plain text field.
    return NextResponse.json({ configured: false, suggestions: [] });
  }

  const input = request.nextUrl.searchParams.get('q') ?? '';
  try {
    return NextResponse.json({ configured: true, suggestions: await autocomplete(input) });
  } catch (err) {
    console.error('[places/autocomplete]', err);
    return NextResponse.json(
      { configured: true, suggestions: [], error: 'Place search is unavailable right now.' },
      { status: 502 },
    );
  }
}
