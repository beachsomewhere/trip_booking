-- ===========================================================================
-- Leaving a trip, and being able to come back.
--
-- Opting out already removed a family from every vote and hid the trip from
-- their list, because is_trip_member() only counts `invited` and `active`
-- families. What it did not do was leave a way back: my_family_id() returns
-- null once you are opted out, so the "opt back in" control was unreachable,
-- and accept_invitation() only promoted families from `invited`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Redeeming an invitation again reactivates a family that had opted out.
--
-- The invitation row and its token survive opting out, so the original email
-- is the way back in. That keeps rejoining self-service rather than something
-- the organizer has to do on your behalf.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv   invitations%rowtype;
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_inv from invitations where token = p_token;
  if not found then
    raise exception 'that invitation link is not valid';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'that invitation link has expired';
  end if;

  insert into family_members (family_id, email, user_id)
  values (v_inv.family_id, v_email, auth.uid())
  on conflict (family_id, email) do update set user_id = auth.uid();

  -- Reactivate from `invited` (first acceptance) or `opted_out` (rejoining).
  -- A family the organizer `removed` stays removed; getting back in after that
  -- is the organizer's call, not the removed family's.
  update families set status = 'active'
   where id = v_inv.family_id and status in ('invited', 'opted_out');

  update invitations
     set accepted_at = coalesce(accepted_at, now()),
         accepted_by_user_id = coalesce(accepted_by_user_id, auth.uid())
   where id = v_inv.id;

  return v_inv.trip_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The organizer cannot walk away from their own trip.
--
-- is_trip_member() grants them access through the organizer clause regardless
-- of family status, so opting out would leave them able to see and run a trip
-- they are supposedly not on, while the roster showed them as gone. There is
-- no hand-off flow yet, so the honest options are to stay or delete the trip.
-- ---------------------------------------------------------------------------
create or replace function public.set_family_status(
  p_family_id uuid,
  p_status    family_status
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_trip_id uuid := trip_of_family(p_family_id);
begin
  if v_trip_id is null then raise exception 'no such family'; end if;

  if p_family_id = my_family_id(v_trip_id) then
    if p_status not in ('opted_out','active') then
      raise exception 'you can only opt your own family out or back in';
    end if;
    if p_status = 'opted_out' and is_trip_organizer(v_trip_id) then
      raise exception 'you are organizing this trip — delete it instead of leaving it';
    end if;
  elsif not is_trip_organizer(v_trip_id) then
    raise exception 'only the organizer can change another family''s status';
  end if;

  update families set status = p_status where id = p_family_id;
end;
$$;
