import { NextResponse, type NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase/server';

/**
 * Reads OpenGraph tags off a pasted lodging URL.
 *
 * Airbnb and VRBO have no public API, so a pasted link is the only way a
 * short-term rental gets into a trip at all. Those same sites also fingerprint
 * server-side fetches, so this succeeds often but never reliably — the caller
 * must keep a manual-entry fallback rather than treating a miss as an error.
 */

const BLOCKED_HOSTS = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;

interface Unfurled {
  url: string;
  title: string | null;
  image: string | null;
  description: string | null;
  siteName: string | null;
}

function meta(html: string, ...keys: string[]): string | null {
  for (const k of keys) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${k}["']`, 'i'),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return decodeEntities(m[1]).trim();
    }
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

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

  const fallback: Unfurled = {
    url: parsed.toString(),
    title: null,
    image: null,
    description: null,
    siteName: parsed.hostname.replace(/^www\./, ''),
  };

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return NextResponse.json({ ...fallback, blocked: true });

    // Only the <head> matters, and listing pages are enormous.
    const html = (await res.text()).slice(0, 250_000);

    return NextResponse.json({
      ...fallback,
      title: meta(html, 'og:title', 'twitter:title') ?? html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim() ?? null,
      image: meta(html, 'og:image', 'twitter:image'),
      description: meta(html, 'og:description', 'description'),
      siteName: meta(html, 'og:site_name') ?? fallback.siteName,
    });
  } catch {
    // Timeouts and bot walls are expected here, not exceptional.
    return NextResponse.json({ ...fallback, blocked: true });
  }
}
