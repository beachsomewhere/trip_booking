import { ProposalBoard, type BoardItem } from '@/components/ProposalBoard';
import { ProposeDatesForm } from '@/components/dates/ProposeDatesForm';
import { PhaseLockPanel } from '@/components/PhaseLockPanel';
import { AdvanceButton } from '@/components/AdvanceButton';
import { Badge, Card, EmptyState, PageTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { loadPhaseLocks, loadTripContext, rows } from '@/lib/queries';
import { boardBase } from '@/lib/board';
import { formatDateRange, nightsBetween, pluralize, rangeOverlap } from '@/lib/format';
import { isPhaseComplete } from '@/lib/phases';

export default async function DatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadTripContext(id);
  const supabase = await createClient();

  const [proposalsRes, votesRes] = await Promise.all([
    supabase.from('date_proposals').select('*').eq('trip_id', id).order('start_date'),
    supabase.from('date_votes').select('*').eq('trip_id', id),
  ]);

  const proposals = rows('date_proposals', proposalsRes);
  const allVotes = rows('date_votes', votesRes);
  const done = isPhaseComplete(ctx.phase, 'dates');
  const canVote = !done && ctx.myFamily?.status === 'active';

  // Full roster, not just active families: tally() filters to active internally,
  // while name lookup needs everyone — otherwise a family that opts out or is
  // removed turns into "Someone suggested" on proposals they already made.
  // A lock cast before the newest option appeared was a verdict on a smaller
  // set, so it stops counting until that family looks again.
  const newestProposalAt = proposals
    .filter((p) => !p.withdrawn_at)
    .map((p) => p.created_at)
    .sort()
    .at(-1) ?? null;

  const locks = await loadPhaseLocks(id, 'dates', ctx, newestProposalAt);
  const base = boardBase(proposals, allVotes, ctx.families, ctx.myFamily?.id ?? null);

  // Windows every proposal can live inside. When the group's ranges all overlap
  // there is usually an obvious answer nobody has spotted yet.
  const live = base.map((b) => b.proposal);
  const commonWindow = live.reduce<{ start: string; end: string } | null>(
    (acc, p, i) =>
      i === 0
        ? { start: p.start_date, end: p.end_date }
        : acc && rangeOverlap(acc.start, acc.end, p.start_date, p.end_date),
    null,
  );

  const items: BoardItem[] = base.map(({ proposal, item }) => ({
    ...item,
    body: (
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
          {formatDateRange(proposal.start_date, proposal.end_date)}
        </span>
        <span className="text-sm text-muted">
          {pluralize(nightsBetween(proposal.start_date, proposal.end_date), 'night')}
        </span>
      </div>
    ),
  }));

  const myVotedCount = allVotes.filter((v) => v.family_id === ctx.myFamily?.id).length;
  const iProposed = proposals.some((p) => p.family_id === ctx.myFamily?.id && !p.withdrawn_at);
  // The ordering that stops endless counter-proposals: look at what is already
  // on the table before being handed a blank form.
  const promptToRespondFirst = items.length > 0 && myVotedCount === 0 && !iProposed;

  return (
    <div className="space-y-6">
      <PageTitle
        title="When"
        subtitle={
          done
            ? 'Locked in.'
            : items.length === 0
              ? 'Post the weeks that work for your family. Everyone else does the same.'
              : 'Say which work for you. “Not ideal” still counts as a yes — it just tells the group it isn’t your first choice.'
        }
      />

      {done && ctx.trip.agreed_start_date && ctx.trip.agreed_end_date ? (
        <Card className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-[family-name:var(--font-display)] text-lg font-semibold">
            {formatDateRange(ctx.trip.agreed_start_date, ctx.trip.agreed_end_date)}
          </span>
          <Badge tone="good">Agreed</Badge>
        </Card>
      ) : null}

      {!done ? (
        <PhaseLockPanel
          tripId={id}
          phase="dates"
          rows={locks}
          isOrganizer={ctx.isOrganizer}
          canLock={ctx.myFamily?.status === 'active'}
        />
      ) : null}

      {commonWindow && !done && items.length > 1 ? (
        <Card className="bg-accent-soft">
          <p className="text-sm text-text">
            Every suggestion so far overlaps{' '}
            <strong>{formatDateRange(commonWindow.start, commonWindow.end)}</strong> — that window
            works for everyone who has posted.
          </p>
        </Card>
      ) : null}

      {items.length > 0 ? (
        <ProposalBoard
          tripId={id}
          kind="dates"
          items={items}
          canVote={canVote}
          isOrganizer={ctx.isOrganizer && !done}
          resolveLabel="Lock in these dates"
        />
      ) : (
        <EmptyState
          title="Nobody has suggested dates yet"
          body="Go first — it's much easier for everyone else to react than to start."
        />
      )}

      {!done && ctx.myFamily?.status === 'active' ? (
        <details open={!promptToRespondFirst} className="group">
          <summary className="cursor-pointer list-none rounded-lg border border-edge bg-surface px-4 py-3 text-sm font-medium text-text">
            {promptToRespondFirst
              ? "None of these work — suggest other dates"
              : 'Suggest dates'}
          </summary>
          <Card className="mt-2">
            {/* Marking what others already proposed turns a blank calendar into
                a reaction: you can see their week before choosing yours. */}
            <ProposeDatesForm
              tripId={id}
              marked={live
                .filter((p) => p.family_id !== ctx.myFamily?.id)
                .map((p) => ({
                  start: p.start_date,
                  end: p.end_date,
                  label:
                    ctx.families.find((f) => f.id === p.family_id)?.name ??
                    'Another family',
                }))}
            />
          </Card>
        </details>
      ) : null}

      {ctx.isOrganizer && !done && items.length === 0 ? (
        <Card className="space-y-2">
          <p className="text-sm text-muted">
            Nothing to vote on yet. You can skip ahead if the dates are already settled elsewhere.
          </p>
          <AdvanceButton tripId={id} to="destination" variant="secondary">
            Skip to picking a destination
          </AdvanceButton>
        </Card>
      ) : null}
    </div>
  );
}
