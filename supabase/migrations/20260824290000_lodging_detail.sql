-- ===========================================================================
-- More to go on when reviewing a pasted listing.
--
-- The Google Places nearby search has been removed: it knows nothing about
-- capacity, nightly rate or availability, which is all anyone actually needs to
-- judge a place to stay. Pasted links are now the only source, so the app has
-- to work harder at reading them.
-- ===========================================================================

alter table lodging_candidates add column if not exists description text;
alter table lodging_candidates add column if not exists bedrooms text;
