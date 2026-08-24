/**
 * Parsing half of the link unfurler, kept separate from the route so it can be
 * exercised against fixtures.
 *
 * Pasted links are the only source of places to stay — Airbnb and VRBO have no
 * public API — so whatever this fails to read becomes something a person has to
 * type. Three sources, in decreasing order of reliability:
 *
 *   1. JSON-LD (schema.org) — structured, and what most booking sites emit
 *   2. OpenGraph / Twitter card meta
 *   3. The <title> tag, and finally the visible prose
 */

export interface Unfurled {
  url: string;
  title: string | null;
  image: string | null;
  description: string | null;
  siteName: string | null;
  price: string | null;
  rating: string | null;
  address: string | null;
  capacity: string | null;
  bedrooms: string | null;
  blocked?: boolean;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function meta(html: string, ...keys: string[]): string | null {
  for (const k of keys) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${k}["']`, 'i'),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return decodeEntities(m[1]).trim();
    }
  }
  return null;
}

/** Every JSON-LD block on the page, flattened through @graph and arrays. */
function jsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1].trim());
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== 'object') continue;
        const record = node as Record<string, unknown>;
        nodes.push(record);
        if (Array.isArray(record['@graph'])) queue.push(...record['@graph']);
      }
    } catch {
      // Malformed JSON-LD is common; the meta-tag path still applies.
    }
  }
  return nodes;
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

/** Pulls a lodging-shaped record out of the JSON-LD soup. */
function fromJsonLd(html: string) {
  const nodes = jsonLdNodes(html);
  const wanted =
    /hotel|lodging|apartment|house|resort|motel|hostel|accommodation|room|product|place|vacationrental/i;

  const node =
    nodes.find((n) => wanted.test(String(n['@type'] ?? ''))) ??
    nodes.find((n) => n.name || n.aggregateRating);
  if (!node) return {};

  const offers = (Array.isArray(node.offers) ? node.offers[0] : node.offers) as
    | Record<string, unknown>
    | undefined;
  const addr = node.address as Record<string, unknown> | string | undefined;
  const rating = node.aggregateRating as Record<string, unknown> | undefined;

  const price =
    str(offers?.price) ??
    str(node.priceRange) ??
    str((node.priceSpecification as Record<string, unknown> | undefined)?.price);
  const currency = str(offers?.priceCurrency) ?? '';

  const address =
    typeof addr === 'string'
      ? addr
      : [str(addr?.streetAddress), str(addr?.addressLocality), str(addr?.addressRegion)]
          .filter(Boolean)
          .join(', ') || null;

  const image = Array.isArray(node.image) ? str(node.image[0]) : str(node.image);

  return {
    title: str(node.name),
    description: str(node.description),
    image,
    address,
    price: price ? `${currency && currency.length <= 3 ? currency + ' ' : ''}${price}` : null,
    rating: str(rating?.ratingValue),
    capacity: str(node.occupancy) ?? str((node.occupancy as Record<string, unknown>)?.value) ?? null,
    bedrooms: str(node.numberOfRooms) ?? str(node.numberOfBedrooms) ?? null,
  };
}

/**
 * "4 bedrooms · 6 beds · 5 baths", from wherever those numbers appear.
 *
 * Airbnb puts exactly this in og:title ("Villa in Cozumel · ★4.91 · 4 bedrooms
 * · 6 beds · 5 baths") and nowhere structured, so the summary is assembled from
 * whichever of the three turn up.
 */
function roomSummary(text: string): string | null {
  const parts: string[] = [];
  for (const [re, one, many] of [
    [/\b(\d{1,2})\s+bedrooms?\b/i, 'bedroom', 'bedrooms'],
    [/\b(\d{1,2})\s+beds?\b/i, 'bed', 'beds'],
    [/\b(\d{1,2}(?:\.5)?)\s+baths?\b/i, 'bath', 'baths'],
  ] as const) {
    const m = text.match(re);
    if (m?.[1]) parts.push(`${m[1]} ${Number(m[1]) === 1 ? one : many}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Pull "sleeps 8" / "12 guests" / "4 bedrooms" out of the visible copy. */
function fromProse(html: string) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const sleeps = text.match(/\b(?:sleeps|accommodates)\s+(\d{1,2})/i);
  const guests = text.match(/\b(\d{1,2})\s+guests?\b/i);
  return {
    capacity: sleeps?.[1] ? `Sleeps ${sleeps[1]}` : guests?.[1] ? `${guests[1]} guests` : null,
    bedrooms: roomSummary(text),
  };
}


/** Everything readable from a listing page. Every field is a hint, not a fact. */
export function extractListing(html: string, hostname: string): Omit<Unfurled, 'url'> {
  const ld = fromJsonLd(html);
  const prose = fromProse(html);
  // Airbnb encodes rating and the room counts into og:title and leaves them out
  // of its JSON-LD, so the headline is worth mining even when it is not the
  // best name for the place.
  const headline = meta(html, 'og:title', 'twitter:title');
  const headlineRooms = headline ? roomSummary(headline) : null;
  const headlineRating = headline?.match(/★\s*([\d.]+)/)?.[1] ?? null;

  return {
    title:
      ld.title ??
      headline ??
      decodeEntities(html.match(/<title[^>]*>([^<]+)/i)?.[1] ?? '').trim() ??
      null,
    image: ld.image ?? meta(html, 'og:image', 'twitter:image'),
    description: ld.description ?? meta(html, 'og:description', 'description'),
    siteName: meta(html, 'og:site_name') ?? hostname.replace(/^www\./, ''),
    price: ld.price ?? meta(html, 'product:price:amount', 'og:price:amount', 'price'),
    rating: ld.rating ?? headlineRating ?? meta(html, 'og:rating'),
    address: ld.address ?? meta(html, 'og:street-address', 'og:locality') ?? null,
    // Prose wins over JSON-LD here, which is backwards from every other field:
    // Airbnb's schema.org `occupancy` reports beds (6) while the page plainly
    // says the place takes 12 guests. The number a human reads on the page is
    // the one they are choosing against.
    capacity: prose.capacity ?? ld.capacity ?? null,
    bedrooms: headlineRooms ?? prose.bedrooms ?? ld.bedrooms ?? null,
  };
}
