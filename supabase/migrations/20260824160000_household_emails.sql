-- ===========================================================================
-- Emails belong to people, and a household owns its own name.
--
-- Two problems, one shape:
--
--   * Who can see a trip was a per-trip question — a spouse added on one trip
--     was a stranger on the next.
--   * A flat list of household addresses could not say whose was whose.
--
-- So addresses hang off a person. Someone who follows the planning but is not
-- travelling is simply a person you never tick as coming, which means "who is
-- in this family" and "who gets updates" stop being two separate lists.
--
-- family_members remains the per-trip record — it is what RLS reads and what
-- other families can see. These tables are the durable source that fills it.
-- ===========================================================================

create table if not exists household_person_emails (
  person_id  uuid not null references household_people(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  primary key (person_id, email)
);

create index if not exists household_person_emails_email_idx
  on household_person_emails(lower(email));

alter table household_person_emails enable row level security;

-- Reached through the person, so membership is checked on the owning household.
create or replace function public.is_my_person(p_person_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from household_people hp
      join household_users hu on hu.household_id = hp.household_id
     where hp.id = p_person_id and hu.user_id = auth.uid()
  );
$$;

drop policy if exists household_person_emails_rw on household_person_emails;
create policy household_person_emails_rw on household_person_emails for all to authenticated
  using (is_my_person(person_id)) with check (is_my_person(person_id));

grant select, insert, update, delete on household_person_emails to authenticated;
grant all on household_person_emails to service_role;

-- ---------------------------------------------------------------------------
-- Copies a household's addresses onto one trip family.
--
-- Additive only. It never removes an address someone added directly to a trip,
-- because that could cut off a person who is actively using it.
--
-- No backfill of existing trip addresses onto people: there is no reliable way
-- to tell whose address is whose from the address alone, and guessing would
-- attribute somebody's email to the wrong person. Existing family_members rows
-- keep working untouched; people gain addresses as they are entered.
-- ---------------------------------------------------------------------------
create or replace function public.sync_household_emails(p_family_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_household uuid;
begin
  select household_id into v_household from families where id = p_family_id;
  if v_household is null then return; end if;

  insert into family_members (family_id, email)
  select p_family_id, lower(pe.email)
    from household_people hp
    join household_person_emails pe on pe.person_id = hp.id
   where hp.household_id = v_household
  on conflict (family_id, email) do nothing;
end;
$$;

-- ===========================================================================
-- The household's own name.
--
-- "The Barnes" is what this family calls itself, and it should be what every
-- trip shows — not whatever each organizer happened to type into an invite.
-- ===========================================================================

create or replace function public.rename_household(p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_household uuid := ensure_household(p_name);
  v_clean     text := trim(p_name);
begin
  if coalesce(v_clean, '') = '' then
    raise exception 'your family needs a name';
  end if;

  update households set name = v_clean where id = v_household;

  -- Carry it to trips already under way. `unique (trip_id, name)` means a clash
  -- with another family on the same trip must be skipped rather than fail the
  -- whole rename; that one trip keeps the older label.
  update families f
     set name = v_clean
   where f.household_id = v_household
     and f.name <> v_clean
     and not exists (
       select 1 from families other
        where other.trip_id = f.trip_id
          and other.id <> f.id
          and other.name = v_clean
     );
end;
$$;

-- ===========================================================================
-- Pick all of this up wherever a family comes into existence.
-- ===========================================================================

create or replace function public.create_trip(
  p_name        text,
  p_family_name text,
  p_target_days integer default 7
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_trip_id   uuid;
  v_family_id uuid;
  v_household uuid;
  v_email     text := auth.jwt() ->> 'email';
  v_hname     text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_family_name), '') = '' then
    raise exception 'trip name and family name are required';
  end if;

  v_household := ensure_household(p_family_name);
  select name into v_hname from households where id = v_household;

  insert into trips (name, organizer_user_id, target_finalize_by)
  values (trim(p_name), auth.uid(), current_date + greatest(coalesce(p_target_days, 7), 1))
  returning id into v_trip_id;

  insert into families (trip_id, name, status, created_by_user_id, household_id)
  values (v_trip_id, coalesce(nullif(trim(p_family_name), ''), v_hname), 'active',
          auth.uid(), v_household)
  returning id into v_family_id;

  insert into family_members (family_id, email, user_id, is_primary)
  values (v_family_id, v_email, auth.uid(), true)
  on conflict (family_id, email) do update set user_id = auth.uid();

  perform sync_household_emails(v_family_id);

  return v_trip_id;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv    invitations%rowtype;
  v_family families%rowtype;
  v_email  text := lower(auth.jwt() ->> 'email');
  v_hname  text;
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

  if v_family.household_id is not null then
    insert into household_users (household_id, user_id)
    values (v_family.household_id, auth.uid())
    on conflict do nothing;
  else
    update families set household_id = ensure_household(v_family.name)
     where id = v_family.id;
    select * into v_family from families where id = v_inv.family_id;
  end if;

  if v_family.household_id is not null then
    select name into v_hname from households where id = v_family.household_id;

    -- Adopt the family's own name, unless another family on this trip already
    -- answers to it.
    if v_hname is not null and v_hname <> v_family.name and not exists (
      select 1 from families other
       where other.trip_id = v_family.trip_id
         and other.id <> v_family.id
         and other.name = v_hname
    ) then
      update families set name = v_hname where id = v_family.id;
    end if;
  end if;

  perform sync_household_emails(v_inv.family_id);

  update invitations
     set accepted_at = coalesce(accepted_at, now()),
         accepted_by_user_id = coalesce(accepted_by_user_id, auth.uid())
   where id = v_inv.id;

  return v_inv.trip_id;
end;
$$;

-- The picker offers a family's own name and their people's addresses.
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
  )
  select h.id,
         h.name,
         coalesce((
           select array_agg(distinct fm.email)
             from families f2
             join family_members fm on fm.family_id = f2.id
            where f2.household_id = h.id
              and f2.trip_id in (select trip_id from my_trips)
         ), array[]::text[]),
         max(f.created_at)
    from households h
    join families f on f.household_id = h.id
    join my_trips t on t.trip_id = f.trip_id
   where f.status <> 'removed'
     and h.id not in (select household_id from already_here)
     and h.id not in (select household_id from my_household)
   group by h.id, h.name
   order by max(f.created_at) desc
   limit 24;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'sync_household_emails(uuid)',
    'rename_household(text)',
    'is_my_person(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
