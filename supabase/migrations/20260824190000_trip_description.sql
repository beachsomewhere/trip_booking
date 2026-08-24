-- ===========================================================================
-- A short description of what the trip actually is.
--
-- An invite that says only "You're invited to Cozumel cruise" leaves the most
-- important question unanswered: is this adults only, or are the kids coming?
-- That shapes whether a family says yes at all, and it shapes who they tick as
-- attending — so it belongs in the invitation, not in a side conversation.
-- ===========================================================================

alter table trips add column if not exists description text;

create or replace function public.create_trip(
  p_name        text,
  p_family_name text,
  p_target_days integer default 7,
  p_description text default null
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
  perform rename_household(v_clean);

  insert into trips (name, description, organizer_user_id, target_finalize_by)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), auth.uid(),
          current_date + greatest(coalesce(p_target_days, 7), 1))
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

create or replace function public.set_trip_description(p_trip_id uuid, p_description text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_trip_organizer(p_trip_id) then raise exception 'organizer only'; end if;
  update trips
     set description = nullif(trim(coalesce(p_description, '')), ''),
         updated_at = now()
   where id = p_trip_id;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'create_trip(text,text,integer,text)',
    'set_trip_description(uuid,text)'
  ] loop
    execute format('revoke execute on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
