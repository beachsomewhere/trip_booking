-- ===========================================================================
-- Record who did the inviting.
--
-- The invite email read the family name off the invitation's family_id — which
-- is the family being invited. So every email told the recipient that they had
-- added themselves: "Millers added your family", sent to the Millers.
--
-- The sender cannot be inferred at send time either: invitations created by the
-- approval gate are flushed by whichever family casts the last approving vote,
-- who is generally not the one who proposed them. So it is recorded on the row
-- when the invitation is created.
-- ===========================================================================

alter table invitations add column if not exists invited_by_family_id uuid
  references families(id) on delete set null;

-- Organizer seeds the initial roster; the inviting family is their own.
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
  if not is_trip_organizer(p_trip_id) then
    raise exception 'only the organizer can add families directly';
  end if;

  select phase into v_phase from trips where id = p_trip_id;
  if v_phase <> 'invites' then
    raise exception 'the roster is locked once the trip has started; propose the addition instead';
  end if;
  if coalesce(array_length(p_emails, 1), 0) = 0 then
    raise exception 'at least one email is required';
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

-- Through the approval gate, the inviting family is whoever proposed them —
-- not whoever happened to cast the final approving vote.
create or replace function public.vote_family_proposal(
  p_proposal_id uuid,
  p_approve     boolean
) returns proposal_status language plpgsql security definer set search_path = public as $$
declare
  v_prop        family_proposals%rowtype;
  v_family_id   uuid;
  v_active      integer;
  v_approvals   integer;
  v_new_family  uuid;
  v_email       text;
begin
  select * into v_prop from family_proposals where id = p_proposal_id;
  if not found then raise exception 'no such proposal'; end if;
  if v_prop.status <> 'pending' then return v_prop.status; end if;

  v_family_id := my_family_id(v_prop.trip_id);
  if v_family_id is null then raise exception 'you are not part of this trip'; end if;

  insert into family_proposal_votes (proposal_id, trip_id, family_id, user_id, approve)
  values (p_proposal_id, v_prop.trip_id, v_family_id, auth.uid(), p_approve)
  on conflict (proposal_id, family_id)
  do update set approve = excluded.approve, user_id = excluded.user_id;

  if not p_approve then
    update family_proposals set status = 'rejected', resolved_at = now() where id = p_proposal_id;
    return 'rejected';
  end if;

  select count(*) into v_active from families
   where trip_id = v_prop.trip_id and status = 'active';

  select count(*) into v_approvals
    from family_proposal_votes v
    join families f on f.id = v.family_id and f.status = 'active'
   where v.proposal_id = p_proposal_id and v.approve;

  if v_approvals < v_active then
    return 'pending';
  end if;

  insert into families (trip_id, name, status, created_by_user_id)
  values (v_prop.trip_id, v_prop.proposed_name, 'invited', v_prop.proposed_by_user_id)
  returning id into v_new_family;

  foreach v_email in array v_prop.proposed_emails loop
    if coalesce(trim(v_email), '') <> '' then
      insert into family_members (family_id, email, is_primary)
      values (v_new_family, lower(trim(v_email)), v_email = v_prop.proposed_emails[1])
      on conflict (family_id, email) do nothing;

      insert into invitations (trip_id, family_id, email, invited_by_family_id)
      values (v_prop.trip_id, v_new_family, lower(trim(v_email)), v_prop.proposed_by_family_id);
    end if;
  end loop;

  update family_proposals
     set status = 'approved', resolved_at = now(), created_family_id = v_new_family
   where id = p_proposal_id;

  return 'approved';
end;
$$;

-- Existing invitations: attribute them to the trip's organizer family, which is
-- who sent them in every case the app could produce before now.
update invitations i
   set invited_by_family_id = f.id
  from trips t
  join families f on f.trip_id = t.id
  join family_members fm on fm.family_id = f.id and fm.user_id = t.organizer_user_id
 where i.trip_id = t.id
   and i.invited_by_family_id is null;
