import { LodgingSearchPanel, PasteLinkForm } from '@/components/lodging/AddCandidatePanels';
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

  const [prefsRes, candidatesRes, picksRes] = await Promise.all([
    supabase.from('lodging_prefs').select('*').eq('trip_id', id),
    supabase.from('lodging_candidates').select('*').eq('trip_id', id).order('created_at'),
    supabase.from('lodging_picks').select('*').eq('trip_id', id),
  ]);

  const allPrefs = rows('lodging_prefs', prefsRes);
  const allCandidates = rows('lodging_candidates', candidatesRes);
  const allPicks = rows('lodging_picks', picksRes);
  const done = isPhaseComplete(ctx.phase, 'lodging');
  const locks = await loadPhaseLocks(id, 'lodging', ctx);

  const myPrefs = allPrefs.find((p) => p.family_id === ctx.myFamily?.id);
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
          source: c.source,
          addedByName: nameOf(c.added_by_family_id),
          canRemove: c.added_by_family_id === ctx.myFamily?.id || ctx.isOrganizer,
          pickedByNames: picksFor.map((p) => nameOf(p.family_id)),
          myRank: picksFor.find((p) => p.family_id === ctx.myFamily?.id)?.rank ?? null,
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
                  headcount={ctx.headcount}
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
                  Nearby places
                </h2>
                <LodgingSearchPanel
                  tripId={id}
                  headcount={ctx.headcount}
                  existingPlaceIds={allCandidates
                    .map((c) => c.google_place_id)
                    .filter((x): x is string => Boolean(x))}
                />
              </section>

              <section className="space-y-3">
                <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                  Found something yourself?
                </h2>
                <Card>
                  <PasteLinkForm tripId={id} />
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
