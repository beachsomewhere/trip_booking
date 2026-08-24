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
check('occupancy object unwraps to a value', a.capacity, '12');
check('bedrooms', a.bedrooms, '5');
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

for (const r of results) {
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}` +
      (r.ok ? '' : ` — got ${JSON.stringify(r.got)}, wanted ${JSON.stringify(r.want)}`),
  );
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
