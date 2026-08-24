-- ===========================================================================
-- Anyone can add a family, and the invite goes straight out.
--
-- Two restrictions are removed together, because they were two halves of the
-- same assumption — that adding someone needed guarding.
--
--   * invite_family was organizer-only, and only during the `invites` phase.
--     Everyone else saw "the organizer is still building the guest list".
--   * Additions after that went through an approval gate: unanimous agreement
--     from every active family before an email could be sent.
--
-- The gate was in the original design, and it does not survive contact with the
-- actual use case. These are families who already know each other; asking three
-- of them to vote before an email can be sent is friction that buys nothing.
-- Anyone can now add anyone, at any point, and the invitation sends immediately
-- and identically to one the organizer sent.
--
-- The proposal tables are dropped rather than left dead: both are empty in
-- production, and a table nothing writes to is a trap for whoever reads this
-- schema next.
-- ===========================================================================

create or replace function public.invite_family(
  p_trip_id  uuid,
  p_name     text,
  p_emails   text[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_family_id uuid;
  v_email     text;
  v_inviter   uuid := my_family_id(p_trip_id);
begin
  -- Any participating family, not just the organizer, and at any phase.
  if v_inviter is null and not is_trip_organizer(p_trip_id) then
    raise exception 'you are not part of this trip';
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

drop function if exists public.propose_family(uuid, text, text[], integer, integer, text);
drop function if exists public.vote_family_proposal(uuid, boolean);

drop table if exists family_proposal_votes;
drop table if exists family_proposals;
