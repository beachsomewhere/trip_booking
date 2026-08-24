-- ===========================================================================
-- A person belongs to one household, and can find the one they are listed in.
--
-- Three faults, all reachable by doing things in an ordinary order:
--
-- 1. Nothing linked a signing-in user to a household by email. Listing your
--    spouse on your family and having them sign in gave them a brand-new empty
--    household called "My family" — they saw none of the family they are in,
--    and would retype it.
--
-- 2. Signing in before accepting a trip invitation left them in TWO households:
--    the placeholder they made on arrival, and the real one accept_invitation
--    put them in. Nothing enforced one.
--
-- 3. ensure_household() then picked between those with `limit 1` and no order,
--    and in practice returned the empty placeholder — so accepting the
--    invitation correctly still showed an empty family page.
--
-- Claiming is offered, never taken. Anyone can type any address into their own
-- household, so auto-joining on an email match would let a stranger decide
-- which family you land in — and then watch you enter your children's names and
-- birthdays into it. The match only produces a question.
-- ===========================================================================

-- "That isn't me." Remembered, so it is asked once and not on every visit.
create table if not exists household_claim_declines (
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, household_id)
);

alter table household_claim_declines enable row level security;

drop policy if exists household_claim_declines_read on household_claim_declines;
create policy household_claim_declines_read on household_claim_declines
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Picking between households deterministically
-- ---------------------------------------------------------------------------

/**
 * The household to treat as mine.
 *
 * Ordered rather than `limit 1` on nothing: a real household — one with people
 * in it, or a name somebody chose — always beats an empty placeholder, and ties
 * break on age so the answer never changes between two requests.
 */
create or replace function public.my_household_id()
returns uuid language sql stable security definer set search_path = public as $$
  select hu.household_id
    from household_users hu
    join households h on h.id = hu.household_id
   where hu.user_id = auth.uid()
   order by (select count(*) from household_people p where p.household_id = h.id) desc,
            (h.name <> 'My family') desc,
            h.created_at asc
   limit 1;
$$;

create or replace function public.ensure_household(p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  v_id := my_household_id();
  if v_id is not null then return v_id; end if;

  insert into households (name, created_by_user_id)
  values (coalesce(nullif(trim(p_name), ''), 'My family'), auth.uid())
  returning id into v_id;

  insert into household_users (household_id, user_id) values (v_id, auth.uid());
  return v_id;
end;
$$;

/**
 * Drops a placeholder household this user no longer needs.
 *
 * Only ever removes one that is genuinely empty and genuinely theirs: nobody
 * else in it, no people, no trip family pointing at it, and never the one they
 * just joined. Anything else is left alone.
 */
create or replace function public.absorb_empty_household(p_keep uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from households h
   where h.id in (
     select hu.household_id from household_users hu where hu.user_id = auth.uid()
   )
     and h.id <> p_keep
     and not exists (select 1 from household_people p where p.household_id = h.id)
     and not exists (select 1 from families f where f.household_id = h.id)
     and not exists (
       select 1 from household_users hu2 where hu2.household_id = h.id and hu2.user_id <> auth.uid()
     );
end;
$$;

-- ---------------------------------------------------------------------------
-- Claiming the household you are listed in
-- ---------------------------------------------------------------------------

/**
 * Households listing my address against one of their people, that I am not
 * already in and have not already said no to.
 *
 * Returns the household's name and the name they have me down as, because that
 * pairing is what makes the question answerable: "The Barnes list you as Jo".
 */
create or replace function public.claimable_households()
returns table (household_id uuid, household_name text, person_name text)
language sql stable security definer set search_path = public as $$
  select distinct on (h.id) h.id, h.name, p.name
    from household_people p
    join household_person_emails e on e.person_id = p.id
    join households h on h.id = p.household_id
   where lower(e.email) = lower(auth.jwt() ->> 'email')
     and not exists (
       select 1 from household_users hu
        where hu.household_id = h.id and hu.user_id = auth.uid()
     )
     and not exists (
       select 1 from household_claim_declines d
        where d.household_id = h.id and d.user_id = auth.uid()
     )
   order by h.id, p.created_at;
$$;

/**
 * "Yes, that's me."
 *
 * Re-checks the address against that household's people rather than trusting
 * the id the browser sent, then folds away the placeholder household they were
 * given on arrival and puts them on the trips that family is already part of.
 */
create or replace function public.claim_household(p_household_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_family record;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  if not exists (
    select 1
      from household_people p
      join household_person_emails e on e.person_id = p.id
     where p.household_id = p_household_id
       and lower(e.email) = lower(auth.jwt() ->> 'email')
  ) then
    raise exception 'that family does not list your address';
  end if;

  insert into household_users (household_id, user_id)
  values (p_household_id, auth.uid())
  on conflict do nothing;

  perform absorb_empty_household(p_household_id);

  -- Being in the household is not being on its trips. Push the household's
  -- addresses onto each of its families, then bind the ones that are mine.
  for v_family in select id from families where household_id = p_household_id loop
    perform sync_household_emails(v_family.id);
  end loop;

  update family_members fm
     set user_id = auth.uid()
   where fm.user_id is null
     and lower(fm.email) = lower(auth.jwt() ->> 'email');
end;
$$;

create or replace function public.decline_household_claim(p_household_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into household_claim_declines (user_id, household_id)
  values (auth.uid(), p_household_id)
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accepting a trip invitation should not leave a placeholder behind.
-- ---------------------------------------------------------------------------

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
  if not found then raise exception 'that invitation link is not valid'; end if;
  if v_inv.expires_at < now() then raise exception 'that invitation link has expired'; end if;

  select * into v_family from families where id = v_inv.family_id;

  insert into family_members (family_id, email, user_id)
  values (v_inv.family_id, v_email, auth.uid())
  on conflict (family_id, email) do update set user_id = auth.uid();

  update families set status = 'active'
   where id = v_inv.family_id and status = 'invited';

  if v_family.household_id is not null then
    insert into household_users (household_id, user_id)
    values (v_family.household_id, auth.uid())
    on conflict do nothing;
    -- They may have signed in first and been handed an empty household on the
    -- way. Two households made ensure_household's answer a coin toss.
    perform absorb_empty_household(v_family.household_id);
    select name into v_hname from households where id = v_family.household_id;
  else
    update families set household_id = ensure_household(v_family.name)
     where id = v_inv.family_id;
  end if;

  update invitations
     set accepted_at = coalesce(accepted_at, now()),
         accepted_by_user_id = coalesce(accepted_by_user_id, auth.uid())
   where id = v_inv.id;

  perform sync_household_emails(v_inv.family_id);

  return v_inv.trip_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on household_claim_declines to authenticated;
grant all on household_claim_declines to service_role;

do $$
declare fn text;
begin
  foreach fn in array array[
    'my_household_id()',
    'ensure_household(text)',
    'absorb_empty_household(uuid)',
    'claimable_households()',
    'claim_household(uuid)',
    'decline_household_claim(uuid)',
    'accept_invitation(text)'
  ] loop
    execute format('revoke execute on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
