/**
 * Puts the trip's own dates and headcount into a listing link.
 *
 * Nightly rates are the one thing a pasted link cannot tell us. Airbnb — and
 * every other booking site — computes price after the page loads, from a
 * separate request keyed to dates and guest counts; there is no price anywhere
 * in the HTML a server fetch receives. Their prices are also meaningless
 * without those inputs: the same villa is a different number for two nights in
 * November with nine people than it is for a week in June with four.
 *
 * So rather than guess at a number, the app hands the question back to the site
 * that can answer it, pre-filled. Opening a listing from here lands on that
 * listing priced for this trip, which is the thing families are comparing.
 */

export interface StayContext {
  /** Trip start, YYYY-MM-DD. No dates means no useful pricing, so nothing is added. */
  start: string | null;
  end: string | null;
  adults: number;
  /** 2 to 17 — sites price these differently from adults. */
  children: number;
  /** Under 2. Usually free, and usually excluded from the occupancy limit. */
  infants: number;
}

/** Query-parameter names each site reads, in its own spelling. */
const SITES: { match: RegExp; params: (c: StayContext) => Record<string, string> }[] = [
  {
    match: /(^|\.)airbnb\.[a-z.]+$/i,
    params: (c) => ({
      check_in: c.start!,
      check_out: c.end!,
      adults: String(c.adults),
      children: String(c.children),
      infants: String(c.infants),
    }),
  },
  {
    match: /(^|\.)(vrbo\.com|homeaway\.[a-z.]+|abritel\.fr)$/i,
    params: (c) => ({
      arrival: c.start!,
      departure: c.end!,
      adultsCount: String(c.adults),
      childrenCount: String(c.children + c.infants),
    }),
  },
  {
    match: /(^|\.)booking\.com$/i,
    params: (c) => ({
      checkin: c.start!,
      checkout: c.end!,
      group_adults: String(c.adults),
      group_children: String(c.children + c.infants),
      no_rooms: '1',
    }),
  },
  {
    match: /(^|\.)(expedia\.[a-z.]+|hotels\.com)$/i,
    params: (c) => ({
      startDate: c.start!,
      endDate: c.end!,
      adults: String(c.adults),
    }),
  },
];

/**
 * The same URL, priced for this trip. Returns the input untouched when there
 * are no agreed dates, the URL is unparseable, or the site is not one we know
 * the spelling for — a wrong parameter is worse than none.
 */
export function withStayContext(url: string, ctx: StayContext): string {
  if (!ctx.start || !ctx.end) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const site = SITES.find((s) => s.match.test(parsed.hostname));
  if (!site) return url;

  for (const [key, value] of Object.entries(site.params(ctx))) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

/** Whether this link will actually gain anything from the above. */
export function pricesByStay(url: string | null): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return SITES.some((s) => s.match.test(hostname));
  } catch {
    return false;
  }
}
