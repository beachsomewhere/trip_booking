import { ProposalBoard, type BoardItem } from '@/components/ProposalBoard';
import { ProposePlaceForm } from '@/components/places/ProposePlaceForm';
import { PhaseProgressPanel } from '@/components/PhaseProgressPanel';
import { Badge, Card, EmptyState, PageTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { loadTripContext, rows } from '@/lib/queries';
import { boardBase } from '@/lib/board';
import { phaseProgress, shouldNudgeOrganizer } from '@/lib/consensus';
import { isPhaseComplete } from '@/lib/phases';

export default async function AnchorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadTripContext(id);
  const supabase = await createClient();

  const [proposalsRes, votesRes] = await Promise.all([
    supabase.from('anchor_proposals').select('*').eq('trip_id', id),
    supabase.from('anchor_votes').select('*').eq('trip_id', id),
  ]);

  const proposals = rows('anchor_proposals', proposalsRes);
  const allVotes = rows('anchor_votes', votesRes);
  const done = isPhaseComplete(ctx.phase, 'anchor');
  const canVote = !done && ctx.myFamily?.status === 'active';

  const progress = phaseProgress(ctx.votingFamilies, proposals, allVotes);
  const base = boardBase(proposals, allVotes, ctx.votingFamilies, ctx.myFamily?.id ?? null);

  const items: BoardItem[] = base.map(({ proposal, item }) => ({
    ...item,
    body: (
      <div>
        <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-text">
          {proposal.name}
        </p>
        {proposal.formatted_address ? (
          <p className="text-sm text-muted">{proposal.formatted_address}</p>
        ) : null}
        <p className="mt-1 text-sm text-accent">
          Search everything within {proposal.radius_mi} miles
        </p>
      </div>
    ),
  }));

  return (
    <div className="space-y-6">
      <PageTitle
        title="What area"
        subtitle={
          done
            ? 'Settled.'
            : 'Narrow it down to a spot and how far out to look. Everything you shortlist next comes from inside this circle.'
        }
      />

      {ctx.trip.destination_name ? (
        <p className="text-sm text-muted">Going to {ctx.trip.destination_name}</p>
      ) : null}

      {done && ctx.trip.anchor_name ? (
        <Card className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <span className="font-[family-name:var(--font-display)] text-lg font-semibold">
              {ctx.trip.anchor_name}
            </span>
            <span className="ml-2 text-sm text-muted">
              within {ctx.trip.anchor_radius_mi} miles
            </span>
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
          kind="anchor"
          items={items}
          canVote={canVote}
          isOrganizer={ctx.isOrganizer && !done}
          resolveLabel="Search around here"
        />
      ) : (
        <EmptyState
          title="No search area yet"
          body="Pick the spot the trip really revolves around — the lift, the beach, the venue."
        />
      )}

      {!done && ctx.myFamily?.status === 'active' ? (
        <Card>
          <ProposePlaceForm tripId={id} mode="anchor" />
        </Card>
      ) : null}
    </div>
  );
}
