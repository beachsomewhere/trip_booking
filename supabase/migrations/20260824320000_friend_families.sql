-- ===========================================================================
-- Families you travel with, kept between trips.
--
-- The invite picker could only offer families you had already shared a trip
-- with, so the first trip with anyone new was always a retype — and a family
-- you know but have never travelled with was invisible entirely.
--
-- This lets someone build that circle ahead of time: add a family by email,
-- they accept, and from then on they are one tap on every trip.
--
-- Privacy: accepting shares a name and email addresses, and nothing else. That
-- is exactly what the invite form needs and exactly what sharing a trip already
-- exposes, so being in someone's circle reveals no more than travelling with
-- them once did. Headcount, ages and who is in the household stay private until
-- they actually join a trip.
-- ===========================================================================

create table if not exists household_links (
  id                   uuid primary key default gen_random_uuid(),
  from_household_id    uuid not null references households(id) on delete cascade,
  -- Null until they accept: the recipient may have no household, or no account
  -- at all. The address is what the request is actually addressed to.
  to_household_id      uuid references households(id) on delete set null,
  to_email             text not null,
  -- 256 bits from two UUIDs, as invitations does. gen_random_bytes lives in the
  -- extensions schema and is not reachable during `db push`.
  token                text not null unique
                         default (replace(gen_random_uuid()::text, '-', '')
                               || replace(gen_random_uuid()::text, '-', '')),
  requested_by_user_id uuid references auth.users(id) on delete set null,
  status               text not null default 'pending'
                         check (status in ('pending', 'accepted', 'declined')),
  responded_at         timestamptz,
  expires_at           timestamptz not null default (now() + interval '90 days'),
  created_at           timestamptz not null default now()
);

create index if not exists household_links_from_idx on household_links(from_household_id);
create index if not exists household_links_to_idx on household_links(to_household_id);
create index if not exists household_links_email_idx on household_links(lower(to_email));

-- One live request per address per household. A declined one may be re-sent,
-- which is why the index skips them.
create unique index if not exists household_links_unique_live
  on household_links(from_household_id, lower(to_email))
  where status <> 'declined';

-- ---------------------------------------------------------------------------
-- Security. Reads only; every write goes through a SECURITY DEFINER function,
-- the same shape invitations uses.
-- ---------------------------------------------------------------------------

alter table household_links enable row level security;

drop policy if exists household_links_read on household_links;
create policy household_links_read on household_links for select to authenticated
  using (
    is_my_household(from_household_id)
    or (to_household_id is not null and is_my_household(to_household_id))
    -- Addressed to me but I have no household yet: I still need to see it.
    or lower(to_email) = lower(auth.jwt() ->> 'email')
  );

-- ---------------------------------------------------------------------------
-- Requesting, answering, unlinking
-- ---------------------------------------------------------------------------

-- Signatures below are dropped first: this migration is re-runnable, and
-- `create or replace` cannot change a function's OUT parameters.
drop function if exists public.request_friend(text);
drop function if exists public.my_friends();
drop function if exists public.pending_friend_requests();
drop function if exists public.sent_friend_requests();

/**
 * Asks a family to join your circle. Returns the row, token included, so the
 * caller can send the email.
 */
create or replace function public.request_friend(p_email text)
-- Column names deliberately unlike the table's own: an OUT parameter called
-- to_household_id shadows the column inside the function body, and the UPDATE
-- below fails as ambiguous.
returns table (link_id uuid, link_token text, friend_household_id uuid, already_registered boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_from  uuid;
  v_email text := lower(trim(p_email));
  v_to    uuid;
  v_link  household_links%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'that does not look like an email address';
  end if;
  if v_email = lower(auth.jwt() ->> 'email') then
    raise exception 'that is your own address';
  end if;

  v_from := ensure_household(null);

  -- If they already have an account, bind the household now so the request
  -- reaches them in the app as well as by email.
  select hu.household_id into v_to
    from auth.users u
    join household_users hu on hu.user_id = u.id
   where lower(u.email) = v_email
   limit 1;

  if v_to = v_from then raise exception 'that is your own family'; end if;

  -- Already connected, either direction.
  if v_to is not null and exists (
    select 1 from household_links l
     where l.status = 'accepted'
       and ((l.from_household_id = v_from and l.to_household_id = v_to)
         or (l.from_household_id = v_to and l.to_household_id = v_from))
  ) then
    raise exception 'you are already connected';
  end if;

  -- A live request re-sent just gets a fresh clock, not a duplicate row.
  update household_links
     set expires_at = now() + interval '90 days',
         to_household_id = coalesce(to_household_id, v_to),
         requested_by_user_id = auth.uid()
   where from_household_id = v_from
     and lower(to_email) = v_email
     and status = 'pending'
  returning * into v_link;

  if not found then
    -- A previous decline is not a permanent block, but it must not collide with
    -- the live-request index either.
    delete from household_links
     where from_household_id = v_from and lower(to_email) = v_email and status = 'declined';

    insert into household_links (from_household_id, to_household_id, to_email, requested_by_user_id)
    values (v_from, v_to, v_email, auth.uid())
    returning * into v_link;
  end if;

  return query select v_link.id, v_link.token, v_link.to_household_id, v_to is not null;
end;
$$;

/** Shared guard: the pending, unexpired link this token names, addressed to me. */
create or replace function public.friend_link_for_token(p_token text)
returns household_links language plpgsql security definer set search_path = public as $$
declare v_link household_links%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_link from household_links where token = p_token;
  if not found then raise exception 'that link is not valid'; end if;
  if v_link.expires_at < now() then raise exception 'that link has expired'; end if;
  if lower(v_link.to_email) <> lower(auth.jwt() ->> 'email') then
    raise exception 'that request was sent to a different address';
  end if;

  return v_link;
end;
$$;

create or replace function public.accept_friend(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_link household_links%rowtype;
  v_mine uuid;
begin
  v_link := friend_link_for_token(p_token);
  v_mine := ensure_household(null);

  if v_mine = v_link.from_household_id then raise exception 'that is your own family'; end if;

  update household_links
     set status = 'accepted',
         to_household_id = v_mine,
         responded_at = now()
   where id = v_link.id;

  return v_link.from_household_id;
end;
$$;

create or replace function public.decline_friend(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare v_link household_links%rowtype;
begin
  v_link := friend_link_for_token(p_token);
  update household_links
     set status = 'declined', responded_at = now()
   where id = v_link.id;
end;
$$;

/** Either side may unlink, and cancelling a request you sent uses this too. */
create or replace function public.remove_friend(p_link_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  delete from household_links l
   where l.id = p_link_id
     and (is_my_household(l.from_household_id)
       or (l.to_household_id is not null and is_my_household(l.to_household_id))
       or lower(l.to_email) = lower(auth.jwt() ->> 'email'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

/**
 * Every household in my circle: name and addresses only.
 *
 * Addresses come from the household's own people. A household that has not
 * filled any in still returns the address the request went to, so the invite
 * form always has something to send to.
 */
create or replace function public.my_friends()
returns table (link_id uuid, household_id uuid, name text, emails text[], since timestamptz)
language sql stable security definer set search_path = public as $$
  with mine as (
    select hu.household_id from household_users hu where hu.user_id = auth.uid()
  ),
  links as (
    select l.id as link_id,
           case when l.from_household_id in (select household_id from mine)
                then l.to_household_id else l.from_household_id end as other_id,
           l.to_email,
           l.responded_at
      from household_links l
     where l.status = 'accepted'
       and (l.from_household_id in (select household_id from mine)
         or l.to_household_id in (select household_id from mine))
  )
  select k.link_id,
         k.other_id,
         h.name,
         coalesce(
           -- What they maintain themselves.
           (select array_agg(distinct lower(e.email) order by lower(e.email))
              from household_people p
              join household_person_emails e on e.person_id = p.id
             where p.household_id = k.other_id),
           -- Failing that, whoever signs in as them. A household always has at
           -- least one of these once it exists.
           (select array_agg(distinct lower(u.email) order by lower(u.email))
              from household_users hu
              join auth.users u on u.id = hu.user_id
             where hu.household_id = k.other_id),
           -- Last resort, and only meaningful looking *at* the recipient: the
           -- address the request was sent to. Looking the other way this is my
           -- own address, never theirs, so it must come after the two above.
           array[lower(k.to_email)]
         ),
         k.responded_at
    from links k
    join households h on h.id = k.other_id
   where k.other_id is not null
   order by h.name;
$$;

/** Requests waiting on me, by household or by address. */
create or replace function public.pending_friend_requests()
returns table (link_id uuid, token text, from_name text, requested_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id,
         l.token,
         h.name,
         l.created_at
    from household_links l
    join households h on h.id = l.from_household_id
   where l.status = 'pending'
     and l.expires_at > now()
     and (
       lower(l.to_email) = lower(auth.jwt() ->> 'email')
       or (l.to_household_id is not null and is_my_household(l.to_household_id))
     )
     -- Never show someone their own outgoing request.
     and not is_my_household(l.from_household_id)
   order by l.created_at desc;
$$;

/** Requests I have sent that nobody has answered yet. */
create or replace function public.sent_friend_requests()
returns table (link_id uuid, token text, to_email text, requested_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.token, l.to_email, l.created_at
    from household_links l
   where l.status = 'pending'
     and l.expires_at > now()
     and is_my_household(l.from_household_id)
   order by l.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- The invite picker now draws on both: your circle, and anyone you have
-- actually shared a trip with.
-- ---------------------------------------------------------------------------

drop function if exists public.known_families(uuid);

create or replace function public.known_families(p_trip_id uuid)
returns table (household_id uuid, name text, emails text[], last_seen timestamptz, source text)
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
  -- Source one: your circle.
  friends as (
    select f.household_id, f.name, f.emails, coalesce(f.since, now()) as seen, 'friend'::text as src
      from my_friends() f
  ),
  -- Source two: families you have shared a trip with, however that came about.
  travelled as (
    select f.household_id,
           f.name,
           array_agg(distinct lower(fm.email) order by lower(fm.email)) as emails,
           f.created_at as seen,
           'trip'::text as src
      from families f
      join my_trips t on t.trip_id = f.trip_id
      join family_members fm on fm.family_id = f.id
     where f.status <> 'removed'
       and f.trip_id <> p_trip_id
       and f.id not in (select id from my_families)
     group by f.id, f.household_id, f.name, f.created_at
  ),
  candidates as (
    select * from friends
    union all
    select * from travelled
  ),
  kept as (
    select c.*,
           -- Same household is the same family; failing that, the same set of
           -- addresses is. Re-inviting the Millers under a slightly different
           -- name still collapses to one entry.
           coalesce(c.household_id::text, array_to_string(c.emails, ',')) as dedupe_key
      from candidates c
     where (c.household_id is null or c.household_id not in (select household_id from here_households))
       and (c.household_id is null or c.household_id not in (select household_id from my_household))
       and not exists (select 1 from here_emails h where h.email = any (c.emails))
  ),
  ranked as (
    select k.*,
           row_number() over (
             partition by k.dedupe_key
             -- A circle entry wins over a trip entry for the same family: it is
             -- the one whose addresses they maintain themselves.
             order by (k.src = 'friend') desc, k.seen desc
           ) as rn
      from kept k
  )
  select r.household_id, r.name, r.emails, r.seen, r.src
    from ranked r
   where r.rn = 1
   order by (r.src = 'friend') desc, r.seen desc
   limit 24;
$$;

-- ---------------------------------------------------------------------------
-- Grants. RLS does not grant table access, and service_role needs its own.
-- ---------------------------------------------------------------------------

grant select on household_links to authenticated;
grant all on household_links to service_role;

do $$
declare fn text;
begin
  foreach fn in array array[
    'request_friend(text)',
    'friend_link_for_token(text)',
    'accept_friend(text)',
    'decline_friend(text)',
    'remove_friend(uuid)',
    'my_friends()',
    'pending_friend_requests()',
    'sent_friend_requests()',
    'known_families(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
