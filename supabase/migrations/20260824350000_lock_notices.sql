-- ===========================================================================
-- Announce a lock once, not every time somebody toggles it.
--
-- Locking a step now emails the families who have not finished. Unlocking
-- deletes the sign-off, so an unlock-and-relock — changing your mind twice,
-- which is a thing the UI explicitly invites — would announce it again, and
-- again. Nobody stays subscribed to an app that does that.
--
-- One announcement per family per step per six hours. Recorded rather than
-- inferred, because the sign-off row it would otherwise be inferred from is
-- exactly what unlocking removes.
-- ===========================================================================

create table if not exists phase_lock_notices (
  trip_id   uuid not null references trips(id) on delete cascade,
  phase     trip_phase not null,
  family_id uuid not null references families(id) on delete cascade,
  sent_at   timestamptz not null default now(),
  primary key (trip_id, phase, family_id)
);

alter table phase_lock_notices enable row level security;

drop policy if exists phase_lock_notices_read on phase_lock_notices;
create policy phase_lock_notices_read on phase_lock_notices for select to authenticated
  using (is_trip_member(trip_id));

/**
 * Claims the right to announce this family's lock, atomically.
 *
 * Returns true exactly once per six hours per family per step, so two clicks in
 * quick succession — or two servers handling the same click — cannot both send.
 * The caller sends only when this returns true.
 */
create or replace function public.claim_lock_announcement(p_trip_id uuid, p_phase trip_phase)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_family uuid;
  v_rows   integer;
begin
  v_family := my_family_id(p_trip_id);
  if v_family is null then return false; end if;

  insert into phase_lock_notices (trip_id, phase, family_id)
  values (p_trip_id, p_phase, v_family)
  on conflict (trip_id, phase, family_id) do update
     set sent_at = now()
   where phase_lock_notices.sent_at < now() - interval '6 hours';

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

grant select on phase_lock_notices to authenticated;
grant all on phase_lock_notices to service_role;

do $$
begin
  execute 'revoke execute on function public.claim_lock_announcement(uuid,trip_phase) from public';
  execute 'grant execute on function public.claim_lock_announcement(uuid,trip_phase) to authenticated';
end $$;
