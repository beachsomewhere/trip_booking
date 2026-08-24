/**
 * Run with `npm test`.
 *
 * Every one of these is a site's own parameter spelling, which is the whole
 * risk here: a wrong name is silently ignored and the family lands on a
 * default-priced page without noticing it is the wrong number.
 */
import { withStayContext, pricesByStay } from '../listingLink.ts';

const results = [];
const check = (name, got, want) =>
  results.push({ name, got, want, ok: String(got) === String(want) });

const ctx = { start: '2026-11-17', end: '2026-11-19', adults: 4, children: 4, infants: 1 };

check(
  'airbnb gets its own spelling, and keeps the room path',
  withStayContext('https://www.airbnb.com/rooms/48922042', ctx),
  'https://www.airbnb.com/rooms/48922042?check_in=2026-11-17&check_out=2026-11-19&adults=4&children=4&infants=1',
);

check(
  'existing params are replaced, not duplicated',
  withStayContext('https://www.airbnb.com/rooms/1?adults=2&source_impression_id=p3_x', ctx),
  'https://www.airbnb.com/rooms/1?adults=4&source_impression_id=p3_x&check_in=2026-11-17&check_out=2026-11-19&children=4&infants=1',
);

check(
  'vrbo folds infants in with children',
  withStayContext('https://www.vrbo.com/1234567', ctx),
  'https://www.vrbo.com/1234567?arrival=2026-11-17&departure=2026-11-19&adultsCount=4&childrenCount=5',
);

check(
  'booking.com asks for a room count too',
  withStayContext('https://www.booking.com/hotel/mx/casa.html', ctx),
  'https://www.booking.com/hotel/mx/casa.html?checkin=2026-11-17&checkout=2026-11-19&group_adults=4&group_children=5&no_rooms=1',
);

// A guessed parameter name is worse than none: it looks like it worked.
check(
  'an unknown site is left exactly as pasted',
  withStayContext('https://someresort.example/suite-3', ctx),
  'https://someresort.example/suite-3',
);

check(
  'no agreed dates means no parameters',
  withStayContext('https://www.airbnb.com/rooms/1', { ...ctx, start: null, end: null }),
  'https://www.airbnb.com/rooms/1',
);

check('rubbish in, rubbish out, no throw', withStayContext('not a url', ctx), 'not a url');

check('airbnb.co.uk counts as airbnb', pricesByStay('https://www.airbnb.co.uk/rooms/9'), 'true');
check('a hotel site does not', pricesByStay('https://someresort.example/x'), 'false');
check('null url does not', pricesByStay(null), 'false');
// Substring matches must not count — notairbnb.com is not Airbnb.
check('lookalike domains do not match', pricesByStay('https://notairbnb.com/rooms/9'), 'false');

for (const r of results) {
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}` +
      (r.ok ? '' : ` — got ${JSON.stringify(r.got)}, wanted ${JSON.stringify(r.want)}`),
  );
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
