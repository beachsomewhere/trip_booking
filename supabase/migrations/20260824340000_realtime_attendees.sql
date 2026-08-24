-- ===========================================================================
-- Who's coming is a live decision too.
--
-- family_attendees and family_members were never published for realtime, so
-- one spouse un-ticking a child sat invisible on everyone else's screen until
-- they happened to reload. Every other table that drives a trip screen has
-- been live since realtime went in; these two were simply missed.
--
-- They also carry no trip_id, and the subscription filters on trip_id — every
-- other trip-scoped table has the column for exactly this reason. Adding it
-- denormalizes what families already knows, so a trigger keeps it honest
-- rather than trusting each caller to remember.
-- ===========================================================================

alter table family_attendees add column if not exists trip_id uuid
  references trips(id) on delete cascade;
alter table family_members add column if not exists trip_id uuid
  references trips(id) on delete cascade;

update family_attendees a
   set trip_id = f.trip_id
  from families f
 where f.id = a.family_id and a.trip_id is distinct from f.trip_id;

update family_members m
   set trip_id = f.trip_id
  from families f
 where f.id = m.family_id and m.trip_id is distinct from f.trip_id;

create index if not exists family_attendees_trip_idx on family_attendees(trip_id);
create index if not exists family_members_trip_idx on family_members(trip_id);

/**
 * Fills trip_id from the owning family.
 *
 * Every insert path — RPCs, the attendee editor, sync_household_emails — would
 * otherwise have to remember, and the one that forgets produces a row that is
 * invisible to realtime and impossible to notice.
 */
create or replace function public.set_trip_id_from_family()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select trip_id into new.trip_id from families where id = new.family_id;
  return new;
end;
$$;

drop trigger if exists family_attendees_trip_id on family_attendees;
create trigger family_attendees_trip_id
  before insert or update of family_id on family_attendees
  for each row execute function public.set_trip_id_from_family();

drop trigger if exists family_members_trip_id on family_members;
create trigger family_members_trip_id
  before insert or update of family_id on family_members
  for each row execute function public.set_trip_id_from_family();

do $$
declare t text;
begin
  foreach t in array array['family_attendees', 'family_members'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;
