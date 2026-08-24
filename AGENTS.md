<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Lock the Trip — working notes

Read `README.md` first for what the app is and how to run it. This file is the stuff that will
otherwise cost you an hour.

## Verify against a real database

`npm run typecheck` and `npm run build` passing means very little here — most of the bugs in this
codebase have been Postgres-, PostgREST-, or GoTrue-shaped and only appear when the app actually talks
to Supabase. Run `supabase start`, `supabase db reset`, and click the flow. Mailpit at
`http://127.0.0.1:54324` catches every sign-in and invite mail.

## Traps already hit here (do not re-learn these)

- **RLS ≠ grants.** Enabling RLS and writing policies is not enough; `authenticated` and `service_role`
  each need an explicit `GRANT`. Without one, queries fail with *permission denied for table* — which is
  indistinguishable from a policy matching no rows. Grants are at the bottom of the migration.
- **PostgREST embeds between `trips` and `families` are ambiguous.** `lodging_prefs` and `phase_signoffs`
  create extra paths, so any embed needs a hint: `families!families_trip_id_fkey(...)`. Adding another
  table that references both will break existing embeds the same way.
- **Seeded `auth.users` need `''`, not `NULL`,** in `confirmation_token`, `recovery_token`,
  `email_change*`, `phone_change*`, and `reauthentication_token`. GoTrue scans them into non-nullable Go
  strings and fails sign-in with *Database error finding user*.
- **The Supabase CLI silently skips a migration named `init`.** Hence
  `00000000000000_trip_booker_schema.sql`.
- **Never `?? []` a query result.** Use `rows()` from `src/lib/queries.ts`, which logs the error. A
  silently empty list is the failure mode that wasted the most time here.

## Schema changes

`supabase/migrations/00000000000000_trip_booker_schema.sql` is the single source of truth and is written
idempotently (`if not exists`, `drop ... if exists`, `duplicate_object` guards) because it is re-applied
rather than tracked as incremental migrations. If you change a column's nullability or type, add an
explicit `alter table` next to the `create table` so existing databases pick it up too.

After any schema change:

```bash
supabase db reset
supabase gen types typescript --local > src/types/db.ts
```

Do not hand-edit `src/types/db.ts`.

## Adding another voting phase

The four voting phases share one implementation. To add a fifth:

1. `<name>_proposals` + `<name>_votes` tables, matching the shape of the existing pairs (including the
   denormalized `trip_id` on the vote table — the RLS policies rely on it).
2. Add it to `TABLES` in `src/actions/proposals.ts` and to `PHASES` / `PHASE_META` in `src/lib/phases.ts`.
3. A page that calls `boardBase()` and renders `<ProposalBoard>` with a phase-specific `body`.

Do not fork `ProposalBoard`. The whole point of the shared shape is that these steps stay identical for
the person using them.

## Conventions

- Family names are rendered **exactly as typed**. Never prefix "the " in code — families choose their own
  display string ("The Barnes", "Mei & Jon"), and hardcoding it produced "the Chen" and "the The Duartes".
- Anything trust-sensitive goes through a `SECURITY DEFINER` RPC, and the client is never trusted for a
  `family_id` — server actions resolve it via `my_family_id(trip_id)`.
- Google Places must stay optional. Every place field degrades to plain text without an API key; do not
  add a code path that requires one.
