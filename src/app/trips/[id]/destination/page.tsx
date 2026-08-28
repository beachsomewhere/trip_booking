import Image from 'next/image';
import { ProposalBoard, type BoardItem } from '@/components/ProposalBoard';
import { ProposePlaceForm } from '@/components/places/ProposePlaceForm';
import { PhaseLockPanel } from '@/components/PhaseLockPanel';
import { MovedOnBanner } from '@/components/MovedOnBanner';
import { Badge, Card, EmptyState, PageTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { loadPhaseLocks, loadTripContext, rows } from '@/lib/queries';
import { boardBase } from '@/lib/board';
import { formatDateRange, listFamilies } from '@/lib/format';
import { isPhaseComplete } from '@/lib/phases';

export default async function DestinationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadTripContext(id);
  const supabase = await createClient();

  const [proposalsRes, votesRes] = await Promise.all([
    supabase.from('destination_proposals').select('*').eq('trip_id', id),
    supabase.from('destination_votes').select('*').eq('trip_id', id),
  ]);

  const proposals = rows('destination_proposals', proposalsRes);
  const allVotes = rows('destination_votes', votesRes);
  const done = isPhaseComplete(ctx.phase, 'destination');
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

  const locks = await loadPhaseLocks(id, 'destination', ctx, newestProposalAt);
  const base = boardBase(proposals, allVotes, ctx.families, ctx.myFamily?.id ?? null);
  const activeNames = ctx.votingFamilies.map((f) => f.name);

  // Same rule as the dates step: it closes on one option every family actively
  // prefers, not on a majority or on grudging acceptance.
  const unanimous = base.find(({ item }) => item.yes === ctx.votingFamilies.length);

  const closest = [...base].sort((a, b) => b.item.yes - a.item.yes)[0] ?? null;
  const closestOutstanding = closest
    ? activeNames.filter((n) => !closest.item.yesFamilyNames.includes(n))
    : [];

  // Only votes on options still on the table. Reading every vote ever cast
  // counted a "preferred" left behind on a proposal that has since been
  // withdrawn, which permanently hid the suggest form from that family — with
  // nothing on the table and no way to put anything there. Suggesting now
  // records a preference automatically, so every withdrawal strands one.
  const iPreferSomething = base.some((b) => b.item.myVote === 'yes');

  // My own live suggestion, and whether the group is actually behind it. A
  // family whose suggestion has drawn a "less preferred" or a "doesn't work"
  // is stuck otherwise: their own option is their first choice, which is what
  // hides the form, so the one person with a reason to offer an alternative is
  // the one who cannot.
  const mine = base.find((b) => b.item.isMine);
  const mineChallenged = Boolean(mine && (mine.item.maybe > 0 || mine.item.no > 0));


  // Everything already on the table that this family has not answered yet —
  // other families' suggestions only; your own do not need reviewing.
  //
  // Suggesting is gated behind reading. Without this, the first thing a family
  // does is add their own, and a list of four options each preferred by exactly
  // one family is a list that can never reach unanimity. Reacting is cheap and
  // it converges; proposing is neither.
  const unreviewed = base.filter(
    (b) => b.proposal.family_id !== ctx.myFamily?.id && b.item.myVote == null,
  );


  const destinationBlocked =
    base.length === 0
      ? 'Nobody has suggested a destination yet.'
      : unanimous
        ? null
        : closest && closest.item.yes > 0
          ? `No destination works for everyone yet. Closest is ${closest.proposal.name} — ` +
            `waiting on ${listFamilies(closestOutstanding)} to mark it preferred.`
          : 'No destination works for everyone yet — nobody has marked one as preferred.';

  const items: BoardItem[] = base.map(({ proposal, item }) => ({
    ...item,
    body: (
      <div className="flex gap-3">
        {proposal.photo_url ? (
          <Image
            src={proposal.photo_url}
            alt=""
            width={96}
            height={96}
            className="h-24 w-24 shrink-0 rounded-lg object-cover"
            unoptimized
          />
        ) : null}
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
            {proposal.name}
          </p>
          {proposal.formatted_address ? (
            <p className="text-sm text-muted">{proposal.formatted_address}</p>
          ) : null}
        </div>
      </div>
    ),
  }));

  return (
    <div className="space-y-6">
      <PageTitle
        title="Where"
        subtitle={
          done
            ? 'Settled.'
            : base.length === 0
              ? 'Suggest the place you’d most want — one per family, and it counts as the one you prefer. Everyone else says whether it works for them.'
              : "Say what you think of each place below first. Only if none of them is what you'd pick can you put up your own — one per family, so make it the place you'd most want."
        }
      />

      {ctx.trip.agreed_start_date && ctx.trip.agreed_end_date ? (
        <p className="text-sm text-muted">
          Going {formatDateRange(ctx.trip.agreed_start_date, ctx.trip.agreed_end_date)} ·{' '}
          {ctx.headcount} people
        </p>
      ) : null}

      {done && ctx.phase !== 'finalized' ? (
        <MovedOnBanner tripId={id} currentPhase={ctx.phase} />
      ) : null}

      {done && ctx.trip.destination_name ? (
        <Card className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-[family-name:var(--font-display)] text-lg font-semibold">
            {ctx.trip.destination_name}
          </span>
          <Badge tone="good">Agreed</Badge>
        </Card>
      ) : null}

      {!done ? (
        <PhaseLockPanel
          tripId={id}
          phase="destination"
          rows={locks}
          isOrganizer={ctx.isOrganizer}
          canLock={ctx.myFamily?.status === 'active'}
          pick={{ what: 'place', label: 'Show me the front-runner', nextLabel: 'Where to stay' }}
          blockedReason={destinationBlocked}
        />
      ) : null}

      {items.length > 0 ? (
        <ProposalBoard
          tripId={id}
          kind="destination"
          items={items}
          canVote={canVote}
          isOrganizer={ctx.isOrganizer && !done}
          resolveLabel="Choose this destination"
        />
      ) : (
        <EmptyState
          title="No destinations on the table yet"
          body="Put one up — even a rough idea gives everyone something to react to."
        />
      )}

      {/* Read the room before adding to it — the search appears only once this
          family has answered every place already on the table and none of them
          is their first choice. */}
      {!done && ctx.myFamily?.status === 'active' && (!iPreferSomething || mineChallenged) && unreviewed.length > 0 ? (
        <Card className="space-y-1 bg-surface-2">
          <p className="font-medium text-text">
            Answer what&apos;s already here first
          </p>
          <p className="text-sm text-muted">
            {listFamilies(unreviewed.map((b) => b.item.familyName))} put{' '}
            {unreviewed.length === 1 ? 'a place' : 'places'} forward. Mark{' '}
            {unreviewed.length === 1 ? 'it' : 'each one'} above.{' '}
            {unreviewed.length === 1 ? "If it isn't" : 'If none of them is'} what you&apos;d pick, a
            search to suggest somewhere else appears here.
          </p>
        </Card>
      ) : null}

      {!done &&
      ctx.myFamily?.status === 'active' &&
      (!iPreferSomething || mineChallenged) &&
      unreviewed.length === 0 ? (
        <Card className="space-y-3">
          <div>
            <p className="font-medium text-text">
              {mineChallenged
                ? 'Not everyone is sold on yours — suggest somewhere else'
                : base.length === 0
                  ? 'Suggest a place'
                  : "None of these are what you'd pick — suggest another"}
            </p>
            <p className="text-sm text-muted">
              {mineChallenged
                ? `This replaces ${mine!.proposal.name}, so put up the next place you'd most want.`
                : base.length === 0
                  ? "Go first — it's much easier for everyone else to react than to start. One suggestion per family, so lead with the place you'd most want."
                  : 'One suggestion per family, so pick the place you’d most want. Or mark one above as “Works, preferred” instead.'}
            </p>
          </div>
          <ProposePlaceForm tripId={id} />
        </Card>
      ) : null}
    </div>
  );
}
