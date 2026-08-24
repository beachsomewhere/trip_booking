/** Display helpers shared across phases. */

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const DATE_FMT_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Parses a `date` column without dragging local timezone into it. */
export function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/** "Mar 14 – 21, 2027" — collapses the repeated month and year. */
export function formatDateRange(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  if (sameMonth) {
    return `${DATE_FMT.format(s)} – ${e.getUTCDate()}, ${e.getUTCFullYear()}`;
  }
  return `${DATE_FMT.format(s)} – ${DATE_FMT_YEAR.format(e)}`;
}

export function nightsBetween(start: string, end: string): number {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000);
}

/** Do two inclusive date ranges overlap at all? */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** The intersection of two ranges, or null. Drives the "everyone can do this
 *  window" highlight on the dates screen. */
export function rangeOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): { start: string; end: string } | null {
  if (!rangesOverlap(aStart, aEnd, bStart, bEnd)) return null;
  return { start: aStart > bStart ? aStart : bStart, end: aEnd < bEnd ? aEnd : bEnd };
}

/**
 * "The Barnes" / "The Barnes and The Chens" / "The Barnes, The Chens, +2".
 *
 * Names are rendered exactly as the family typed them. An earlier version
 * prefixed "the ", which produced "the Chen" for anyone who did not pluralise
 * their own surname — and broke outright for names like "Mei & Jon".
 */
export function listFamilies(names: string[], max = 2): string {
  if (names.length === 0) return 'nobody yet';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, max).join(', ')}, and ${names.length - max} more`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const HOUSING_LABEL: Record<string, string> = {
  hotel: 'Hotel',
  short_term_rental: 'Short-term rental',
  resort: 'Resort',
  cabin: 'Cabin',
  hostel: 'Hostel',
};
