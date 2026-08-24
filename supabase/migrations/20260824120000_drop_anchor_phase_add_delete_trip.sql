-- ===========================================================================
-- Drops the "area / radius" step and adds trip deletion.
--
-- This is the first incremental migration. The base file is already applied to
-- production, and `supabase db push` tracks applied migrations by filename, so
-- editing it would have no effect on the hosted database. Every schema change
-- from here gets its own timestamped file.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The anchor phase is gone.
--
-- Picking a point and a radius turned out to be busywork: by the time a group
-- has agreed on "Keystone" they are ready to look at places, and the radius
-- control asked them to quantify something they had no opinion about. Where
-- people want to stay is better expressed by the places they actually put
-- forward, which is what the lodging step already collects.
--
-- The `anchor` enum value and the anchor_proposals/anchor_votes tables are left
-- in place. Removing an enum value requires rewriting every dependent column,
-- and the tables are harmless once nothing writes to them — but any trip
-- currently sitting in that phase has to move, or it would be stranded on a
-- step the app no longer renders.
-- ---------------------------------------------------------------------------

update trips set phase = 'lodging', updated_at = now() where phase = 'anchor';

-- Destination now hands straight off to lodging.
create or replace function public.resolve_destination(p_trip_id uuid, p_proposal_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_p destination_proposals%rowtype;
begin
  if not is_trip_organizer(p_trip_id) then raise exception 'organizer only'; end if;
  select * into v_p from destination_proposals where id = p_proposal_id and trip_id = p_trip_id;
  if not found then raise exception 'no such destination proposal on this trip'; end if;

  update trips
     set destination_name = v_p.name,
         destination_lat  = v_p.lat,
         destination_lng  = v_p.lng,
         -- Seed the lodging search from the destination itself, so a Places
         -- lookup still has somewhere to centre on without asking anyone to
         -- draw a circle.
         anchor_name      = coalesce(anchor_name, v_p.name),
         anchor_lat       = coalesce(anchor_lat, v_p.lat),
         anchor_lng       = coalesce(anchor_lng, v_p.lng),
         anchor_radius_mi = coalesce(anchor_radius_mi, 15),
         phase            = 'lodging',
         updated_at       = now()
   where id = p_trip_id;
end;
$$;

-- Backfill trips that already chose a destination but never set an anchor.
update trips
   set anchor_name      = coalesce(anchor_name, destination_name),
       anchor_lat       = coalesce(anchor_lat, destination_lat),
       anchor_lng       = coalesce(anchor_lng, destination_lng),
       anchor_radius_mi = coalesce(anchor_radius_mi, 15)
 where destination_name is not null;

-- ---------------------------------------------------------------------------
-- 2. Deleting a trip.
--
-- Organizer only, and irreversible: every family, proposal, vote, and
-- shortlist hangs off trips.id with `on delete cascade`, so this really does
-- remove the whole thing rather than hiding it.
-- ---------------------------------------------------------------------------

create or replace function public.delete_trip(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_trip_organizer(p_trip_id) then
    raise exception 'only the organizer can delete this trip';
  end if;

  delete from trips where id = p_trip_id;
end;
$$;

do $$
begin
  execute 'revoke execute on function public.delete_trip(uuid) from public';
  execute 'grant execute on function public.delete_trip(uuid) to authenticated';
end $$;
