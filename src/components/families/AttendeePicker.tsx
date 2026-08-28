'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { setTripAttendees } from '@/actions/families';
import type { ActionState } from '@/actions/auth';
import { Button, EmptyState, FormError, cx } from '@/components/ui';
import { ageOn } from '@/lib/age';
import { revealLockPanel } from '@/lib/revealLock';

export interface PickablePerson {
  personId: string;
  name: string;
  birthYear: number | null;
  birthMonth: number | null;
  emails: string[];
  coming: boolean;
}

/**
 * Who from your family is coming on this trip. Nothing else.
 *
 * Names, birth dates and email addresses live on the household and are entered
 * once — re-asking for them on every trip was the exact retyping the household
 * exists to remove. This screen answers one question: is it just the two of you
 * this time, or everyone?
 */
export function AttendeePicker({
  tripId,
  familyId,
  people,
  tripStart,
}: {
  tripId: string;
  familyId: string;
  people: PickablePerson[];
  tripStart: string | null;
}) {
  // What the server currently says, as a stable string to compare against.
  const serverIds = people
    .filter((p) => p.coming)
    .map((p) => p.personId)
    .sort();
  const serverKey = serverIds.join(',');

  const [selected, setSelected] = useState<string[]>(serverIds);
  const [seenServer, setSeenServer] = useState(serverKey);

  // A live refresh replaces the props, but state initialised once ignores them,
  // so a spouse's change arrived and changed nothing on screen. Take the new
  // answer — unless this person has ticks of their own they haven't saved, in
  // which case theirs win and they can still press Save.
  if (serverKey !== seenServer) {
    const mine = [...selected].sort().join(',');
    setSeenServer(serverKey);
    if (mine === seenServer) setSelected(serverIds);
  }

  const [state, action, pending] = useActionState<ActionState, FormData>(
    setTripAttendees.bind(null, tripId, familyId),
    {},
  );

  // Saved is not finished. Point at the lock, which is the step that actually
  // unblocks the group and the one people were walking away without doing.
  // `state` is a fresh object per submission, so this fires once each time.
  useEffect(() => {
    if (state.ok) revealLockPanel();
  }, [state]);

  if (people.length === 0) {
    return (
      <EmptyState
        title="Your family isn't set up yet"
        body="Add everyone once — names and birth months — and every trip after this one will already know them."
      />
    );
  }

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const everyone = selected.length === people.length;

  return (
    <form action={action} className="space-y-3">
      {/* Whole family is the common case; ticking four boxes to say "all of us"
          is the friction this screen exists to remove. */}
      {people.length > 1 ? (
        <button
          type="button"
          onClick={() => setSelected(everyone ? [] : people.map((p) => p.personId))}
          className="text-sm font-medium text-accent underline underline-offset-4"
        >
          {everyone ? 'Clear all' : `Everyone (${people.length})`}
        </button>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {people.map((p) => {
          const on = selected.includes(p.personId);
          const { age, approximate } = ageOn(
            { birth_year: p.birthYear, birth_month: p.birthMonth, age: null },
            tripStart,
          );

          return (
            <button
              key={p.personId}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(p.personId)}
              className={cx(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                on ? 'border-accent bg-accent-soft text-accent' : 'border-edge text-muted',
              )}
            >
              {/* Drawn, not a real checkbox. React resets a form's DOM fields
                  after a form action runs, and a controlled input whose state
                  did not change never re-renders to correct itself — so saving
                  left every box visually unticked while the count still said
                  four. Nothing here can drift from `selected`. */}
              <span
                aria-hidden
                className={cx(
                  'flex h-4 w-4 items-center justify-center rounded border text-[10px] font-bold',
                  on ? 'border-accent bg-accent text-white' : 'border-edge',
                )}
              >
                {on ? '✓' : ''}
              </span>
              <span className="font-medium">{p.name}</span>
              {age != null ? (
                <span className="text-xs opacity-70">
                  {approximate ? '~' : ''}
                  {age}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selected.map((id) => (
        <input key={id} type="hidden" name="personId" value={id} />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : `${selected.length} coming`}
        </Button>
        <Link href="/household" className="text-sm text-accent underline underline-offset-4">
          Edit your family
        </Link>
        {state.ok ? <span className="text-sm text-moss-600">{state.ok}</span> : null}
      </div>

      <FormError message={state.error} />
    </form>
  );
}
