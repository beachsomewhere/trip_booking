-- ===========================================================================
-- "Families you've travelled with" should not require them to have joined.
--
-- The first cut only returned families with a household_id, which is set when
-- someone accepts an invitation. So a family you invited last trip who never
-- clicked the link — exactly the people most likely to need inviting again —
-- was invisible, and so was anyone who joined before households existed. The
-- picker silently showed nothing and the feature looked absent.
--
-- Everything it needs is the name and the emails, and those are on the shared
-- trip whether or not anyone accepted anything. household_id is now just a
-- better dedupe key when it happens to be there.
--
-- Privacy is unchanged: this returns names and addresses the caller already had
-- as a member of that shared trip, and reaches into no household's people, no
-- birth data, and no trip the caller was not part of.
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
  my_families as (
    select f.id
      from families f
      join family_members fm on fm.family_id = f.id
     where fm.user_id = auth.uid()
  ),
  my_household as (
    select hu.household_id from household_users hu where hu.user_id = auth.uid()
  ),
  -- Everyone already on this trip, matched both ways: a household when they
  -- have one, an address otherwise.
  here_households as (
    select f.household_id
      from families f
     where f.trip_id = p_trip_id and f.household_id is not null
  ),
  here_emails as (
    select lower(fm.email) as email
      from families f
      join family_members fm on fm.family_id = f.id
     where f.trip_id = p_trip_id
  ),
  candidates as (
    select f.household_id,
           f.name,
           f.created_at,
           array_agg(distinct lower(fm.email) order by lower(fm.email)) as emails
      from families f
      join my_trips t on t.trip_id = f.trip_id
      join family_members fm on fm.family_id = f.id
     where f.status <> 'removed'
       and f.trip_id <> p_trip_id
       and f.id not in (select id from my_families)
     group by f.id, f.household_id, f.name, f.created_at
  ),
  kept as (
    select c.*,
           -- Same household is the same family. Failing that, the same set of
           -- addresses is: re-inviting the Millers under a new name each trip
           -- should still collapse to one entry.
           coalesce(c.household_id::text, array_to_string(c.emails, ',')) as dedupe_key
      from candidates c
     where (c.household_id is null or c.household_id not in (select household_id from here_households))
       and (c.household_id is null or c.household_id not in (select household_id from my_household))
       and not exists (select 1 from here_emails h where h.email = any (c.emails))
  ),
  ranked as (
    select k.*, row_number() over (partition by k.dedupe_key order by k.created_at desc) as rn
      from kept k
  )
  select r.household_id, r.name, r.emails, r.created_at
    from ranked r
   where r.rn = 1
   order by r.created_at desc
   limit 24;
$$;

do $$
begin
  execute 'revoke execute on function public.known_families(uuid) from public';
  execute 'grant execute on function public.known_families(uuid) to authenticated';
end $$;
