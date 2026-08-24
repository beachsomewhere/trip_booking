# Lock the Trip

A web app for getting a group from *"we should go somewhere"* to an actual booking in about a week.

Group trips stall on a run of sequential decisions — **who's coming → when → where → which place** — and
each one stalls the same way: nobody wants to be the one to decide, and one slow family blocks everyone.
So the app models them identically. A family proposes, everyone else sees *"The Barnes suggested
Keystone"* and answers in one tap. Every family then **locks the step in**, which is a different act from
voting: a vote says what you want, a lock says you are finished. The organizer can move ahead without a
family that has gone quiet — but never silently.

The unit of participation is a **family**, not a person: several emails (spouses) share one entry, one
vote, and one headcount with ages.

---

## Quick start

Needs Node 22+, Docker (for local Supabase), and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
supabase start          # first run pulls a few GB of images
cp .env.local.example .env.local
```

Fill `.env.local` with the `API URL`, `anon key`, and `service_role key` that `supabase start` printed
(re-print them any time with `supabase status`). Then:

```bash
supabase db reset       # applies the schema and the demo seed
npm run dev
```

Open http://localhost:3000.

### Signing in locally

There are no passwords — the app emails a link. Locally that mail is caught by **Mailpit at
http://127.0.0.1:54324** instead of being sent, which is what makes it possible to test a
multi-family flow by yourself.

The seed creates one trip with three families. Sign in as any of these and pick up the link in Mailpit:

| Email | Family | Role |
| --- | --- | --- |
| `kyle@barnes.test` | The Barnes | organizer |
| `sam@barnes.test` | The Barnes | spouse — same family, same vote |
| `mei@chen.test` | The Chens | member |
| `ade@okafor.test` | The Okafors | invited, never accepted — the family you eventually decide whether to wait for |

To watch consensus behave, sign in as two different families in two browser profiles and vote against
each other.

### Commands

```bash
npm run dev         # dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # link-unfurl extraction tests (fixtures, no network)
supabase db reset   # re-apply schema + seed (wipes local data and sessions)
```

---

## How it fits together

**One state machine.** `trips.phase` runs `invites → dates → destination → lodging → finalized` and
decides what every screen shows. `src/lib/phases.ts` owns the ordering and labels, and maps the retired
`anchor` phase onto `lodging` so trips created before it was dropped still open.

**One consensus implementation.** `src/lib/consensus.ts` is pure functions — tallying, front-runner,
"3 of 4 families are in", and when to nudge the organizer. Both the server actions and the UI call it,
which is why the progress bar and the organizer's prompt can never disagree.

**Three phases, one component.** Dates, destination, and lodging share `ProposalBoard` and the
phase-parameterized actions in `src/actions/proposals.ts`. Adding a fourth voting step is a table plus a
`body` renderer, not a new feature.

**Households outlive trips.** Birth month and year are collected once and stored on a household that
persists across trips, so the second invitation asks only *who is coming this time* — not everyone's
birthday again. Ages are computed against the trip's own start date, never stored.

**Security lives in the database.** Every table has RLS. Anything a client must not be able to forge —
creating a trip, redeeming an invite token, approving a family addition, advancing the phase, removing a
family — goes through a `SECURITY DEFINER` RPC, and RLS grants no direct insert on those tables. A
non-member querying another trip gets zero rows, not an error.

Two things about Postgres that are easy to get wrong and are worth knowing before you edit the schema:

- **RLS policies do not grant table access.** Without an explicit `GRANT`, every query fails with
  *permission denied for table* before a policy is consulted — which looks exactly like a policy that
  matched no rows. The grants live at the bottom of the migration.
- **`service_role` needs grants too**, even though it bypasses RLS. It is used in exactly one place:
  resolving an invitation token, where the recipient is by definition not yet a member and RLS would
  otherwise hide their own invitation from them.

---

## What the lodging phase can and cannot do

This is the one place where the product is shaped by what APIs actually exist.

- **Airbnb and VRBO have no public API.** Official access is partner-only, for channel managers and
  property-management systems. So places to stay get in by someone **pasting a link**, which the app
  unfurls into a card. Those sites also fingerprint server-side fetches, so unfurling succeeds often but
  never reliably — the form always falls back to typing the details in, and that path is a first-class
  one, not an error state.
- **There is no lodging search.** A Google Places nearby search used to sit alongside the paste box and
  was removed: Places knows nothing about capacity, nightly rate or availability, which is all anyone
  needs in order to judge a place to stay. It filled the screen with results that could not be evaluated.
- Because pasted links are now the only source, `src/lib/unfurl.ts` works hard at reading them — JSON-LD
  first, then OpenGraph/Twitter meta, then the visible prose for "sleeps 8" and "3 bedrooms". It is the
  one part of the app with tests (`npm test`), because it cannot be checked against live sites: whether
  a given site answers a server fetch varies by the day.
- **Nightly rates cannot be read off a link at all**, and that is not a parser gap. Airbnb's page contains
  no price anywhere in the HTML a server fetch receives — the number you see in a browser arrives from a
  separate `StaysPdpBookItQuery` request keyed to your dates and guest counts, after the page loads. Their
  price is also meaningless without those inputs: the same villa is a different number for two nights in
  November with nine people than for a week in June with four. So instead of guessing, `lib/listingLink.ts`
  sends the question back to the site that can answer it — "Open with our dates" carries the trip's dates,
  adults, children and infants into the listing URL in each site's own parameter spelling. A site whose
  spelling we do not know is left exactly as pasted; a wrong parameter name is silently ignored and lands
  the family on a default-priced page without them noticing.
- If reliable capacity and pricing turn out to matter more than the paste flow, the honest next step is a
  paid third-party STR data API — unofficial, per-call, and liable to break.

**Places is still used for the destination step** (autocomplete on the Where screen) and is optional:
with no `GOOGLE_MAPS_API_KEY` those fields degrade to plain text, and the whole app runs end to end
without a Google account.

---

## Configuration

All secrets are server-side. The Google key is never exposed — autocomplete, details, and even **photos**
are proxied through `/api/places/*`, because a Places photo URL embeds the key.

| Variable | Needed for | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything | from `supabase status` or the dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | invite links | server-only — never prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | invite + sign-in links | must match the host people actually browse |
| `GOOGLE_MAPS_API_KEY` | destination autocomplete | optional — see below |
| `RESEND_API_KEY` | real invite email | optional — see below |
| `EMAIL_FROM` | real invite email | must be a verified Resend sender |

### Google Places

Enable **exactly one** API on the GCP project: **Places API (New)**. Not the legacy "Places API", and
no Maps SDK — the app renders no map. It calls `places:autocomplete` and `places/{id}`, plus the photo
media endpoint.

The key is server-side only. Restrict it to *Places API (New)* under API restrictions, and leave
application restrictions as **None** — a referrer restriction cannot match a server-side call, and
Vercel's egress IPs are not fixed.

### Email

Without `RESEND_API_KEY` the app **logs the invite URL to the server console** and shows the organizer a
copyable link on the Who screen, rather than failing. Invitations are never lost to a missing key.

For real email, add a Resend key and verify a sending domain (`invites@lockthetrip.online`).

---

## Deploying

The app lives at the repo root, so Vercel needs no root-directory override.

1. Import `beachsomewhere/trip_booking` in Vercel.
2. Add every variable above in Vercel's project settings, with
   `NEXT_PUBLIC_SITE_URL=https://lockthetrip.online`.
3. Point `lockthetrip.online` at the Vercel project.
4. **Add the production URL to Supabase Auth's redirect allowlist** — Authentication → URL
   Configuration → Site URL and Redirect URLs (`https://lockthetrip.online/auth/callback`). Skipping
   this is the classic failure: sign-in works locally and silently breaks in production.
5. Apply the schema to the hosted project: `supabase link --project-ref <ref>` then `supabase db push`.
   Do **not** run `supabase/seed.sql` against production — it creates fake users.

---

## Known gaps

- No notification emails beyond invites and reminders — nobody is nudged automatically when a phase opens.
- The organizer is a single point of failure; there is no way to hand the role over.
- Trip dates are not checked against anything real (no flight or availability awareness).
- Nothing advances on its own. Even with every family locked in, the organizer presses the button.
- Tests cover link unfurling only. Everything else is `npm run typecheck`, `npm run build`, and the
  walkthrough above.
