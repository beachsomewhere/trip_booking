-- ===========================================================================
-- "We'd rather have our own place."
--
-- The existing options ran together / separate_ok / no_preference, where
-- separate_ok means "we'd share, but nearby units are fine too". There was no
-- way to say the thing families actually say — that they want their own place —
-- and it matters beyond preference: a family looking on its own is shopping for
-- its own headcount, not the group's, so every capacity figure on the lodging
-- screen was wrong for them.
-- ===========================================================================

do $$ begin
  alter type stay_together_pref add value if not exists 'prefer_separate';
exception when duplicate_object then null; end $$;
