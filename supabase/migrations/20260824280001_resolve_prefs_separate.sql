-- Split out because a new enum value cannot be used in the same transaction
-- that created it.
create or replace function public.resolve_lodging_prefs(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_types    housing_type[];
  v_together boolean;
begin
  if not is_trip_organizer(p_trip_id) then raise exception 'organizer only'; end if;

  select array_agg(distinct t) into v_types
    from lodging_prefs lp, unnest(lp.housing_types) as t
   where lp.trip_id = p_trip_id;

  -- One family wanting its own place settles it: you cannot put everyone under
  -- one roof over the objection of the family who would have to live there.
  select bool_or(stay_together_pref = 'together')
         and not bool_or(stay_together_pref = 'prefer_separate')
    into v_together
    from lodging_prefs where trip_id = p_trip_id;

  update trips
     set housing_types = coalesce(v_types, array['hotel','short_term_rental']::housing_type[]),
         stay_together = coalesce(v_together, false),
         updated_at    = now()
   where id = p_trip_id;
end;
$$;
