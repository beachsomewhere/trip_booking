-- ===========================================================================
-- Households: remember who a family is, across every trip they join.
--
-- Previously each trip asked for names and ages from scratch, and the ages went
-- stale the moment they were typed. A household is the persistent identity —
-- the people, and when they were born — that a trip's `families` row points at.
--
-- Birth data is stored as month + year, not a full date of birth. That is
-- enough to compute an exact age on any trip's start date, which is all the
-- headcount and lodging logic ever needs, without this app holding complete
-- dates of birth for other people's children.
-- ===========================================================================

create table if not exists households (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now()
);

-- Everyone who may edit this household. Spouses share one, so both see the
-- same children rather than each keeping a private copy.
create table if not exists household_users (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_users_user_idx on household_users(user_id);

create table if not exists household_people (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null,
  birth_year   integer check (birth_year is null or (birth_year between 1900 and 2100)),
  birth_month  integer check (birth_month is null or (birth_month between 1 and 12)),
  created_at   timestamptz not null default now()
);

create index if not exists household_people_household_idx on household_people(household_id);

alter table families add column if not exists household_id uuid references households(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Trip attendees carry a snapshot of the birth data, not just a pointer.
--
-- Other families need to see "The Chens: 3 people, 1 kid", and those reads are
-- already scoped to trip membership. Reading it off household_people instead
-- would mean granting every trip member access to every other household's
-- records — a much wider blast radius for a number we can simply copy.
-- ---------------------------------------------------------------------------
alter table family_attendees add column if not exists birth_year integer;
alter table family_attendees add column if not exists birth_month integer;
alter table family_attendees add column if not exists person_id uuid
  references household_people(id) on delete set null;

-- ===========================================================================
-- Security
-- ===========================================================================

create or replace function public.is_my_household(p_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_users
     where household_id = p_household_id and user_id = auth.uid()
  );
$$;

/**
 * The caller's household, created on first use.
 *
 * One household per user: joining a second family would be a different person's
 * household, which this app has no concept of.
 */
create or replace function public.ensure_household(p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select household_id into v_id from household_users where user_id = auth.uid() limit 1;
  if v_id is not null then return v_id; end if;

  insert into households (name, created_by_user_id)
  values (coalesce(nullif(trim(p_name), ''), 'My family'), auth.uid())
  returning id into v_id;

  insert into household_users (household_id, user_id) values (v_id, auth.uid());
  return v_id;
end;
$$;

alter table households        enable row level security;
alter table household_users   enable row level security;
alter table household_people  enable row level security;

drop policy if exists households_rw on households;
create policy households_rw on households for all to authenticated
  using (is_my_household(id)) with check (is_my_household(id));

drop policy if exists household_users_read on household_users;
create policy household_users_read on household_users for select to authenticated
  using (user_id = auth.uid() or is_my_household(household_id));

drop policy if exists household_people_rw on household_people;
create policy household_people_rw on household_people for all to authenticated
  using (is_my_household(household_id)) with check (is_my_household(household_id));

grant select, insert, update, delete on households, household_users, household_people to authenticated;
grant all on households, household_users, household_people to service_role;

-- ===========================================================================
-- Wire households into the two places a family comes into existence.
-- ===========================================================================

create or replace function public.create_trip(
  p_name        text,
  p_family_name text,
  p_target_days integer default 7
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_trip_id   uuid;
  v_family_id uuid;
  v_email     text := auth.jwt() ->> 'email';
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_family_name), '') = '' then
    raise exception 'trip name and family name are required';
  end if;

  insert into trips (name, organizer_user_id, target_finalize_by)
  values (trim(p_name), auth.uid(), current_date + greatest(coalesce(p_target_days, 7), 1))
  returning id into v_trip_id;

  insert into families (trip_id, name, status, created_by_user_id, household_id)
  values (v_trip_id, trim(p_family_name), 'active', auth.uid(), ensure_household(p_family_name))
  returning id into v_family_id;

  insert into family_members (family_id, email, user_id, is_primary)
  values (v_family_id, v_email, auth.uid(), true);

  return v_trip_id;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv    invitations%rowtype;
  v_family families%rowtype;
  v_email  text := lower(auth.jwt() ->> 'email');
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

  update families set status = 'active'
   where id = v_inv.family_id and status in ('invited', 'opted_out');

  select * into v_family from families where id = v_inv.family_id;

  -- A spouse joining an existing family joins that family's household rather
  -- than starting their own, so both maintain one shared list of people.
  if v_family.household_id is not null then
    insert into household_users (household_id, user_id)
    values (v_family.household_id, auth.uid())
    on conflict do nothing;
  else
    update families set household_id = ensure_household(v_family.name)
     where id = v_family.id;
  end if;

  update invitations
     set accepted_at = coalesce(accepted_at, now()),
         accepted_by_user_id = coalesce(accepted_by_user_id, auth.uid())
   where id = v_inv.id;

  return v_inv.trip_id;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'ensure_household(text)',
    'is_my_household(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- ===========================================================================
-- Backfill: adopt the people already entered on existing trips.
--
-- Without this, every family that has already filled in their headcount would
-- open the next trip to an empty form — the exact retyping this feature exists
-- to remove.
--
-- Ages are NOT converted into birth years. An age recorded at some unknown past
-- moment cannot be turned into a birth year without inventing one, and a wrong
-- birth year is worse than none: it would silently mis-age someone forever.
-- The legacy `age` column stays on family_attendees and lib/age.ts falls back to
-- it, so current trips keep reading correctly while people fill in a birth
-- month and year once, at their leisure.
-- ===========================================================================

do $$
declare
  r record;
  v_household uuid;
begin
  for r in
    select f.id as family_id, f.name as family_name, m.user_id
      from families f
      join lateral (
        select user_id
          from family_members
         where family_id = f.id and user_id is not null
         order by is_primary desc
         limit 1
      ) m on true
     where f.household_id is null
  loop
    select household_id into v_household
      from household_users where user_id = r.user_id limit 1;

    if v_household is null then
      insert into households (name, created_by_user_id)
      values (r.family_name, r.user_id)
      returning id into v_household;

      insert into household_users (household_id, user_id)
      values (v_household, r.user_id);
    end if;

    update families set household_id = v_household where id = r.family_id;

    insert into household_people (household_id, name, birth_year, birth_month)
    select v_household, a.name, a.birth_year, a.birth_month
      from family_attendees a
     where a.family_id = r.family_id
       and coalesce(trim(a.name), '') <> ''
       and not exists (
         select 1 from household_people hp
          where hp.household_id = v_household
            and lower(hp.name) = lower(a.name)
       );
  end loop;
end $$;

-- Point this trip's attendees at the household records they came from, so
-- ticking someone off and back on does not create a duplicate person.
update family_attendees a
   set person_id = hp.id
  from families f
  join household_people hp on hp.household_id = f.household_id
 where a.family_id = f.id
   and a.person_id is null
   and lower(hp.name) = lower(a.name);
