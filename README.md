# Lock the Trip

A web app for getting a group from *"we should go somewhere"* to an actual booking in about a week.

Group trips stall on four sequential decisions — **when → where → what area → which place** — and each
one stalls the same way: nobody wants to be the one to decide, and one slow family blocks everyone.
So the app models all four identically. A family proposes, everyone else sees *"The Barnes suggested
Keystone"* and answers in one tap. The organizer can move ahead without a family that has gone quiet.

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
supabase db reset   # re-apply schema + seed (wipes local data and sessions)
```

---

## How it fits together

**One state machine.** `trips.phase` runs `invites → dates → destination → anchor → lodging → finalized`
and decides what every screen shows. `src/lib/phases.ts` owns the ordering and labels.

**One consensus implementation.** `src/lib/consensus.ts` is pure functions — tallying, front-runner,
"3 of 4 families are in", and when to nudge the organizer. Both the server actions and the UI call it,
which is why the progress bar and the organizer's prompt can never disagree.

**Four phases, one component.** Dates, destination, area, and lodging share `ProposalBoard` and the
phase-parameterized actions in `src/actions/proposals.ts`. Adding a fifth voting step is a table plus a
`body` renderer, not a new feature.

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
  property-management systems. So short-term rentals get in by someone **pasting a link**, which the app
  unfurls into a card. Those sites also fingerprint server-side fetches, so unfurling succeeds often but
  never reliably — the form always falls back to typing the details in, and that path is a first-class
  one, not an error state.
- **Google Places returns no capacity and no nightly rate.** There is no *"sleeps 8"* field to filter on.
  So the app shows the group's own headcount (and how many are under 18) on every card and lets families
  annotate capacity by hand. It deliberately does not pretend to know more than it does.
- If capacity filtering turns out to matter more than discovery, the honest next step is a paid
  third-party STR data API — unofficial, per-call, and liable to break. Worth deciding only after using
  this once.

**Places is optional.** With no `GOOGLE_MAPS_API_KEY` the place fields degrade to plain text: a group can
still name "Keystone", vote on it, agree an area, and shortlist pasted links. The whole app runs end to
end without a Google account.

---

## Configuration

All secrets are server-side. The Google key is never exposed — autocomplete, details, nearby search, and
even **photos** are proxied through `/api/places/*`, because a Places photo URL embeds the key.

| Variable | Needed for | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything | from `supabase status` or the dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | invite links | server-only — never prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | invite + sign-in links | must match the host people actually browse |
| `GOOGLE_MAPS_API_KEY` | place search | enable **Places API (New)**; optional |
| `RESEND_API_KEY` | real invite email | optional — see below |
| `EMAIL_FROM` | real invite email | must be a verified Resend sender |

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

- No realtime. Votes appear on refresh or navigation, not live.
- No notification emails beyond the invite — nobody gets nudged when a phase opens.
- The organizer is a single point of failure; there is no way to hand the role over.
- Trip dates are not checked against anything real (no flight or availability awareness).
- No automated tests. Verification is `npm run typecheck`, `npm run build`, and the walkthrough above.
