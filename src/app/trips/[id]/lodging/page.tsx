import { PasteLinkForm } from '@/components/lodging/AddCandidatePanels';
import { CandidateGrid, CopyPicksButton, type CandidateView } from '@/components/lodging/CandidateGrid';
import { LodgingPrefsForm } from '@/components/lodging/LodgingPrefsForm';
import { ResolvePrefsButton } from '@/components/lodging/ResolvePrefsButton';
import { PhaseLockPanel } from '@/components/PhaseLockPanel';
import { Badge, Card, EmptyState, PageTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { loadPhaseLocks, loadTripContext, rows } from '@/lib/queries';
import { HOUSING_LABEL, pluralize } from '@/lib/format';
import { isPhaseComplete } from '@/lib/phases';

export default async function LodgingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadTripContext(id);
  const supabase = await createClient();

  const [prefsRes, candidatesRes, picksRes, commentsRes] = await Promise.all([
    supabase.from('lodging_prefs').select('*').eq('trip_id', id),
    supabase.from('lodging_candidates').select('*').eq('trip_id', id).order('created_at'),
    supabase.from('lodging_picks').select('*').eq('trip_id', id),
    supabase.from('lodging_comments').select('*').eq('trip_id', id),
  ]);

  const allPrefs = rows('lodging_prefs', prefsRes);
  const allCandidates = rows('lodging_candidates', candidatesRes);
  const allPicks = rows('lodging_picks', picksRes);
  const allComments = rows('lodging_comments', commentsRes);

  // Three suggestions per family, enforced in the database. Five families adding
  // freely produces a list nobody reads, and a shortlist drawn from a list
  // nobody read is worthless.
  const myCandidateCount = allCandidates.filter(
    (c) => c.added_by_family_id === ctx.myFamily?.id,
  ).length;
  const remainingSuggestions = Math.max(0, 3 - myCandidateCount);

  const done = isPhaseComplete(ctx.phase, 'lodging');
  // Same rule as the voting steps: a lock predating the newest candidate was a
  // verdict on a shorter list.
  const newestCandidateAt = allCandidates.map((c) => c.created_at).sort().at(-1) ?? null;
  const locks = await loadPhaseLocks(id, 'lodging', ctx, newestCandidateAt);

  const myPrefs = allPrefs.find((p) => p.family_id === ctx.myFamily?.id);
  // A family looking for its own place is shopping for its own headcount, not
  // the group's — showing "sleeps 9 needed" to a family of three who said they
  // want their own place is worse than showing nothing.
  const lookingAlone = myPrefs?.stay_together_pref === 'prefer_separate';
  const myHeadcount = ctx.myFamily?.family_attendees.length ?? 0;
  const capacityNeeded = lookingAlone && myHeadcount > 0 ? myHeadcount : ctx.headcount;
  const prefsSettled = (ctx.trip.housing_types ?? []).length > 0;
  const familiesWithPrefs = allPrefs.length;

  const nameOf = (familyId: string | null) =>
    ctx.families.find((f) => f.id === familyId)?.name ?? 'someone';

  const myPicks = allPicks.filter((p) => p.family_id === ctx.myFamily?.id);

  const views: CandidateView[] = allCandidates
    .map((c) => {
      const picksFor = allPicks.filter((p) => p.candidate_id === c.id);
      return {
        candidate: c,
        popularity: picksFor.length,
        view: {
          id: c.id,
          name: c.name,
          address: c.address,
          photoUrl: c.photo_url,
          url: c.url,
          priceNote: c.price_note,
          capacityNote: c.capacity_note,
          rating: c.rating,
          bedrooms: c.bedrooms,
          description: c.description,
          source: c.source,
          addedByName: nameOf(c.added_by_family_id),
          canRemove: c.added_by_family_id === ctx.myFamily?.id || ctx.isOrganizer,
          pickedByNames: picksFor.map((p) => nameOf(p.family_id)),
          myRank: picksFor.find((p) => p.family_id === ctx.myFamily?.id)?.rank ?? null,
          comments: allComments
            .filter((m) => m.candidate_id === c.id)
            .map((m) => ({ familyName: nameOf(m.family_id), note: m.note })),
          myComment:
            allComments.find(
              (m) => m.candidate_id === c.id && m.family_id === ctx.myFamily?.id,
            )?.note ?? '',
        } satisfies CandidateView,
      };
    })
    // Most-shortlisted first: this is the coalescing the spec asks for, and it
    // means the group's answer surfaces without anyone tallying anything.
    .sort((a, b) => b.popularity - a.popularity)
    .map((x) => x.view);

  // Another family with a shortlist you can adopt wholesale.
  const otherWithPicks = ctx.votingFamilies
    .filter((f) => f.id !== ctx.myFamily?.id)
    .map((f) => ({ f, n: allPicks.filter((p) => p.family_id === f.id).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)[0];

  const consensus = views.filter((v) => v.pickedByNames.length > 1);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Where to stay"
        subtitle={
          prefsSettled
            ? 'Add places anyone would stay, then shortlist your five. Where families overlap is the answer.'
            : 'First, what kind of place suits everyone.'
        }
      />

      {ctx.trip.destination_name ? (
        <p className="text-sm text-muted">
          {ctx.trip.destination_name} · {pluralize(ctx.headcount, 'person', 'people')}
          {ctx.children > 0 ? ` (${ctx.children} under 18)` : ''}
        </p>
      ) : null}

      {/* -- Step one: what kind of place ---------------------------------- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            What we&apos;re looking for
          </h2>
          {prefsSettled ? (
            <Badge tone="good">
              {(ctx.trip.housing_types ?? []).map((t) => HOUSING_LABEL[t]).join(', ')} ·{' '}
              {ctx.trip.stay_together ? 'together' : 'separate OK'}
            </Badge>
          ) : (
            <span className="text-sm text-muted">
              {familiesWithPrefs} of {ctx.votingFamilies.length} answered
            </span>
          )}
        </div>

        {!done && ctx.myFamily?.status === 'active' ? (
          <Card>
            <LodgingPrefsForm
              tripId={id}
              initialTypes={myPrefs?.housing_types ?? ['hotel', 'short_term_rental']}
              initialTogether={myPrefs?.stay_together_pref ?? 'no_preference'}
            />
          </Card>
        ) : null}

        {ctx.isOrganizer && !prefsSettled && familiesWithPrefs > 0 ? (
          <ResolvePrefsButton tripId={id} />
        ) : null}
      </section>

      {/* -- Step two: candidates ------------------------------------------ */}
      {prefsSettled ? (
        <>
          <section className="space-y-3">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              The list so far
            </h2>
            {views.length === 0 ? (
              <EmptyState
                title="Nothing shortlisted yet"
                body="Add a few from the search below, or paste links to places you already have in mind."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted">
                    You&apos;ve picked {myPicks.length} of 5
                  </p>
                  {otherWithPicks && myPicks.length === 0 ? (
                    <CopyPicksButton
                      tripId={id}
                      fromFamilyId={otherWithPicks.f.id}
                      fromFamilyName={otherWithPicks.f.name}
                      count={otherWithPicks.n}
                    />
                  ) : null}
                </div>
                <CandidateGrid
                  tripId={id}
                  candidates={views}
                  canPick={!done && ctx.myFamily?.status === 'active'}
                  pickCount={myPicks.length}
                  headcount={capacityNeeded}
                  headcountIsMineOnly={lookingAlone}
                />
              </>
            )}
          </section>

          {consensus.length > 0 ? (
            <Card className="bg-accent-soft">
              <p className="text-sm text-text">
                <strong>{consensus.length}</strong>{' '}
                {consensus.length === 1 ? 'place is' : 'places are'} on more than one family&apos;s
                shortlist: {consensus.map((c) => c.name).join(', ')}.
              </p>
            </Card>
          ) : null}

          {!done && ctx.myFamily?.status === 'active' ? (
            <>

              <section className="space-y-3">
                <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                  Add a place
                </h2>
                <p className="text-sm text-muted">
                  {remainingSuggestions > 0
                    ? `Paste a link and we'll read what we can off the page. ${remainingSuggestions} left — look through what's already here first.`
                    : "You've suggested your three."}
                </p>
                <Card>
                  {remainingSuggestions > 0 ? (
                    <PasteLinkForm tripId={id} />
                  ) : (
                    <p className="text-sm text-muted">
                      You&apos;ve suggested your three. Remove one above to swap it for something
                      better.
                    </p>
                  )}
                </Card>
              </section>
            </>
          ) : null}

          {!done && views.length > 0 ? (
            <PhaseLockPanel
              tripId={id}
              phase="lodging"
              nextPhase="finalized"
              rows={locks}
              isOrganizer={ctx.isOrganizer}
              advanceLabel="Everyone's in — go to the summary"
              canLock={ctx.myFamily?.status === 'active'}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
