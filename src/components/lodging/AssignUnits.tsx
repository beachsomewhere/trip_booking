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
  selectionIds = {},
}: {
  tripId: string;
  candidates: AssignableCandidate[];
  families: AssignableFamily[];
  /** What is actually booked right now, straight from the database. */
  assignments: Record<string, string[]>;
  /** Booking row per candidate, so an emptied card can undo itself. */
  selectionIds?: Record<string, string>;
}) {
  const [local, setLocal] = useState<Record<string, string[]>>(assignments);
  const [pending, start] = useTransition();
  /** Errors belong to the card that produced them, not to the whole list. */
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  function toggle(candidateId: string, familyId: string) {
    setFailed(null);
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

        // Ticking a family is not booking it. Without this the card looks
        // identical before and after saving, so pressing the button reads as
        // doing nothing at all — the result only shows up in a section further
        // up the page, out of sight.
        const booked = (assignments[c.id] ?? []).length > 0;
        const dirty = !same(assigned, assignments[c.id] ?? []);
        const saving = pending && savingId === c.id;
        // Emptying a booked card is how you undo it. Without this the button
        // just greys out and the card sits there claiming an unsaved change it
        // will not let you save.
        const unbooking = booked && assigned.length === 0;

        return (
          <Card key={c.id} className={cx('space-y-3', booked && !dirty && 'border-moss-600')}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-text">{c.name}</p>
              <p className="text-sm">
                {booked && !dirty ? (
                  <span className="text-moss-600">
                    Booked · {heads} {heads === 1 ? 'person' : 'people'}
                  </span>
                ) : (
                  <span className="text-muted">
                    {assigned.length === 0
                      ? 'Nobody assigned'
                      : `${heads} ${heads === 1 ? 'person' : 'people'} — not saved yet`}
                  </span>
                )}
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

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant={unbooking ? 'secondary' : 'primary'}
                disabled={pending || !dirty || (assigned.length === 0 && !unbooking)}
                onClick={() => {
                  setFailed(null);
                  setSavingId(c.id);
                  start(async () => {
                    const res = unbooking
                      ? await clearSelection(tripId, selectionIds[c.id])
                      : await setSelection(tripId, c.id, assigned);
                    if (res?.error) setFailed({ id: c.id, message: res.error });
                    setSavingId(null);
                  });
                }}
              >
                {saving
                  ? 'Saving…'
                  : unbooking
                    ? 'Unbook this one'
                    : booked && !dirty
                      ? 'Booked'
                      : booked
                        ? 'Save change'
                        : 'Book this one'}
              </Button>
              {booked && !dirty ? (
                <span className="text-sm text-muted">
                  Everyone here is out of every other place.
                </span>
              ) : null}
            </div>

            {failed?.id === c.id ? (
              <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-600">
                {failed.message}
              </p>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

/** Order-insensitive comparison of two family-id lists. */
function same(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((x) => set.has(x));
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
