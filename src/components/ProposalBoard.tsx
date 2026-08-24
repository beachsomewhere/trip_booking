'use client';

import { useTransition, type ReactNode } from 'react';
import { castVote, resolveProposal, withdrawProposal, type ProposalKind } from '@/actions/proposals';
import { Badge, Button, Card, cx } from '@/components/ui';
import { listFamilies } from '@/lib/format';
import type { VoteChoice } from '@/lib/consensus';

export interface BoardItem {
  id: string;
  /** Family that put it forward — "The Barnes suggested…". */
  familyName: string;
  isMine: boolean;
  /** Phase-specific content, rendered on the server and passed down. */
  body: ReactNode;
  note?: string | null;
  yes: number;
  maybe: number;
  no: number;
  yesFamilyNames: string[];
  myVote: VoteChoice | null;
  isLeader: boolean;
}

const CHOICES: { value: VoteChoice; label: string }[] = [
  { value: 'yes', label: 'Works' },
  { value: 'maybe', label: 'Could work' },
  { value: 'no', label: "Doesn't work" },
];

/**
 * The voting surface for dates, destination, and area.
 *
 * The design goal is that a family who has not been following along can open
 * this, see "the Barnes suggested Keystone — 2 families are in", and answer in
 * one tap. Everything else on the card is secondary to that.
 */
export function ProposalBoard({
  tripId,
  kind,
  items,
  canVote,
  isOrganizer,
  resolveLabel,
}: {
  tripId: string;
  kind: ProposalKind;
  items: BoardItem[];
  canVote: boolean;
  isOrganizer: boolean;
  resolveLabel: string;
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ProposalCard
          key={item.id}
          tripId={tripId}
          kind={kind}
          item={item}
          canVote={canVote}
          isOrganizer={isOrganizer}
          resolveLabel={resolveLabel}
        />
      ))}
    </div>
  );
}

function ProposalCard({
  tripId,
  kind,
  item,
  canVote,
  isOrganizer,
  resolveLabel,
}: {
  tripId: string;
  kind: ProposalKind;
  item: BoardItem;
  canVote: boolean;
  isOrganizer: boolean;
  resolveLabel: string;
}) {
  const [pending, start] = useTransition();

  const vote = (choice: VoteChoice) =>
    start(() => {
      void castVote(kind, tripId, item.id, choice);
    });

  return (
    <Card className={cx('space-y-3', item.isLeader && 'border-accent')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-muted">
          {item.isMine ? 'You suggested' : `${item.familyName} suggested`}
        </p>
        {item.isLeader ? <Badge tone="accent">Front-runner</Badge> : null}
      </div>

      {item.body}

      {item.note ? <p className="text-sm text-muted">“{item.note}”</p> : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        {item.yes > 0 ? (
          <span className="text-moss-600">{listFamilies(item.yesFamilyNames)} in</span>
        ) : (
          <span>No votes yet</span>
        )}
        {item.maybe > 0 ? <span>{item.maybe} maybe</span> : null}
        {item.no > 0 ? <span className="text-clay-600">{item.no} can&apos;t</span> : null}
      </div>

      {canVote ? (
        <div className="flex flex-wrap gap-2">
          {CHOICES.map((c) => (
            <Button
              key={c.value}
              variant={item.myVote === c.value ? 'primary' : 'secondary'}
              disabled={pending}
              onClick={() => vote(c.value)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {isOrganizer ? (
          <Button
            variant={item.isLeader ? 'primary' : 'secondary'}
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`${resolveLabel} This closes this step for everyone.`)) return;
              start(() => {
                void resolveProposal(kind, tripId, item.id);
              });
            }}
          >
            {resolveLabel}
          </Button>
        ) : null}
        {/* Withdrawing is only meaningful while the step is still open. */}
        {item.isMine && canVote ? (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(() => {
                void withdrawProposal(kind, tripId, item.id);
              })
            }
          >
            Withdraw
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
