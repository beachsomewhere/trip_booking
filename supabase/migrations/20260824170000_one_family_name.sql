-- ===========================================================================
-- One family name, everywhere.
--
-- Creating a trip and being invited to one disagreed about which name won.
-- Accepting an invitation adopts the household's own name — you decide how your
-- family appears, not the person inviting you — but create_trip took whatever
-- was typed into the form and left the household untouched. A returning user
-- could end up as "The Barnes" on every trip except the one they started.
--
-- The household name is now the single source of truth in both directions:
-- creating a trip with a different name renames the household, and every trip
-- follows along.
-- ===========================================================================

create or replace function public.create_trip(
  p_name        text,
  p_family_name text,
  p_target_days integer default 7
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_trip_id   uuid;
  v_family_id uuid;
  v_household uuid;
  v_email     text := auth.jwt() ->> 'email';
  v_clean     text := trim(p_family_name);
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(v_clean, '') = '' then
    raise exception 'trip name and family name are required';
  end if;

  v_household := ensure_household(v_clean);

  -- Renaming here keeps the two paths consistent, and carries the change to
  -- trips already under way. rename_household skips any trip where another
  -- family already answers to the name.
  perform rename_household(v_clean);

  insert into trips (name, organizer_user_id, target_finalize_by)
  values (trim(p_name), auth.uid(), current_date + greatest(coalesce(p_target_days, 7), 1))
  returning id into v_trip_id;

  insert into families (trip_id, name, status, created_by_user_id, household_id)
  values (v_trip_id, v_clean, 'active', auth.uid(), v_household)
  returning id into v_family_id;

  insert into family_members (family_id, email, user_id, is_primary)
  values (v_family_id, v_email, auth.uid(), true)
  on conflict (family_id, email) do update set user_id = auth.uid();

  perform sync_household_emails(v_family_id);

  return v_trip_id;
end;
$$;
