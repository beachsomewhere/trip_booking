-- ===========================================================================
-- "Families you've travelled with before."
--
-- Inviting the same people to a second trip meant retyping their name and every
-- email. This returns the households the caller has actually shared a trip with,
-- so the organizer can pick instead of type.
--
-- Privacy: this exposes only a family's display name and the email addresses the
-- caller already had access to as a member of that shared trip. It deliberately
-- does not reach into the other household's people, birth data, or any trip the
-- caller was not part of.
--
-- Nothing here links households at invite time, and that is on purpose:
-- accept_invitation() already resolves the joining user's own household, so a
-- returning family's people prefill correctly however they were invited.
-- ===========================================================================

create or replace function public.known_families(p_trip_id uuid)
returns table (household_id uuid, name text, emails text[], last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  with my_trips as (
    select distinct f.trip_id
      from families f
      join family_members fm on fm.family_id = f.id
     where fm.user_id = auth.uid()
  ),
  my_household as (
    select hu.household_id from household_users hu where hu.user_id = auth.uid()
  ),
  already_here as (
    select f.household_id
      from families f
     where f.trip_id = p_trip_id and f.household_id is not null
  ),
  seen as (
    select f.household_id,
           f.name,
           f.created_at,
           array_agg(distinct fm.email) as emails,
           row_number() over (
             partition by f.household_id order by f.created_at desc
           ) as rn
      from families f
      join my_trips t on t.trip_id = f.trip_id
      join family_members fm on fm.family_id = f.id
     where f.household_id is not null
       and f.status <> 'removed'
     group by f.household_id, f.name, f.created_at
  )
  select s.household_id, s.name, s.emails, s.created_at
    from seen s
   where s.rn = 1
     and s.household_id not in (select household_id from already_here)
     and s.household_id not in (select household_id from my_household)
   order by s.created_at desc
   limit 24;
$$;

do $$
begin
  execute 'revoke execute on function public.known_families(uuid) from public';
  execute 'grant execute on function public.known_families(uuid) to authenticated';
end $$;
