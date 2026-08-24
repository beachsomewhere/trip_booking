import Image from 'next/image';
import { ProposalBoard, type BoardItem } from '@/components/ProposalBoard';
import { ProposePlaceForm } from '@/components/places/ProposePlaceForm';
import { PhaseProgressPanel } from '@/components/PhaseProgressPanel';
import { Badge, Card, EmptyState, PageTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { loadTripContext, rows } from '@/lib/queries';
import { boardBase } from '@/lib/board';
import { phaseProgress, shouldNudgeOrganizer } from '@/lib/consensus';
import { formatDateRange } from '@/lib/format';
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

  const progress = phaseProgress(ctx.votingFamilies, proposals, allVotes);
  const base = boardBase(proposals, allVotes, ctx.votingFamilies, ctx.myFamily?.id ?? null);

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
            : 'Somebody suggests a place, everyone else says yes or no. That is the whole step.'
        }
      />

      {ctx.trip.agreed_start_date && ctx.trip.agreed_end_date ? (
        <p className="text-sm text-muted">
          Going {formatDateRange(ctx.trip.agreed_start_date, ctx.trip.agreed_end_date)} ·{' '}
          {ctx.headcount} people
        </p>
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
        <PhaseProgressPanel
          progress={progress}
          myFamilyId={ctx.myFamily?.id}
          nudge={ctx.isOrganizer && shouldNudgeOrganizer(progress, ctx.trip.target_finalize_by)}
        />
      ) : null}

      {items.length > 0 ? (
        <ProposalBoard
          tripId={id}
          kind="destination"
          items={items}
          canVote={canVote}
          isOrganizer={ctx.isOrganizer && !done}
          resolveLabel="Lock in this destination"
        />
      ) : (
        <EmptyState
          title="No destinations on the table yet"
          body="Put one up — even a rough idea gives everyone something to react to."
        />
      )}

      {!done && ctx.myFamily?.status === 'active' ? (
        <Card>
          <ProposePlaceForm tripId={id} mode="destination" />
        </Card>
      ) : null}
    </div>
  );
}
