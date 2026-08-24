'use client';

import { useTransition } from 'react';
import { voteFamilyProposal } from '@/actions/families';
import { Badge, Button, Card } from '@/components/ui';
import { pluralize } from '@/lib/format';

export interface ProposalView {
  id: string;
  proposed_name: string;
  proposed_emails: string[];
  proposed_adults: number;
  proposed_children: number;
  note: string | null;
  status: string;
  proposedByName: string;
  approvals: number;
  needed: number;
  myVote: boolean | null;
}

/**
 * "The Barnes want to add the Smiths." A single rejection kills the proposal —
 * if one family does not want these people along, more voting will not fix it.
 */
export function FamilyProposalCard({
  tripId,
  proposal,
  canVote,
}: {
  tripId: string;
  proposal: ProposalView;
  canVote: boolean;
}) {
  const [pending, start] = useTransition();
  const vote = (approve: boolean) =>
    start(() => {
      void voteFamilyProposal(tripId, proposal.id, approve);
    });

  const people =
    proposal.proposed_adults + proposal.proposed_children > 0
      ? `${pluralize(proposal.proposed_adults, 'adult')}${
          proposal.proposed_children > 0 ? `, ${pluralize(proposal.proposed_children, 'kid')}` : ''
        }`
      : null;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-text">
            {proposal.proposedByName} want to add {proposal.proposed_name}
          </p>
          <p className="text-sm text-muted">
            {proposal.proposed_emails.join(', ')}
            {people ? ` · ${people}` : ''}
          </p>
        </div>
        {proposal.status === 'pending' ? (
          <Badge tone="accent">
            {proposal.approvals} of {proposal.needed} approved
          </Badge>
        ) : (
          <Badge tone={proposal.status === 'approved' ? 'good' : 'warn'}>{proposal.status}</Badge>
        )}
      </div>

      {proposal.note ? <p className="text-sm text-muted">“{proposal.note}”</p> : null}

      {proposal.status === 'pending' && canVote ? (
        proposal.myVote === null ? (
          <div className="flex gap-2">
            <Button onClick={() => vote(true)} disabled={pending}>
              Fine by us
            </Button>
            <Button variant="secondary" onClick={() => vote(false)} disabled={pending}>
              We&apos;d rather not
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">
            You voted {proposal.myVote ? 'yes' : 'no'}. Nothing is emailed until everyone agrees.
          </p>
        )
      ) : null}
    </Card>
  );
}
