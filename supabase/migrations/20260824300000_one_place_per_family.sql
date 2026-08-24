-- ===========================================================================
-- A family sleeps in one place.
--
-- The assignment UI has always claimed that picking a family for one unit
-- takes them out of any other, but it only ever did that in local component
-- state: set_lodging_selection cleared the families on the selection being
-- written and left every other selection alone. Booking the Barnes into a
-- second house therefore left them booked into both, and the summary happily
-- listed them twice.
-- ===========================================================================

create or replace function public.set_lodging_selection(
  p_trip_id      uuid,
  p_candidate_id uuid,
  p_family_ids   uuid[],
  p_label        text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_selection_id uuid;
  v_family_id    uuid;
begin
  if not is_trip_organizer(p_trip_id) then raise exception 'organizer only'; end if;

  insert into lodging_selections (trip_id, candidate_id, label)
  values (p_trip_id, p_candidate_id, p_label)
  on conflict (trip_id, candidate_id) do update set label = excluded.label
  returning id into v_selection_id;

  delete from lodging_selection_families where selection_id = v_selection_id;

  if p_family_ids is not null then
    -- Take these families out of every other place in this trip first, so a
    -- reassignment moves them rather than duplicating them.
    delete from lodging_selection_families lsf
    using lodging_selections ls
    where lsf.selection_id = ls.id
      and ls.trip_id = p_trip_id
      and ls.id <> v_selection_id
      and lsf.family_id = any (p_family_ids);

    foreach v_family_id in array p_family_ids loop
      insert into lodging_selection_families (selection_id, family_id)
      values (v_selection_id, v_family_id)
      on conflict do nothing;
    end loop;
  end if;

  -- Moving the last family out of another place leaves a booking for nobody,
  -- which is not a booking. Clear those rather than listing an empty house on
  -- the summary.
  delete from lodging_selections ls
  where ls.trip_id = p_trip_id
    and ls.id <> v_selection_id
    and not exists (
      select 1 from lodging_selection_families lsf where lsf.selection_id = ls.id
    );

  return v_selection_id;
end;
$$;

revoke execute on function public.set_lodging_selection(uuid,uuid,uuid[],text) from public;
grant execute on function public.set_lodging_selection(uuid,uuid,uuid[],text) to authenticated;
