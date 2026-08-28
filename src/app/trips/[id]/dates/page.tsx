import { ProposalBoard, type BoardItem } from '@/components/ProposalBoard';
import { ProposeDatesForm } from '@/components/dates/ProposeDatesForm';
import { PhaseLockPanel } from '@/components/PhaseLockPanel';
import { MovedOnBanner } from '@/components/MovedOnBanner';
import { AdvanceButton } from '@/components/AdvanceButton';
import { Badge, Card, EmptyState, PageTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { loadPhaseLocks, loadTripContext, rows } from '@/lib/queries';
import { boardBase } from '@/lib/board';
import { formatDateRange, listFamilies, nightsBetween, pluralize, rangeOverlap } from '@/lib/format';
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
  const activeNames = ctx.votingFamilies.map((f) => f.name);

  // A step closes on a single option every family actively prefers — not on a
  // majority, and not on grudging acceptance. Anything less and somebody is
  // being quietly overruled on a decision they have to live with for a week.
  const unanimous = base.find(({ item }) => item.yes === ctx.votingFamilies.length);

  // The nearest miss, so "who are we waiting on" is answerable rather than a
  // shrug: most preferred first, and who has yet to prefer it.
  const closest = [...base].sort((a, b) => b.item.yes - a.item.yes)[0] ?? null;
  const closestOutstanding = closest
    ? activeNames.filter((n) => !closest.item.yesFamilyNames.includes(n))
    : [];

  const datesBlocked =
    base.length === 0
      ? 'Nobody has suggested dates yet.'
      : unanimous
        ? null
        : closest && closest.item.yes > 0
          ? `No dates work for everyone yet. Closest is ${formatDateRange(
              closest.proposal.start_date,
              closest.proposal.end_date,
            )} — waiting on ${listFamilies(closestOutstanding)} to mark it preferred.`
          : 'No dates work for everyone yet — nobody has marked a week as preferred.';

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

  // Whether anything on the table is already this family's first choice.
  const iPreferSomething = allVotes.some(
    (v) => v.family_id === ctx.myFamily?.id && v.choice === 'yes',
  );

  // Everything already on the table that this family has not answered yet —
  // other families' suggestions only; your own do not need reviewing.
  //
  // Suggesting is gated behind reading. Without this, the first thing a family
  // does is add their own week, and a list of four options each preferred by
  // exactly one family is a list that can never reach unanimity. Reacting is
  // cheap and it converges; proposing is neither.
  const unreviewed = base.filter(
    (b) => b.proposal.family_id !== ctx.myFamily?.id && b.item.myVote == null,
  );


  return (
    <div className="space-y-6">
      <PageTitle
        title="When"
        subtitle={
          done
            ? 'Locked in.'
            : items.length === 0
              ? 'Suggest a week that works for your family — it counts as the one you prefer. Everyone else says whether it works for them.'
              : "First say what you think of each week below. If none of them is what you'd pick, you'll then be able to suggest your own."
        }
      />

      {done && ctx.phase !== 'finalized' ? (
        <MovedOnBanner tripId={id} currentPhase={ctx.phase} />
      ) : null}

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
          pick={{ what: 'week', label: 'Show me the front-runner', nextLabel: 'Where' }}
          blockedReason={datesBlocked}
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
          resolveLabel="Choose these dates"
        />
      ) : (
        <EmptyState
          title="Nobody has suggested dates yet"
          body="Go first — it's much easier for everyone else to react than to start."
        />
      )}

      {/* Read the room before adding to it. The form appears only once this
          family has answered every week already on the table and none of them
          is their first choice — the two states in which a new suggestion is
          the useful thing to do rather than another option to converge on. */}
      {!done && ctx.myFamily?.status === 'active' && !iPreferSomething && unreviewed.length > 0 ? (
        <Card className="space-y-1 bg-surface-2">
          <p className="font-medium text-text">
            Answer {pluralize(unreviewed.length, 'suggestion')} first
          </p>
          <p className="text-sm text-muted">
            {listFamilies(unreviewed.map((b) => b.item.familyName))} put{' '}
            {unreviewed.length === 1 ? 'a week' : 'weeks'} forward. Mark{' '}
            {unreviewed.length === 1 ? 'it' : 'each one'} above.{' '}
            {unreviewed.length === 1 ? "If it isn't" : 'If none of them is'} what you&apos;d pick, a
            form to suggest your own week appears here.
          </p>
        </Card>
      ) : null}

      {!done &&
      ctx.myFamily?.status === 'active' &&
      !iPreferSomething &&
      unreviewed.length === 0 ? (
        <Card className="space-y-3">
          <div>
            <p className="font-medium text-text">
              {base.length === 0
                ? 'Suggest a week'
                : "None of these are what you'd pick — suggest another"}
            </p>
            <p className="text-sm text-muted">
              {base.length === 0
                ? "Go first — it's much easier for everyone else to react than to start."
                : 'Mark a week above as “Works, preferred” instead if one of them suits you.'}
            </p>
          </div>
          <ProposeDatesForm
            tripId={id}
            marked={live
              .filter((p) => p.family_id !== ctx.myFamily?.id)
              .map((p) => ({
                start: p.start_date,
                end: p.end_date,
                label:
                  ctx.families.find((f) => f.id === p.family_id)?.name ?? 'Another family',
              }))}
          />
        </Card>
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
