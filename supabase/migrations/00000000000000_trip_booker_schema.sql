-- ===========================================================================
-- trip_booker schema
--
-- Written idempotently throughout (`if not exists` / `drop ... if exists` /
-- duplicate_object guards) because this file is re-applied against a project
-- that already has some of it, rather than tracked as versioned migrations.
--
-- Apply locally:   supabase db reset      (runs this + seed.sql)
-- Apply remotely:  psql "$DATABASE_URL" -f supabase/schema.sql
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type trip_phase as enum ('invites','dates','destination','anchor','lodging','finalized');
exception when duplicate_object then null; end $$;

do $$ begin
  create type family_status as enum ('invited','active','opted_out','removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vote_choice as enum ('yes','maybe','no');
exception when duplicate_object then null; end $$;

do $$ begin
  create type proposal_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lodging_source as enum ('google','manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type housing_type as enum ('hotel','short_term_rental','resort','cabin','hostel');
exception when duplicate_object then null; end $$;

do $$ begin
  create type stay_together_pref as enum ('together','separate_ok','no_preference');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Trips
--
-- `phase` is the single state machine that drives the whole app. The agreed_*
-- columns are the resolved output of each phase, written by resolve_* RPCs.
-- ---------------------------------------------------------------------------

create table if not exists trips (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  organizer_user_id  uuid not null references auth.users(id) on delete cascade,
  phase              trip_phase not null default 'invites',
  target_finalize_by date not null default (current_date + 7),

  -- Resolved results, filled in as each phase closes.
  agreed_start_date  date,
  agreed_end_date    date,
  destination_name   text,
  destination_lat    double precision,
  destination_lng    double precision,
  anchor_name        text,
  anchor_lat         double precision,
  anchor_lng         double precision,
  anchor_radius_mi   numeric(5,1),
  housing_types      housing_type[],
  stay_together      boolean,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists trips_organizer_idx on trips(organizer_user_id);

-- ---------------------------------------------------------------------------
-- Families — the unit of participation. One family = one vote = one headcount.
-- ---------------------------------------------------------------------------

create table if not exists families (
  id                 uuid primary key default gen_random_uuid(),
  trip_id            uuid not null references trips(id) on delete cascade,
  name               text not null,
  status             family_status not null default 'invited',
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (trip_id, name)
);

create index if not exists families_trip_idx on families(trip_id);

-- Multiple emails (spouses) collapse into one family.
create table if not exists family_members (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  email      text not null,
  user_id    uuid references auth.users(id) on delete set null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (family_id, email)
);

create index if not exists family_members_user_idx on family_members(user_id);
create index if not exists family_members_email_idx on family_members(lower(email));

-- Headcount with ages, per the spec.
create table if not exists family_attendees (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  name       text,
  age        integer check (age is null or (age >= 0 and age < 120)),
  created_at timestamptz not null default now()
);

create index if not exists family_attendees_family_idx on family_attendees(family_id);

create table if not exists invitations (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references trips(id) on delete cascade,
  family_id           uuid not null references families(id) on delete cascade,
  email               text not null,
  token               text not null unique default encode(gen_random_bytes(24), 'hex'),
  sent_at             timestamptz,
  accepted_at         timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  expires_at          timestamptz not null default (now() + interval '30 days'),
  created_at          timestamptz not null default now()
);

create index if not exists invitations_trip_idx on invitations(trip_id);
create index if not exists invitations_email_idx on invitations(lower(email));

-- ---------------------------------------------------------------------------
-- The add-a-family approval gate.
--
-- Anyone can propose adding a family, but the invitation does not go out until
-- every already-active family approves. This is the spec's "do you agree to
-- this addition" requirement.
-- ---------------------------------------------------------------------------

create table if not exists family_proposals (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid not null references trips(id) on delete cascade,
  proposed_name         text not null,
  proposed_emails       text[] not null,
  proposed_adults       integer not null default 0,
  proposed_children     integer not null default 0,
  note                  text,
  proposed_by_family_id uuid references families(id) on delete set null,
  proposed_by_user_id   uuid not null references auth.users(id) on delete cascade,
  status                proposal_status not null default 'pending',
  resolved_at           timestamptz,
  created_family_id     uuid references families(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index if not exists family_proposals_trip_idx on family_proposals(trip_id);

create table if not exists family_proposal_votes (
  proposal_id uuid not null references family_proposals(id) on delete cascade,
  trip_id     uuid not null references trips(id) on delete cascade,
  family_id   uuid not null references families(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  approve     boolean not null,
  created_at  timestamptz not null default now(),
  primary key (proposal_id, family_id)
);

-- ---------------------------------------------------------------------------
-- Phase 2-4 proposals and votes.
--
-- These three tables are deliberately the same shape: a family proposes, other
-- families vote yes/maybe/no. The app builds one UI and one set of server
-- actions over all of them rather than three near-identical features.
-- ---------------------------------------------------------------------------

create table if not exists date_proposals (
  id                 uuid primary key default gen_random_uuid(),
  trip_id            uuid not null references trips(id) on delete cascade,
  family_id          uuid not null references families(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  start_date         date not null,
  end_date           date not null,
  note               text,
  withdrawn_at       timestamptz,
  created_at         timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists date_proposals_trip_idx on date_proposals(trip_id);

create table if not exists date_votes (
  proposal_id uuid not null references date_proposals(id) on delete cascade,
  trip_id     uuid not null references trips(id) on delete cascade,
  family_id   uuid not null references families(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  choice      vote_choice not null,
  updated_at  timestamptz not null default now(),
  primary key (proposal_id, family_id)
);

create index if not exists date_votes_trip_idx on date_votes(trip_id);

create table if not exists destination_proposals (
  id                 uuid primary key default gen_random_uuid(),
  trip_id            uuid not null references trips(id) on delete cascade,
  family_id          uuid not null references families(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  google_place_id    text,
  name               text not null,
  formatted_address  text,
  lat                double precision,
  lng                double precision,
  photo_url          text,
  note               text,
  withdrawn_at       timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists destination_proposals_trip_idx on destination_proposals(trip_id);

create table if not exists destination_votes (
  proposal_id uuid not null references destination_proposals(id) on delete cascade,
  trip_id     uuid not null references trips(id) on delete cascade,
  family_id   uuid not null references families(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  choice      vote_choice not null,
  updated_at  timestamptz not null default now(),
  primary key (proposal_id, family_id)
);

create index if not exists destination_votes_trip_idx on destination_votes(trip_id);

create table if not exists anchor_proposals (
  id                 uuid primary key default gen_random_uuid(),
  trip_id            uuid not null references trips(id) on delete cascade,
  family_id          uuid not null references families(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  google_place_id    text,
  name               text not null,
  formatted_address  text,
  lat                double precision not null,
  lng                double precision not null,
  radius_mi          numeric(5,1) not null default 5 check (radius_mi > 0 and radius_mi <= 31),
  note               text,
  withdrawn_at       timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists anchor_proposals_trip_idx on anchor_proposals(trip_id);

create table if not exists anchor_votes (
  proposal_id uuid not null references anchor_proposals(id) on delete cascade,
  trip_id     uuid not null references trips(id) on delete cascade,
  family_id   uuid not null references families(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  choice      vote_choice not null,
  updated_at  timestamptz not null default now(),
  primary key (proposal_id, family_id)
);

create index if not exists anchor_votes_trip_idx on anchor_votes(trip_id);

-- ---------------------------------------------------------------------------
-- Phase 5: lodging
-- ---------------------------------------------------------------------------

create table if not exists lodging_prefs (
  trip_id            uuid not null references trips(id) on delete cascade,
  family_id          uuid not null references families(id) on delete cascade,
  housing_types      housing_type[] not null default '{}',
  stay_together_pref stay_together_pref not null default 'no_preference',
  updated_at         timestamptz not null default now(),
  primary key (trip_id, family_id)
);

-- Candidates come from two sources: a Google Places search inside the anchor
-- circle, or a URL a family pasted. Airbnb and VRBO have no public API, so the
-- pasted-link path is not a nicety — it is the only way STRs get in here.
create table if not exists lodging_candidates (
  id                 uuid primary key default gen_random_uuid(),
  trip_id            uuid not null references trips(id) on delete cascade,
  source             lodging_source not null,
  google_place_id    text,
  url                text,
  name               text not null,
  address            text,
  lat                double precision,
  lng                double precision,
  photo_url          text,
  rating             numeric(2,1),
  price_note         text,
  -- Google Places does not expose capacity. Families fill this in by hand.
  capacity_note      text,
  housing_type       housing_type,
  added_by_family_id uuid references families(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists lodging_candidates_trip_idx on lodging_candidates(trip_id);

create unique index if not exists lodging_candidates_trip_place_key
  on lodging_candidates(trip_id, google_place_id) where google_place_id is not null;
create unique index if not exists lodging_candidates_trip_url_key
  on lodging_candidates(trip_id, url) where url is not null;

-- Each family's top 5, ranked.
create table if not exists lodging_picks (
  trip_id      uuid not null references trips(id) on delete cascade,
  family_id    uuid not null references families(id) on delete cascade,
  candidate_id uuid not null references lodging_candidates(id) on delete cascade,
  rank         integer not null check (rank between 1 and 5),
  created_at   timestamptz not null default now(),
  primary key (family_id, candidate_id)
);

create index if not exists lodging_picks_trip_idx on lodging_picks(trip_id);

-- The final answer. Multiple rows when the group agreed separate units are OK.
create table if not exists lodging_selections (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references trips(id) on delete cascade,
  candidate_id uuid not null references lodging_candidates(id) on delete cascade,
  label        text,
  created_at   timestamptz not null default now(),
  unique (trip_id, candidate_id)
);

create table if not exists lodging_selection_families (
  selection_id uuid not null references lodging_selections(id) on delete cascade,
  family_id    uuid not null references families(id) on delete cascade,
  primary key (selection_id, family_id)
);

-- ---------------------------------------------------------------------------
-- Phase machinery: "this family is done with this phase".
-- ---------------------------------------------------------------------------

create table if not exists phase_signoffs (
  trip_id       uuid not null references trips(id) on delete cascade,
  phase         trip_phase not null,
  family_id     uuid not null references families(id) on delete cascade,
  signed_off_at timestamptz not null default now(),
  primary key (trip_id, phase, family_id)
);

-- ===========================================================================
-- Security helpers
--
-- All SECURITY DEFINER so they bypass RLS internally. This matters: a policy on
-- `families` that queries `families` through a non-definer function recurses
-- infinitely. These are the only safe way to express membership in a policy.
-- ===========================================================================

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from family_members fm
      join families f on f.id = fm.family_id
     where f.trip_id = p_trip_id
       and fm.user_id = auth.uid()
       and f.status in ('invited','active')
  ) or exists (
    select 1 from trips t
     where t.id = p_trip_id and t.organizer_user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_organizer(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trips t
     where t.id = p_trip_id and t.organizer_user_id = auth.uid()
  );
$$;

-- The caller's family within a trip. Every proposal and vote is attributed to
-- this, never to a client-supplied family_id.
create or replace function public.my_family_id(p_trip_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select f.id
    from families f
    join family_members fm on fm.family_id = f.id
   where f.trip_id = p_trip_id
     and fm.user_id = auth.uid()
     and f.status in ('invited','active')
   limit 1;
$$;

create or replace function public.trip_of_family(p_family_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select trip_id from families where id = p_family_id;
$$;

-- ===========================================================================
-- Signup plumbing
-- ===========================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  -- A spouse invited as a second email on a family can sign in directly,
  -- without ever clicking their own invite link. Bind them on first signup.
  update family_members
     set user_id = new.id
   where lower(email) = lower(new.email)
     and user_id is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table profiles                  enable row level security;
alter table trips                     enable row level security;
alter table families                  enable row level security;
alter table family_members            enable row level security;
alter table family_attendees          enable row level security;
alter table invitations               enable row level security;
alter table family_proposals          enable row level security;
alter table family_proposal_votes     enable row level security;
alter table date_proposals            enable row level security;
alter table date_votes                enable row level security;
alter table destination_proposals     enable row level security;
alter table destination_votes         enable row level security;
alter table anchor_proposals          enable row level security;
alter table anchor_votes              enable row level security;
alter table lodging_prefs             enable row level security;
alter table lodging_candidates        enable row level security;
alter table lodging_picks             enable row level security;
alter table lodging_selections        enable row level security;
alter table lodging_selection_families enable row level security;
alter table phase_signoffs            enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select to authenticated using (true);

drop policy if exists profiles_self_write on profiles;
create policy profiles_self_write on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- trips ----------------------------------------------------------------------
-- No direct insert/update: trips are created by create_trip() and mutated by
-- the organizer-only RPCs, so the phase can never be forged from the client.
drop policy if exists trips_read on trips;
create policy trips_read on trips for select to authenticated using (is_trip_member(id));

-- families / members / attendees ---------------------------------------------
drop policy if exists families_read on families;
create policy families_read on families for select to authenticated using (is_trip_member(trip_id));

drop policy if exists family_members_read on family_members;
create policy family_members_read on family_members for select to authenticated
  using (is_trip_member(trip_of_family(family_id)));

drop policy if exists family_attendees_read on family_attendees;
create policy family_attendees_read on family_attendees for select to authenticated
  using (is_trip_member(trip_of_family(family_id)));

-- A family edits its own roster and headcount directly; everything else about
-- families goes through an RPC.
drop policy if exists family_attendees_write on family_attendees;
create policy family_attendees_write on family_attendees for all to authenticated
  using (family_id = my_family_id(trip_of_family(family_id)))
  with check (family_id = my_family_id(trip_of_family(family_id)));

drop policy if exists family_members_write on family_members;
create policy family_members_write on family_members for all to authenticated
  using (family_id = my_family_id(trip_of_family(family_id)))
  with check (family_id = my_family_id(trip_of_family(family_id)));

-- invitations ----------------------------------------------------------------
-- Read-only to members. Token lookup happens through the service-role client,
-- because the recipient is by definition not a member yet.
drop policy if exists invitations_read on invitations;
create policy invitations_read on invitations for select to authenticated
  using (is_trip_member(trip_id));

-- family proposals -----------------------------------------------------------
drop policy if exists family_proposals_read on family_proposals;
create policy family_proposals_read on family_proposals for select to authenticated
  using (is_trip_member(trip_id));

drop policy if exists family_proposal_votes_read on family_proposal_votes;
create policy family_proposal_votes_read on family_proposal_votes for select to authenticated
  using (is_trip_member(trip_id));

-- ---------------------------------------------------------------------------
-- Proposal and vote policies for phases 2-4.
--
-- Identical shape three times over: read if you are in the trip, write only as
-- your own family. Kept explicit rather than generated, because a policy you
-- cannot read is a policy you cannot audit.
-- ---------------------------------------------------------------------------

drop policy if exists date_proposals_read on date_proposals;
create policy date_proposals_read on date_proposals for select to authenticated
  using (is_trip_member(trip_id));
drop policy if exists date_proposals_write on date_proposals;
create policy date_proposals_write on date_proposals for all to authenticated
  using (family_id = my_family_id(trip_id))
  with check (family_id = my_family_id(trip_id) and created_by_user_id = auth.uid());

drop policy if exists date_votes_read on date_votes;
create policy date_votes_read on date_votes for select to authenticated
  using (is_trip_member(trip_id));
drop policy if exists date_votes_write on date_votes;
create policy date_votes_write on date_votes for all to authenticated
  using (family_id = my_family_id(trip_id))
  with check (family_id = my_family_id(trip_id) and user_id = auth.uid());

drop policy if exists destination_proposals_read on destination_proposals;
create policy destination_proposals_read on destination_proposals for select to authenticated
  using (is_trip_member(trip_id));
drop policy if exists destination_proposals_write on destination_proposals;
create policy destination_proposals_write on destination_proposals for all to authenticated
  using (family_id = my_family_id(trip_id))
  with check (family_id = my_family_id(trip_id) and created_by_user_id = auth.uid());

drop policy if exists destination_votes_read on destination_votes;
create policy destination_votes_read on destination_votes for select to authenticated
  using (is_trip_member(trip_id));
drop policy if exists destination_votes_write on destination_votes;
create policy destination_votes_write on destination_votes for all to authenticated
  using (family_id = my_family_id(trip_id))
  with check (family_id = my_family_id(trip_id) and user_id = auth.uid());

drop policy if exists anchor_proposals_read on anchor_proposals;
create policy anchor_proposals_read on anchor_proposals for select to authenticated
  using (is_trip_member(trip_id));
drop policy if exists anchor_proposals_write on anchor_proposals;
create policy anchor_proposals_write on anchor_proposals for all to authenticated
  using (family_id = my_family_id(trip_id))
  with check (family_id = my_family_id(trip_id) and created_by_user_id = auth.uid());

drop policy if exists anchor_votes_read on anchor_votes;
create policy anchor_votes_read on anchor_votes for select to authenticated
  using (is_trip_member(trip_id));
drop policy if exists anchor_votes_write on anchor_votes;
create policy anchor_votes_write on anchor_votes for all to authenticated
  using (family_id = my_family_id(trip_id))
  with check (family_id = my_family_id(trip_id) and user_id = auth.uid());

-- lodging --------------------------------------------------------------------
drop policy if exists lodging_prefs_read on lodging_prefs;
create policy lodging_prefs_read on lodging_prefs for select to authenticated
  using (is_trip_member(trip_id));
drop policy if exists lodging_prefs_write on lodging_prefs;
create policy lodging_prefs_write on lodging_prefs for all to authenticated
  using (family_id = my_family_id(trip_id))
  with check (family_id = my_family_id(trip_id));

drop policy if exists lodging_candidates_read on lodging_candidates;
create policy lodging_candidates_read on lodging_candidates for select to authenticated
  using (is_trip_member(trip_id));
-- Anyone in the trip may add a candidate; nobody may delete someone else's.
drop policy if exists lodging_candidates_insert on lodging_candidates;
create policy lodging_candidates_insert on lodging_candidates for insert to authenticated
  with check (is_trip_member(trip_id));
drop policy if exists lodging_candidates_delete on lodging_candidates;
create policy lodging_candidates_delete on lodging_candidates for delete to authenticated
  using (added_by_family_id = my_family_id(trip_id) or is_trip_organizer(trip_id));

drop policy if exists lodging_picks_read on lodging_picks;
create policy lodging_picks_read on lodging_picks for select to authenticated
  using (is_trip_member(trip_id));
drop policy if exists lodging_picks_write on lodging_picks;
create policy lodging_picks_write on lodging_picks for all to authenticated
  using (family_id = my_family_id(trip_id))
  with check (family_id = my_family_id(trip_id));

drop policy if exists lodging_selections_read on lodging_selections;
create policy lodging_selections_read on lodging_selections for select to authenticated
  using (is_trip_member(trip_id));

drop policy if exists lodging_selection_families_read on lodging_selection_families;
create policy lodging_selection_families_read on lodging_selection_families for select to authenticated
  using (is_trip_member(trip_of_family(family_id)));

-- phase signoffs -------------------------------------------------------------
drop policy if exists phase_signoffs_read on phase_signoffs;
create policy phase_signoffs_read on phase_signoffs for select to authenticated
  using (is_trip_member(trip_id));
drop policy if exists phase_signoffs_write on phase_signoffs;
create policy phase_signoffs_write on phase_signoffs for all to authenticated
  using (family_id = my_family_id(trip_id))
  with check (family_id = my_family_id(trip_id));

-- ===========================================================================
-- RPCs
--
-- Everything the client must not be able to forge lives here: creating trips,
-- redeeming invitation tokens, approving family additions, advancing the phase,
-- and removing a family. RLS deliberately grants no direct insert on trips,
-- families, invitations, or family_proposals, so these are the only way in.
-- ===========================================================================

-- Creates the trip and the organizer's own family in one transaction, so a
-- trip can never exist with an organizer who is not a participant.
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

  insert into families (trip_id, name, status, created_by_user_id)
  values (v_trip_id, trim(p_family_name), 'active', auth.uid())
  returning id into v_family_id;

  insert into family_members (family_id, email, user_id, is_primary)
  values (v_family_id, v_email, auth.uid(), true);

  return v_trip_id;
end;
$$;

-- Organizer seeds the initial roster. Only during the `invites` phase — after
-- that, additions go through propose_family()'s approval gate, which is the
-- spec's "do you agree to this addition" requirement.
create or replace function public.invite_family(
  p_trip_id  uuid,
  p_name     text,
  p_emails   text[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_family_id uuid;
  v_email     text;
  v_phase     trip_phase;
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

      insert into invitations (trip_id, family_id, email)
      values (p_trip_id, v_family_id, lower(trim(v_email)));
    end if;
  end loop;

  return v_family_id;
end;
$$;

-- Redeems an invitation token. The token itself is the credential (24 random
-- bytes), so any signed-in user holding it may redeem it — that is deliberate,
-- because invite links get forwarded to spouses constantly. If the redeemer's
-- email is not already on the family, they are added to it.
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

  update families set status = 'active'
   where id = v_inv.family_id and status = 'invited';

  update invitations
     set accepted_at = coalesce(accepted_at, now()),
         accepted_by_user_id = coalesce(accepted_by_user_id, auth.uid())
   where id = v_inv.id;

  return v_inv.trip_id;
end;
$$;

-- Anyone in the trip may propose adding a family. Nothing is sent until every
-- other active family approves.
create or replace function public.propose_family(
  p_trip_id  uuid,
  p_name     text,
  p_emails   text[],
  p_adults   integer default 0,
  p_children integer default 0,
  p_note     text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_proposal_id uuid;
  v_family_id   uuid := my_family_id(p_trip_id);
begin
  if v_family_id is null then
    raise exception 'you are not part of this trip';
  end if;
  if coalesce(array_length(p_emails, 1), 0) = 0 then
    raise exception 'at least one email is required';
  end if;

  insert into family_proposals (
    trip_id, proposed_name, proposed_emails, proposed_adults, proposed_children,
    note, proposed_by_family_id, proposed_by_user_id
  ) values (
    p_trip_id, trim(p_name), p_emails, greatest(coalesce(p_adults, 0), 0),
    greatest(coalesce(p_children, 0), 0), p_note, v_family_id, auth.uid()
  ) returning id into v_proposal_id;

  -- Proposing is itself a yes.
  insert into family_proposal_votes (proposal_id, trip_id, family_id, user_id, approve)
  values (v_proposal_id, p_trip_id, v_family_id, auth.uid(), true);

  return v_proposal_id;
end;
$$;

-- Unanimous among active families. One rejection kills the proposal outright —
-- if a family does not want these people on the trip, more voting will not help.
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

  -- Unanimous: create the family and queue its invitations.
  insert into families (trip_id, name, status, created_by_user_id)
  values (v_prop.trip_id, v_prop.proposed_name, 'invited', v_prop.proposed_by_user_id)
  returning id into v_new_family;

  foreach v_email in array v_prop.proposed_emails loop
    if coalesce(trim(v_email), '') <> '' then
      insert into family_members (family_id, email, is_primary)
      values (v_new_family, lower(trim(v_email)), v_email = v_prop.proposed_emails[1])
      on conflict (family_id, email) do nothing;

      insert into invitations (trip_id, family_id, email)
      values (v_prop.trip_id, v_new_family, lower(trim(v_email)));
    end if;
  end loop;

  update family_proposals
     set status = 'approved', resolved_at = now(), created_family_id = v_new_family
   where id = p_proposal_id;

  return 'approved';
end;
$$;

-- Opting out is self-service; removing someone else is the organizer's call.
-- This is the escape hatch for a family that is holding up the whole trip.
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
  elsif not is_trip_organizer(v_trip_id) then
    raise exception 'only the organizer can change another family''s status';
  end if;

  update families set status = p_status where id = p_family_id;
end;
$$;

-- The organizer's lever. Deliberately permits any target phase, including
-- going back: a group that picked the wrong week needs to redo dates without
-- starting over, and "the organizer said so" is the whole authority model here.
create or replace function public.advance_phase(p_trip_id uuid, p_to trip_phase)
returns trip_phase language plpgsql security definer set search_path = public as $$
begin
  if not is_trip_organizer(p_trip_id) then
    raise exception 'only the organizer can move the trip to the next step';
  end if;

  update trips set phase = p_to, updated_at = now() where id = p_trip_id;
  return p_to;
end;
$$;

create or replace function public.resolve_dates(p_trip_id uuid, p_proposal_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_p date_proposals%rowtype;
begin
  if not is_trip_organizer(p_trip_id) then raise exception 'organizer only'; end if;
  select * into v_p from date_proposals where id = p_proposal_id and trip_id = p_trip_id;
  if not found then raise exception 'no such date proposal on this trip'; end if;

  update trips
     set agreed_start_date = v_p.start_date,
         agreed_end_date   = v_p.end_date,
         phase             = 'destination',
         updated_at        = now()
   where id = p_trip_id;
end;
$$;

create or replace function public.resolve_destination(p_trip_id uuid, p_proposal_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_p destination_proposals%rowtype;
begin
  if not is_trip_organizer(p_trip_id) then raise exception 'organizer only'; end if;
  select * into v_p from destination_proposals where id = p_proposal_id and trip_id = p_trip_id;
  if not found then raise exception 'no such destination proposal on this trip'; end if;

  update trips
     set destination_name = v_p.name,
         destination_lat  = v_p.lat,
         destination_lng  = v_p.lng,
         phase            = 'anchor',
         updated_at       = now()
   where id = p_trip_id;
end;
$$;

create or replace function public.resolve_anchor(p_trip_id uuid, p_proposal_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_p anchor_proposals%rowtype;
begin
  if not is_trip_organizer(p_trip_id) then raise exception 'organizer only'; end if;
  select * into v_p from anchor_proposals where id = p_proposal_id and trip_id = p_trip_id;
  if not found then raise exception 'no such anchor proposal on this trip'; end if;

  update trips
     set anchor_name      = v_p.name,
         anchor_lat       = v_p.lat,
         anchor_lng       = v_p.lng,
         anchor_radius_mi = v_p.radius_mi,
         phase            = 'lodging',
         updated_at       = now()
   where id = p_trip_id;
end;
$$;

-- Collapses every family's housing-type picks into the group's answer, then
-- locks it in. Union of types (nobody gets excluded), and "stay together" only
-- if at least one family asked for it and none demanded separate.
create or replace function public.resolve_lodging_prefs(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_types     housing_type[];
  v_together  boolean;
begin
  if not is_trip_organizer(p_trip_id) then raise exception 'organizer only'; end if;

  select array_agg(distinct t) into v_types
    from lodging_prefs lp, unnest(lp.housing_types) as t
   where lp.trip_id = p_trip_id;

  select bool_or(stay_together_pref = 'together') into v_together
    from lodging_prefs where trip_id = p_trip_id;

  update trips
     set housing_types  = coalesce(v_types, array['hotel','short_term_rental']::housing_type[]),
         stay_together  = coalesce(v_together, false),
         updated_at     = now()
   where id = p_trip_id;
end;
$$;

-- Finalizes the trip: one selection row per unit, with families assigned to it.
create or replace function public.set_lodging_selection(
  p_trip_id      uuid,
  p_candidate_id uuid,
  p_family_ids   uuid[],
  p_label        text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_selection_id uuid;
  v_family_id    uuid;
begin
  if not is_trip_organizer(p_trip_id) then raise exception 'organizer only'; end if;

  insert into lodging_selections (trip_id, candidate_id, label)
  values (p_trip_id, p_candidate_id, p_label)
  on conflict (trip_id, candidate_id) do update set label = excluded.label
  returning id into v_selection_id;

  delete from lodging_selection_families where selection_id = v_selection_id;

  if p_family_ids is not null then
    foreach v_family_id in array p_family_ids loop
      insert into lodging_selection_families (selection_id, family_id)
      values (v_selection_id, v_family_id)
      on conflict do nothing;
    end loop;
  end if;

  return v_selection_id;
end;
$$;

create or replace function public.clear_lodging_selection(p_trip_id uuid, p_selection_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_trip_organizer(p_trip_id) then raise exception 'organizer only'; end if;
  delete from lodging_selections where id = p_selection_id and trip_id = p_trip_id;
end;
$$;

create or replace function public.set_trip_target(p_trip_id uuid, p_target date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_trip_organizer(p_trip_id) then raise exception 'organizer only'; end if;
  update trips set target_finalize_by = p_target, updated_at = now() where id = p_trip_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Default is EXECUTE to public; narrow it to signed-in users.
-- ---------------------------------------------------------------------------

do $$
declare fn text;
begin
  foreach fn in array array[
    'create_trip(text,text,integer)',
    'invite_family(uuid,text,text[])',
    'accept_invitation(text)',
    'propose_family(uuid,text,text[],integer,integer,text)',
    'vote_family_proposal(uuid,boolean)',
    'set_family_status(uuid,family_status)',
    'advance_phase(uuid,trip_phase)',
    'resolve_dates(uuid,uuid)',
    'resolve_destination(uuid,uuid)',
    'resolve_anchor(uuid,uuid)',
    'resolve_lodging_prefs(uuid)',
    'set_lodging_selection(uuid,uuid,uuid[],text)',
    'clear_lodging_selection(uuid,uuid)',
    'set_trip_target(uuid,date)',
    'is_trip_member(uuid)',
    'is_trip_organizer(uuid)',
    'my_family_id(uuid)',
    'trip_of_family(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- ===========================================================================
-- Table grants.
--
-- RLS policies filter rows; they do not grant access to a table. Without these
-- GRANTs every query fails with "permission denied for table" before a policy
-- is ever consulted — the failure looks identical to a policy that returned no
-- rows, which makes it a genuinely nasty one to debug.
--
-- Granting broadly here is safe and is the standard Supabase model: RLS is
-- enabled on every table above, and a table with no permissive policy for an
-- operation still denies it.
-- ===========================================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
