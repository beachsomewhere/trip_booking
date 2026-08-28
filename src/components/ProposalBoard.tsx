'use client';

import { useState, useTransition, type ReactNode } from 'react';
import {
  castVote,
  resolveProposal,
  saveVoteNote,
  withdrawProposal,
  type ProposalKind,
} from '@/actions/proposals';
import { Badge, Button, Card, Input, cx } from '@/components/ui';
import { listFamilies } from '@/lib/format';
import type { VoteChoice } from '@/lib/consensus';
import { FRONT_RUNNER_ID } from '@/lib/revealLock';

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
  maybeFamilyNames: string[];
  noFamilyNames: string[];
  /** Someone said this doesn't work for them, so it cannot simply be chosen. */
  blocked: boolean;
  myVote: VoteChoice | null;
  /** Why each family voted the way it did, where they said. */
  reasons: { familyName: string; choice: VoteChoice; note: string }[];
  myNote: string;
  isLeader: boolean;
}

/**
 * Three options, not two, and the middle one is the point.
 *
 * Without it people either fake enthusiasm for something they merely tolerate,
 * or vote it down over a mild preference — and the tally stops meaning
 * anything. "Could work" was too close to "Works" to carry that; "Not ideal"
 * says plainly that it is a yes with a reservation, which is what makes a
 * genuine blocker stand out from a grumble.
 */
const CHOICES: { value: VoteChoice; label: string; hint: string }[] = [
  { value: 'yes', label: 'Works, preferred', hint: 'This is what we want' },
  { value: 'maybe', label: 'Works, less preferred', hint: "We'd come, but we'd rather something else" },
  { value: 'no', label: "Doesn't work", hint: "We can't make it" },
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
  const [note, setNote] = useState(item.myNote);
  /** A negative vote being composed. Not recorded until it has a reason. */
  const [draft, setDraft] = useState<VoteChoice | null>(null);

  const showing = draft ?? item.myVote;
  const needsReason = showing != null && showing !== 'yes';
  const reasonMissing = needsReason && note.trim().length === 0;

  /**
   * "Works, preferred" records instantly — no friction on the answer the app
   * most wants. Anything else opens a reason first and records nothing until
   * there is one: a bare "doesn't work" tells the group a problem exists and
   * nothing about how to avoid it, so the next suggestion is another guess.
   */
  const choose = (choice: VoteChoice) => {
    if (choice === 'yes') {
      setDraft(null);
      start(() => {
        void castVote(kind, tripId, item.id, choice);
      });
      return;
    }
    setDraft(choice);
  };

  const commit = () =>
    start(async () => {
      if (draft) {
        await castVote(kind, tripId, item.id, draft, note);
        setDraft(null);
      } else {
        await saveVoteNote(kind, tripId, item.id, note);
      }
    });

  return (
    <Card
      id={item.isLeader ? FRONT_RUNNER_ID : undefined}
      className={cx('scroll-mt-6 space-y-3', item.isLeader && 'border-accent')}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-muted">
          {item.isMine ? 'You suggested' : `${item.familyName} suggested`}
        </p>
        {item.isLeader ? <Badge tone="accent">Front-runner</Badge> : null}
      </div>

      {item.body}

      {item.note ? <p className="text-sm text-muted">“{item.note}”</p> : null}

      {/* Name who voted which way. A bare count told you a problem existed
          without telling you whose it was — and "No votes yet" used to sit next
          to "1 can't", because only the yes column counted as a vote. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        {item.yes > 0 ? (
          <span className="text-moss-600">Preferred — {listFamilies(item.yesFamilyNames)}</span>
        ) : null}
        {item.maybe > 0 ? (
          <span>Less preferred — {listFamilies(item.maybeFamilyNames)}</span>
        ) : null}
        {item.no > 0 ? (
          <span className="text-clay-600">Can&apos;t — {listFamilies(item.noFamilyNames)}</span>
        ) : null}
        {item.yes === 0 && item.maybe === 0 && item.no === 0 ? <span>No votes yet</span> : null}
      </div>

      {item.reasons.length > 0 ? (
        <ul className="space-y-1 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          {item.reasons.map((r) => (
            <li key={r.familyName}>
              <span className="font-medium text-text">{r.familyName}:</span> {r.note}
            </li>
          ))}
        </ul>
      ) : null}

      {canVote ? (
        <div className="flex flex-wrap gap-2">
          {CHOICES.map((c) => (
            <Button
              key={c.value}
              variant={showing === c.value ? 'primary' : 'secondary'}
              disabled={pending}
              onClick={() => choose(c.value)}
              title={c.hint}
            >
              {c.label}
            </Button>
          ))}
        </div>
      ) : null}

      {/* Required on anything but "preferred". A family reading this later has
          to be able to tell what to avoid; "less preferred" on its own sends
          the asking somewhere this app cannot see. */}
      {canVote && showing ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-48 flex-1">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoFocus={draft != null}
                required={needsReason}
                placeholder={
                  showing === 'yes'
                    ? 'Why this one? (optional)'
                    : kind === 'dates'
                      ? 'Why not? — school, work, already booked…'
                      : 'Why not? — been there, no passes, too far…'
                }
                maxLength={280}
                aria-label="Reason for your vote"
              />
            </div>
            {draft || note !== item.myNote ? (
              <Button variant="secondary" disabled={pending || reasonMissing} onClick={commit}>
                {draft ? 'Save my answer' : 'Save'}
              </Button>
            ) : null}
            {draft ? (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setDraft(null);
                  setNote(item.myNote);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>

          {reasonMissing ? (
            <p className="text-sm text-clay-600">
              {draft
                ? 'A reason is needed before this counts — one line is plenty.'
                : "You marked this without saying why. Add a line so the group can work around it."}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {isOrganizer ? (
          <Button
            variant={item.blocked ? 'secondary' : item.isLeader ? 'primary' : 'secondary'}
            disabled={pending}
            onClick={() => {
              // A "doesn't work" is a statement that the family cannot come.
              // Choosing it anyway means choosing to exclude them, so it takes a
              // sharper confirmation than "are you sure".
              const warning = item.blocked
                ? `${listFamilies(item.noFamilyNames)} said this doesn't work for them. ` +
                  `Choosing it means going ahead without them. Continue?`
                : item.maybe > 0
                  ? `${listFamilies(item.maybeFamilyNames)} said this isn't ideal, but would come. ` +
                    `${resolveLabel}?`
                  : `${resolveLabel} This closes this step for everyone.`;
              if (!window.confirm(warning)) return;
              start(() => {
                void resolveProposal(kind, tripId, item.id);
              });
            }}
          >
            {item.blocked ? `${resolveLabel} anyway` : resolveLabel}
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
