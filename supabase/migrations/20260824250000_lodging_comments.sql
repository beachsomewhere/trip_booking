-- ===========================================================================
-- Comments on a place to stay.
--
-- The dates and destination steps let a family explain a vote. Lodging had no
-- equivalent, and it is where the reasoning matters most: "no swim-up bar",
-- "the beds are bunks", "it's a twenty-minute drive from the lifts" is exactly
-- the knowledge that decides these things, and it was going into a group chat
-- the app never sees.
--
-- A separate table rather than a column on lodging_picks, because the most
-- useful comment is usually about a place you did NOT shortlist — and a pick
-- only exists for the five you did.
-- ===========================================================================

create table if not exists lodging_comments (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references trips(id) on delete cascade,
  candidate_id uuid not null references lodging_candidates(id) on delete cascade,
  family_id    uuid not null references families(id) on delete cascade,
  note         text not null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (candidate_id, family_id)
);

create index if not exists lodging_comments_trip_idx on lodging_comments(trip_id);

alter table lodging_comments enable row level security;

drop policy if exists lodging_comments_read on lodging_comments;
create policy lodging_comments_read on lodging_comments for select to authenticated
  using (is_trip_member(trip_id));

drop policy if exists lodging_comments_write on lodging_comments;
create policy lodging_comments_write on lodging_comments for all to authenticated
  using (family_id = my_family_id(trip_id))
  with check (family_id = my_family_id(trip_id));

grant select, insert, update, delete on lodging_comments to authenticated;
grant all on lodging_comments to service_role;
