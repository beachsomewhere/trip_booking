-- ===========================================================================
-- Three suggestions per family.
--
-- Five families adding freely produces a list nobody reads, and a shortlist
-- drawn from a list nobody read is worthless. A cap forces the useful behaviour
-- — look at what is already there, and only add something if it genuinely beats
-- it — which is the same reason the dates step hides its form once you have
-- marked a week preferred.
--
-- Enforced in a trigger rather than the action so it holds regardless of which
-- code path adds the row.
-- ===========================================================================

create or replace function public.enforce_lodging_suggestion_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if new.added_by_family_id is null then
    return new;
  end if;

  select count(*) into v_count
    from lodging_candidates
   where trip_id = new.trip_id
     and added_by_family_id = new.added_by_family_id;

  if v_count >= 3 then
    raise exception
      'Your family has already suggested three places. Remove one first, or shortlist from what is already there.';
  end if;

  return new;
end;
$$;

drop trigger if exists lodging_suggestion_limit on lodging_candidates;
create trigger lodging_suggestion_limit
  before insert on lodging_candidates
  for each row execute function public.enforce_lodging_suggestion_limit();
