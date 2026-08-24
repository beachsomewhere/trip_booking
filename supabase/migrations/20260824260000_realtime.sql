-- ===========================================================================
-- Publish trip tables for realtime.
--
-- Several families act on the same trip at the same time, so every screen was a
-- snapshot: you could be voting on a week another family had already withdrawn,
-- or waiting on someone who locked in ten minutes ago.
--
-- Only tables whose changes alter what a trip screen shows are published.
-- Households and their people are deliberately excluded — they are private to a
-- family and nobody else's view depends on them.
-- ===========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'trips',
    'families',
    'invitations',
    'phase_signoffs',
    'date_proposals',
    'date_votes',
    'destination_proposals',
    'destination_votes',
    'lodging_prefs',
    'lodging_candidates',
    'lodging_picks',
    'lodging_comments',
    'lodging_selections'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception
      when duplicate_object then null;  -- already published
      when undefined_object then null;  -- publication absent (non-Supabase pg)
    end;
  end loop;
end $$;
