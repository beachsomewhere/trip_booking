-- ===========================================================================
-- Adding families is a Who-phase activity.
--
-- The previous migration lifted two restrictions at once — organizer-only, and
-- invites-phase-only — when only the first was wrong. Anyone may add a family,
-- but not once the group has moved on: a family arriving after dates are being
-- voted on inherits decisions they had no part in, and silently changes the
-- headcount that the lodging step is sized against.
--
-- Also grants decline_invitation to service_role. It was granted to anon and
-- authenticated, but the decline page calls it through the admin client — the
-- caller is by definition not signed in — so every decline failed with
-- "permission denied for function".
-- ===========================================================================

create or replace function public.invite_family(
  p_trip_id  uuid,
  p_name     text,
  p_emails   text[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_family_id uuid;
  v_email     text;
  v_phase     trip_phase;
  v_inviter   uuid := my_family_id(p_trip_id);
begin
  -- Any participating family, not just the organizer.
  if v_inviter is null and not is_trip_organizer(p_trip_id) then
    raise exception 'you are not part of this trip';
  end if;

  select phase into v_phase from trips where id = p_trip_id;
  if v_phase <> 'invites' then
    raise exception 'the guest list closed when this trip moved on to picking dates';
  end if;

  if coalesce(array_length(p_emails, 1), 0) = 0 then
    raise exception 'at least one email is required';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'give the family a name';
  end if;

  insert into families (trip_id, name, status, created_by_user_id)
  values (p_trip_id, trim(p_name), 'invited', auth.uid())
  returning id into v_family_id;

  foreach v_email in array p_emails loop
    if coalesce(trim(v_email), '') <> '' then
      insert into family_members (family_id, email, is_primary)
      values (v_family_id, lower(trim(v_email)), v_email = p_emails[1])
      on conflict (family_id, email) do nothing;

      insert into invitations (trip_id, family_id, email, invited_by_family_id)
      values (p_trip_id, v_family_id, lower(trim(v_email)), v_inviter);
    end if;
  end loop;

  return v_family_id;
end;
$$;

grant execute on function public.decline_invitation(text) to service_role;
