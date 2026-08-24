import Link from 'next/link';
import { AssignUnits, UnbookButton, type AssignableCandidate } from '@/components/lodging/AssignUnits';
import { AdvanceButton } from '@/components/AdvanceButton';
import { Badge, Card, EmptyState, PageTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { loadTripContext, rows } from '@/lib/queries';
import { formatDateRange, nightsBetween, pluralize } from '@/lib/format';

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadTripContext(id);
  const supabase = await createClient();

  const [candidatesRes, picksRes, selectionsRes] = await Promise.all([
    supabase.from('lodging_candidates').select('*').eq('trip_id', id),
    supabase.from('lodging_picks').select('*').eq('trip_id', id),
    supabase.from('lodging_selections').select('*').eq('trip_id', id),
  ]);

  const allCandidates = rows('lodging_candidates', candidatesRes);
  const allPicks = rows('lodging_picks', picksRes);
  const allSelections = rows('lodging_selections', selectionsRes);

  // Scope the join table to this trip's selections. RLS would let a member of
  // two trips see both, and an unscoped read would mix them together here.
  const { data: assigned } = allSelections.length
    ? await supabase
        .from('lodging_selection_families')
        .select('*')
        .in('selection_id', allSelections.map((s) => s.id))
    : { data: [] };

  const links = assigned ?? [];

  const nameOf = (familyId: string | null) =>
    ctx.families.find((f) => f.id === familyId)?.name ?? 'someone';

  const byId = new Map(allCandidates.map((c) => [c.id, c]));

  // Shortlisted by at least one family, most-shortlisted first.
  const shortlisted: AssignableCandidate[] = allCandidates
    .map((c) => ({
      id: c.id,
      name: c.name,
      pickedByNames: allPicks.filter((p) => p.candidate_id === c.id).map((p) => nameOf(p.family_id)),
    }))
    .filter((c) => c.pickedByNames.length > 0)
    .sort((a, b) => b.pickedByNames.length - a.pickedByNames.length);

  const assignments: Record<string, string[]> = {};
  for (const sel of allSelections) {
    assignments[sel.candidate_id] = links
      .filter((l) => l.selection_id === sel.id)
      .map((l) => l.family_id);
  }

  const nights =
    ctx.trip.agreed_start_date && ctx.trip.agreed_end_date
      ? nightsBetween(ctx.trip.agreed_start_date, ctx.trip.agreed_end_date)
      : null;

  const placed = new Set(links.map((l) => l.family_id));
  const unassigned = ctx.votingFamilies.filter((f) => !placed.has(f.id));

  return (
    <div className="space-y-6">
      <PageTitle
        title={ctx.phase === 'finalized' ? 'Locked in' : 'Where things stand'}
        subtitle={
          ctx.phase === 'finalized'
            ? 'Everything the group agreed. Go book it.'
            : 'The decisions made so far.'
        }
      />

      {/* -- The answer ----------------------------------------------------- */}
      <Card className="space-y-4">
        <Row label="When">
          {ctx.trip.agreed_start_date && ctx.trip.agreed_end_date ? (
            <>
              {formatDateRange(ctx.trip.agreed_start_date, ctx.trip.agreed_end_date)}
              <span className="ml-2 text-sm text-muted">{pluralize(nights ?? 0, 'night')}</span>
            </>
          ) : (
            <Pending href={`/trips/${id}/dates`}>Not agreed yet</Pending>
          )}
        </Row>

        <Row label="Where">
          {ctx.trip.destination_name ?? (
            <Pending href={`/trips/${id}/destination`}>Not picked yet</Pending>
          )}
        </Row>

        <Row label="Area">
          {ctx.trip.anchor_name ? (
            <>
              {ctx.trip.anchor_name}
              <span className="ml-2 text-sm text-muted">
                within {ctx.trip.anchor_radius_mi} miles
              </span>
            </>
          ) : (
            <Pending href={`/trips/${id}/anchor`}>Not set yet</Pending>
          )}
        </Row>

        <Row label="Who">
          {ctx.votingFamilies.map((f) => f.name).join(', ')}
          <span className="ml-2 text-sm text-muted">
            {pluralize(ctx.headcount, 'person', 'people')}
            {ctx.children > 0 ? `, ${ctx.children} under 18` : ''}
          </span>
        </Row>
      </Card>

      {/* -- Booked units --------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Where everyone is staying
        </h2>

        {allSelections.length === 0 ? (
          <EmptyState
            title="No rooms picked yet"
            body={
              ctx.isOrganizer
                ? 'Choose from the shortlist below and say which families go where.'
                : 'The organizer is still settling this.'
            }
          />
        ) : (
          allSelections.map((sel) => {
            const c = byId.get(sel.candidate_id);
            const fams = links
              .filter((l) => l.selection_id === sel.id)
              .map((l) => nameOf(l.family_id));

            return (
              <Card key={sel.id} className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-text">{c?.name ?? 'Removed place'}</p>
                    {c?.address ? <p className="text-sm text-muted">{c.address}</p> : null}
                    <p className="mt-1 text-sm text-accent">
                      {fams.length > 0 ? fams.join(', ') : 'Nobody assigned'}
                    </p>
                    {c?.capacity_note ? (
                      <p className="text-sm text-muted">{c.capacity_note}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="good">Booking</Badge>
                    {ctx.isOrganizer ? <UnbookButton tripId={id} selectionId={sel.id} /> : null}
                  </div>
                </div>
                {c?.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-accent"
                  >
                    Open listing ↗
                  </a>
                ) : null}
              </Card>
            );
          })
        )}

        {allSelections.length > 0 && unassigned.length > 0 ? (
          <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-600">
            Not placed anywhere yet: {unassigned.map((f) => f.name).join(', ')}
          </p>
        ) : null}
      </section>

      {/* -- Organizer assignment ------------------------------------------- */}
      {ctx.isOrganizer && shortlisted.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Pick the places
          </h2>
          <p className="text-sm text-muted">
            Ordered by how many families shortlisted each one. Tap the families going in each place.
          </p>
          <AssignUnits
            tripId={id}
            candidates={shortlisted}
            families={ctx.votingFamilies.map((f) => ({
              id: f.id,
              name: f.name,
              headcount: f.family_attendees.length,
            }))}
            assignments={assignments}
          />
        </section>
      ) : null}

      {ctx.isOrganizer && ctx.phase !== 'finalized' ? (
        <Card className="space-y-2">
          <p className="text-sm text-muted">
            Once the rooms are settled, mark the trip done. Everyone keeps read access to this page.
          </p>
          <AdvanceButton tripId={id} to="finalized">
            Mark the trip locked in
          </AdvanceButton>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 border-b border-edge pb-3 last:border-0 last:pb-0">
      <span className="w-16 shrink-0 text-sm text-muted">{label}</span>
      <span className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
        {children}
      </span>
    </div>
  );
}

function Pending({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-base font-normal text-muted underline">
      {children}
    </Link>
  );
}
