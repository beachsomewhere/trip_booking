'use client';

import { useState, useTransition } from 'react';
import { clearSelection, setSelection } from '@/actions/lodging';
import { Button, Card, cx } from '@/components/ui';

export interface AssignableCandidate {
  id: string;
  name: string;
  pickedByNames: string[];
}

export interface AssignableFamily {
  id: string;
  name: string;
  headcount: number;
}

/**
 * Assigns families to the places being booked.
 *
 * A family can only be in one unit, so choosing it here removes it from any
 * other — otherwise the summary can claim the Barnes are staying in two houses.
 */
export function AssignUnits({
  tripId,
  candidates,
  families,
  assignments,
}: {
  tripId: string;
  candidates: AssignableCandidate[];
  families: AssignableFamily[];
  assignments: Record<string, string[]>;
}) {
  const [local, setLocal] = useState<Record<string, string[]>>(assignments);
  const [pending, start] = useTransition();

  function toggle(candidateId: string, familyId: string) {
    setLocal((prev) => {
      const next: Record<string, string[]> = {};
      for (const [cid, fids] of Object.entries(prev)) {
        next[cid] = fids.filter((f) => f !== familyId);
      }
      const current = prev[candidateId] ?? [];
      next[candidateId] = current.includes(familyId)
        ? current.filter((f) => f !== familyId)
        : [...(next[candidateId] ?? []), familyId];
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {candidates.map((c) => {
        const assigned = local[c.id] ?? [];
        const heads = families
          .filter((f) => assigned.includes(f.id))
          .reduce((n, f) => n + f.headcount, 0);

        return (
          <Card key={c.id} className={cx('space-y-3', assigned.length > 0 && 'border-accent')}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-text">{c.name}</p>
              <p className="text-sm text-muted">
                {assigned.length === 0
                  ? 'Nobody assigned'
                  : `${heads} ${heads === 1 ? 'person' : 'people'}`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {families.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggle(c.id, f.id)}
                  className={cx(
                    'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                    assigned.includes(f.id)
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-edge text-muted hover:text-text',
                  )}
                >
                  {f.name} ({f.headcount})
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending || assigned.length === 0}
                onClick={() =>
                  start(() => {
                    void setSelection(tripId, c.id, assigned);
                  })
                }
              >
                {pending ? 'Saving…' : 'Book this one'}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function UnbookButton({ tripId, selectionId }: { tripId: string; selectionId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      className="px-2 py-1 text-xs"
      disabled={pending}
      onClick={() =>
        start(() => {
          void clearSelection(tripId, selectionId);
        })
      }
    >
      Remove
    </Button>
  );
}
