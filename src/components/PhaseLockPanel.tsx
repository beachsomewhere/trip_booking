'use client';

import { useState, useTransition } from 'react';
import { lockPhase, remindFamily, unlockPhase } from '@/actions/phases';
import { advancePhase } from '@/actions/trips';
import { Badge, Button, Card, cx } from '@/components/ui';
import { listFamilies, pluralize } from '@/lib/format';
import type { TripPhase } from '@/lib/phases';

export interface LockRow {
  familyId: string;
  name: string;
  locked: boolean;
  isMine: boolean;
  /** Invited but never joined — they cannot lock anything in. */
  awaitingInvite: boolean;
}

/**
 * Who has locked this step in, and what happens next.
 *
 * Visible to every family, not just the organizer: the whole reason a trip
 * stalls is that nobody can see whether waiting longer will change anything.
 * A vote says what you want; a lock says you are finished.
 *
 * The organizer can always move on regardless — that is the escape hatch for a
 * family that has gone quiet — but never silently. Moving early names exactly
 * who has not finished, and anyone can nudge them first.
 */
export function PhaseLockPanel({
  tripId,
  phase,
  nextPhase,
  rows,
  isOrganizer,
  advanceLabel,
  canLock = true,
}: {
  tripId: string;
  phase: TripPhase;
  /** Where "continue" goes. Omitted on steps that resolve by picking a winner. */
  nextPhase?: TripPhase;
  rows: LockRow[];
  isOrganizer: boolean;
  advanceLabel?: string;
  canLock?: boolean;
}) {
  const [pending, start] = useTransition();
  const [reminded, setReminded] = useState<string[]>([]);
  const [confirmForce, setConfirmForce] = useState(false);

  const voting = rows.filter((r) => !r.awaitingInvite);
  const locked = voting.filter((r) => r.locked);
  const outstanding = voting.filter((r) => !r.locked);
  const mine = rows.find((r) => r.isMine);
  const everyoneIn = voting.length > 0 && outstanding.length === 0;
  const pct = voting.length === 0 ? 0 : (locked.length / voting.length) * 100;

  const othersOutstanding = outstanding.filter((r) => !r.isMine);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-text">
          {locked.length} of {voting.length} {voting.length === 1 ? 'family has' : 'families have'}{' '}
          locked this in
        </p>
        {everyoneIn ? (
          <Badge tone="good">Ready to move on</Badge>
        ) : mine && !mine.locked ? (
          <Badge tone="accent">Your turn</Badge>
        ) : (
          <span className="text-sm text-muted">
            Waiting on {listFamilies(othersOutstanding.map((r) => r.name))}
          </span>
        )}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cx(
            'h-full rounded-full transition-all',
            everyoneIn ? 'bg-moss-600' : 'bg-accent',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-1 border-t border-edge pt-3">
        {rows.map((r) => (
          <li key={r.familyId} className="flex items-center justify-between gap-2 text-sm">
            <span className={r.locked ? 'text-muted' : 'text-text'}>
              {r.name}
              {r.isMine ? <span className="text-muted"> (you)</span> : null}
            </span>

            <span className="flex items-center gap-3">
              {r.awaitingInvite ? (
                <span className="text-clay-600">invite not accepted</span>
              ) : r.locked ? (
                <span className="text-moss-600">locked in</span>
              ) : (
                <>
                  <span className="text-muted">not yet</span>
                  {!r.isMine ? (
                    <button
                      type="button"
                      disabled={pending || reminded.includes(r.familyId)}
                      onClick={() =>
                        start(async () => {
                          await remindFamily(tripId, r.familyId, phase);
                          setReminded((x) => [...x, r.familyId]);
                        })
                      }
                      className="text-accent underline underline-offset-4 disabled:opacity-50 disabled:no-underline"
                    >
                      {reminded.includes(r.familyId) ? 'Reminded' : 'Remind'}
                    </button>
                  ) : null}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* Your own lock. Reversible while the step is open — changing your mind
          is normal, and a lock you cannot undo is one people avoid pressing. */}
      {mine && canLock ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-3">
          {mine.locked ? (
            <>
              <span className="text-sm text-moss-600">You&apos;ve locked this in.</span>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(() => {
                    void unlockPhase(tripId, phase);
                  })
                }
              >
                Change my mind
              </Button>
            </>
          ) : (
            <>
              <Button
                disabled={pending}
                onClick={() =>
                  start(() => {
                    void lockPhase(tripId, phase);
                  })
                }
              >
                Lock in my family
              </Button>
              <span className="text-sm text-muted">
                Tells everyone you&apos;re done with this step.
              </span>
            </>
          )}
        </div>
      ) : null}

      {/* The organizer's move-on control. */}
      {isOrganizer && nextPhase ? (
        <div className="space-y-2 border-t border-edge pt-3">
          {everyoneIn ? (
            <Button
              disabled={pending}
              onClick={() =>
                start(() => {
                  void advancePhase(tripId, nextPhase);
                })
              }
            >
              {advanceLabel ?? 'Everyone’s in — continue'}
            </Button>
          ) : confirmForce ? (
            <div className="space-y-2 rounded-lg bg-clay-100 p-3">
              <p className="text-sm text-clay-600">
                {pluralize(outstanding.length, 'family', 'families')} haven&apos;t locked this in
                yet: <strong>{outstanding.map((r) => r.name).join(', ')}</strong>. Moving on now
                closes this step for them.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() =>
                    start(() => {
                      void advancePhase(tripId, nextPhase);
                    })
                  }
                >
                  Move on anyway
                </Button>
                <Button variant="secondary" onClick={() => setConfirmForce(false)}>
                  Wait for them
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirmForce(true)}>
              {advanceLabel ?? 'Move on without them'}
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
