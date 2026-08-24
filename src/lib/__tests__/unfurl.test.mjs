/**
 * Extraction tests for the link unfurler.
 *
 * This parser is the only thing standing between a pasted URL and a person
 * retyping a listing by hand, and it cannot be checked against live sites —
 * Airbnb, VRBO and most hotel chains refuse server-side fetches, so a live test
 * would pass or fail based on who was blocking that day. Fixtures instead.
 *
 * Run with: npm test
 */

import { extractListing } from '../unfurl.ts';

const results = [];
const check = (name, got, want) =>
  results.push({ name, got, want, ok: String(got) === String(want) });

// Shaped like the structured data booking sites actually emit, including the
// @graph wrapper and an unrelated node ahead of the useful one.
const jsonLdPage = `
<html><head>
<title>Slopeside 5BR | Example Rentals</title>
<meta property="og:title" content="OG fallback title" />
<meta property="og:image" content="https://img.example/hero.jpg" />
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"BreadcrumbList","itemListElement":[]},
  {"@type":"VacationRental","name":"Slopeside 5BR with hot tub",
   "description":"Ski-in ski-out chalet a two-minute walk from the gondola.",
   "image":["https://img.example/1.jpg","https://img.example/2.jpg"],
   "numberOfBedrooms":5,
   "occupancy":{"@type":"QuantitativeValue","value":12},
   "address":{"@type":"PostalAddress","streetAddress":"12 River Run","addressLocality":"Keystone","addressRegion":"CO"},
   "aggregateRating":{"@type":"AggregateRating","ratingValue":4.8,"reviewCount":211},
   "offers":{"@type":"Offer","price":"780","priceCurrency":"USD"}}
]}
</script>
</head><body><p>Sleeps 12 &middot; 5 bedrooms</p></body></html>`;

const a = extractListing(jsonLdPage, 'www.example.com');
check('JSON-LD name beats <title> and og:title', a.title, 'Slopeside 5BR with hot tub');
check('JSON-LD description', a.description, 'Ski-in ski-out chalet a two-minute walk from the gondola.');
check('first image of an array', a.image, 'https://img.example/1.jpg');
check('capacity reads as the page states it', a.capacity, 'Sleeps 12');
check('bedrooms', a.bedrooms, '5 bedrooms');

// With no prose to read, the structured occupancy is still what answers.
const ldOnly = `<html><head><script type="application/ld+json">
{"@type":"Hotel","name":"Quiet Inn","occupancy":{"@type":"QuantitativeValue","value":9},"numberOfRooms":3}
</script></head><body></body></html>`;
const l = extractListing(ldOnly, 'inn.test');
check('occupancy object unwraps when nothing else says', l.capacity, '9');
check('numberOfRooms used when no prose', l.bedrooms, '3');
check('price carries its currency', a.price, 'USD 780');
check('rating', a.rating, '4.8');
check('address parts joined', a.address, '12 River Run, Keystone, CO');

// No structured data at all: meta tags, then the visible copy.
const metaOnlyPage = `
<html><head>
<title>Gondola-view townhome</title>
<meta property="og:site_name" content="Example Stays" />
<meta property="og:description" content="Walk to the lifts." />
<meta property="twitter:image" content="https://img.example/tw.jpg" />
</head><body>
<h1>Gondola-view townhome</h1>
<p>This home accommodates 8 guests across 3 bedrooms.</p>
</body></html>`;

const b = extractListing(metaOnlyPage, 'www.example.com');
check('falls back to <title>', b.title, 'Gondola-view townhome');
check('og:description', b.description, 'Walk to the lifts.');
check('twitter:image fallback', b.image, 'https://img.example/tw.jpg');
check('og:site_name', b.siteName, 'Example Stays');
check('capacity read from prose', b.capacity, 'Sleeps 8');
check('bedrooms read from prose', b.bedrooms, '3 bedrooms');

// Malformed JSON-LD must not take the meta-tag path down with it.
const brokenLdPage = `
<html><head>
<meta property="og:title" content="Still readable" />
<script type="application/ld+json">{ this is not json }</script>
</head><body></body></html>`;

check('broken JSON-LD falls through to meta', extractListing(brokenLdPage, 'x.com').title, 'Still readable');

// A page with nothing at all should yield nulls, not throw.
const emptyResult = extractListing('<html></html>', 'www.nowhere.test');
check('empty page yields no title', emptyResult.title, '');
check('empty page still names the site', emptyResult.siteName, 'nowhere.test');

// --- Airbnb, from the real markup of a live listing -------------------------
// Shapes taken verbatim from www.airbnb.com/rooms/48922042: the JSON-LD reports
// occupancy 6 (which is beds), the page text says 12 guests, the room counts
// live only in og:title, and there is no price anywhere in the server HTML.
const airbnb = `
<html><head>
<meta property="og:site_name" content="Airbnb"/>
<meta property="og:title" content="Villa in Cozumel · ★4.91 · 4 bedrooms · 6 beds · 5 baths"/>
<meta property="og:description" content="Oceanfront Villa Santa Pilar"/>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"VacationRental",
"name":"Oceanfront Villa Santa Pilar","description":"CASA SANTA PILAR is a private, top-rated villa.",
"address":{"addressLocality":"Cozumel"},"aggregateRating":{"@type":"AggregateRating","ratingValue":4.91,"ratingCount":"120"},
"containsPlace":{"@type":"Accommodation","occupancy":{"@type":"QuantitativeValue","value":6}}}</script>
</head><body>${'<div>padding</div>'.repeat(20000)}<span>12 guests</span></body></html>`;

const ab = extractListing(airbnb, 'www.airbnb.com');
check('airbnb prefers the JSON-LD name over the og headline', ab.title, 'Oceanfront Villa Santa Pilar');
check('airbnb capacity comes from the page text, not schema.org occupancy', ab.capacity, '12 guests');
check('airbnb room counts come out of og:title', ab.bedrooms, '4 bedrooms · 6 beds · 5 baths');
check('airbnb rating comes from JSON-LD', ab.rating, '4.91');
check('airbnb address is the locality', ab.address, 'Cozumel');
check('airbnb ships no price in server HTML — this must stay null, not a guess', ab.price, null);

for (const r of results) {
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}` +
      (r.ok ? '' : ` — got ${JSON.stringify(r.got)}, wanted ${JSON.stringify(r.want)}`),
  );
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
