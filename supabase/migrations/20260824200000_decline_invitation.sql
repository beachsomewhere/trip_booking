-- ===========================================================================
-- Declining an invitation without joining.
--
-- "No thanks" was only expressible by joining a trip and then leaving it, which
-- is a strange thing to ask of someone who has already decided not to come. It
-- also meant the group had no way to tell "hasn't opened the email" from "isn't
-- coming" — so the only options were to keep waiting or to keep re-inviting
-- someone who had already decided.
--
-- Declining marks the family opted_out, which the roster already renders and
-- which the consensus maths already excludes.
-- ===========================================================================

create or replace function public.decline_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv invitations%rowtype;
begin
  select * into v_inv from invitations where token = p_token;
  if not found then
    raise exception 'that invitation link is not valid';
  end if;

  -- No auth required, and none is possible: the whole point is to answer
  -- without signing up for anything. The token is the credential, and the worst
  -- a leaked one can do here is remove a family the holder could already see.
  -- A family the organizer removed stays removed.
  update families
     set status = 'opted_out'
   where id = v_inv.family_id
     and status in ('invited', 'active');

  -- Stamp the invitation so it stops showing as outstanding, but leave
  -- accepted_by_user_id null: nobody accepted it.
  update invitations
     set accepted_at = coalesce(accepted_at, now())
   where id = v_inv.id;

  return v_inv.trip_id;
end;
$$;

do $$
begin
  execute 'revoke execute on function public.decline_invitation(text) from public';
  execute 'grant execute on function public.decline_invitation(text) to anon, authenticated';
end $$;
