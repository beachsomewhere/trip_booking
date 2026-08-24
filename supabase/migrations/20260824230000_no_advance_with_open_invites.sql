-- ===========================================================================
-- The Who phase cannot close while an invitation is still outstanding.
--
-- Adding families is confined to the Who phase. So if the trip moves on while
-- someone still has an unopened invite, that family accepts into a trip whose
-- guest list is already shut — they can never add anyone, and they had no
-- chance to. The organizer creates that trap by acting before the invitee has
-- had a say, which is exactly when it is least obvious.
--
-- The escape hatch for a family that never replies is to remove them, which is
-- already possible and leaves the roster honest, rather than to advance past
-- them and leave a pending invitation dangling.
-- ===========================================================================

create or replace function public.advance_phase(p_trip_id uuid, p_to trip_phase)
returns trip_phase language plpgsql security definer set search_path = public as $$
declare
  v_phase   trip_phase;
  v_pending text;
begin
  if not is_trip_organizer(p_trip_id) then
    raise exception 'only the organizer can move the trip to the next step';
  end if;

  select phase into v_phase from trips where id = p_trip_id;

  if v_phase = 'invites' and p_to <> 'invites' then
    select string_agg(name, ', ' order by name) into v_pending
      from families
     where trip_id = p_trip_id and status = 'invited';

    if v_pending is not null then
      raise exception
        'still waiting on % to accept or decline. Adding families closes when the trip moves on, so they would be stuck — remove them if they are not coming.',
        v_pending;
    end if;
  end if;

  update trips set phase = p_to, updated_at = now() where id = p_trip_id;
  return p_to;
end;
$$;
