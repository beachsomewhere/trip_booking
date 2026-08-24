-- ===========================================================================
-- A reason attached to a vote.
--
-- "Less preferred" tells the group there is a problem but not what it is, so
-- the only way to find out is to ask — in a side channel the app cannot see,
-- which is where these plans go to die. "Our in-laws are away that week" is
-- something another family can actually work around.
-- ===========================================================================

alter table date_votes add column if not exists note text;
alter table destination_votes add column if not exists note text;
