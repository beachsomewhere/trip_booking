-- ===========================================================================
-- Local development seed. Runs automatically after migrations on `db reset`.
--
-- Creates three families on one trip so the consensus behaviour -- partial
-- agreement, a front-runner, a family that has gone quiet -- can be exercised
-- without inviting three real people.
--
-- Sign in as any of these with a magic link; the mail lands in Mailpit at
-- http://127.0.0.1:54324. No passwords are set, because the app has none.
-- ===========================================================================

do $$
declare
  v_trip      uuid := '11111111-1111-1111-1111-111111111111';
  v_barnes    uuid := '22222222-2222-2222-2222-222222222221';
  v_chen      uuid := '22222222-2222-2222-2222-222222222222';
  v_okafor    uuid := '22222222-2222-2222-2222-222222222223';
  v_u_kyle    uuid := '33333333-3333-3333-3333-333333333331';
  v_u_sam     uuid := '33333333-3333-3333-3333-333333333332';
  v_u_mei     uuid := '33333333-3333-3333-3333-333333333333';
  v_u_ade     uuid := '33333333-3333-3333-3333-333333333334';
begin
  if exists (select 1 from trips where id = v_trip) then
    raise notice 'seed already applied, skipping';
    return;
  end if;

  -- Auth users. Two non-obvious requirements:
  --   * email_confirmed_at must be set, or sign-in bounces through confirmation.
  --   * the *_token and email_change columns must be '' and never NULL. GoTrue
  --     scans them into non-nullable Go strings, so a NULL surfaces as the
  --     thoroughly unhelpful "Database error finding user" at sign-in time.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new,
    email_change_token_current, email_change, phone_change, phone_change_token,
    reauthentication_token
  )
  select
    '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
    u.email, '', now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', u.display_name),
    '', '', '', '', '', '', '', ''
  from (values
    (v_u_kyle, 'kyle@barnes.test',  'Kyle'),
    (v_u_sam,  'sam@barnes.test',   'Sam'),
    (v_u_mei,  'mei@chen.test',     'Mei'),
    (v_u_ade,  'ade@okafor.test',   'Ade')
  ) as u(id, email, display_name)
  on conflict (id) do nothing;

  insert into trips (id, name, organizer_user_id, phase, target_finalize_by)
  values (v_trip, 'Keystone ski week', v_u_kyle, 'dates', current_date + 6);

  insert into families (id, trip_id, name, status, created_by_user_id) values
    (v_barnes, v_trip, 'The Barnes', 'active',  v_u_kyle),
    (v_chen,   v_trip, 'The Chens',  'active',  v_u_mei),
    -- Invited but never accepted: this is the family the organizer eventually
    -- has to decide whether to wait for.
    (v_okafor, v_trip, 'The Okafors', 'invited', v_u_kyle);

  insert into family_members (family_id, email, user_id, is_primary) values
    (v_barnes, 'kyle@barnes.test', v_u_kyle, true),
    (v_barnes, 'sam@barnes.test',  v_u_sam,  false),
    (v_chen,   'mei@chen.test',    v_u_mei,  true),
    (v_okafor, 'ade@okafor.test',  v_u_ade,  true);

  -- Birth month + year rather than an age: see lib/age.ts for why.
  insert into family_attendees (family_id, name, birth_month, birth_year) values
    (v_barnes, 'Kyle', 4, 1985), (v_barnes, 'Sam', 9, 1987),
    (v_barnes, 'Ellie', 2, 2017), (v_barnes, 'Nate', 11, 2019),
    (v_chen, 'Mei', 6, 1982), (v_chen, 'Jon', 1, 1981), (v_chen, 'Ivy', 8, 2014),
    (v_okafor, 'Ade', 3, 1988), (v_okafor, 'Tolu', 12, 1988);

  insert into invitations (trip_id, family_id, email, sent_at)
  values (v_trip, v_okafor, 'ade@okafor.test', now());

  -- Two date proposals with one vote already cast, so the board has something
  -- to show and the "front-runner" styling is visible on first load.
  insert into date_proposals (id, trip_id, family_id, created_by_user_id, start_date, end_date, note)
  values
    ('44444444-4444-4444-4444-444444444441', v_trip, v_barnes, v_u_kyle,
     current_date + 60, current_date + 67, 'Lines up with the school break'),
    ('44444444-4444-4444-4444-444444444442', v_trip, v_chen, v_u_mei,
     current_date + 74, current_date + 80, 'Cheaper the week after');

  insert into date_votes (proposal_id, trip_id, family_id, user_id, choice) values
    ('44444444-4444-4444-4444-444444444441', v_trip, v_chen, v_u_mei, 'yes');

  raise notice 'seed applied: trip % ', v_trip;
end $$;
