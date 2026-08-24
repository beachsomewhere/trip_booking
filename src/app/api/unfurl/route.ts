import { NextResponse, type NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { extractListing, type Unfurled } from '@/lib/unfurl';

/**
 * Fetches a pasted lodging URL and reads what it can off the page.
 *
 * Only the fetching and the guarding live here; the parsing is in lib/unfurl so
 * it can be tested against fixtures rather than against whichever sites happen
 * to allow a server-side fetch today.
 *
 * Sites that fingerprint server fetches will refuse, so a miss is expected
 * rather than exceptional — the form pre-fills what came back and leaves every
 * field editable.
 */

const BLOCKED_HOSTS =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { url } = (await request.json()) as { url?: string };
  if (!url) return NextResponse.json({ error: 'A URL is required.' }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'That is not a valid URL.' }, { status: 400 });
  }

  // Do not let a signed-in user turn this into a scanner for the private
  // network the server sits in.
  if (!/^https?:$/.test(parsed.protocol) || BLOCKED_HOSTS.test(parsed.hostname)) {
    return NextResponse.json({ error: 'That address cannot be fetched.' }, { status: 400 });
  }

  const empty: Unfurled = {
    url: parsed.toString(),
    title: null,
    image: null,
    description: null,
    siteName: parsed.hostname.replace(/^www\./, ''),
    price: null,
    rating: null,
    address: null,
    capacity: null,
    bedrooms: null,
  };

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    });

    if (!res.ok) return NextResponse.json({ ...empty, blocked: true });

    // Listing pages are enormous and everything useful is near the top.
    const html = (await res.text()).slice(0, 400_000);

    return NextResponse.json({
      ...empty,
      ...extractListing(html, parsed.hostname),
    });
  } catch {
    return NextResponse.json({ ...empty, blocked: true });
  }
}
