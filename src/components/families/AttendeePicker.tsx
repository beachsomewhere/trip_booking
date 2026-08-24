'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { setTripAttendees } from '@/actions/families';
import type { ActionState } from '@/actions/auth';
import { Button, EmptyState, FormError, cx } from '@/components/ui';
import { ageOn } from '@/lib/age';

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
  const [selected, setSelected] = useState<string[]>(() =>
    people.filter((p) => p.coming).map((p) => p.personId),
  );

  const [state, action, pending] = useActionState<ActionState, FormData>(
    setTripAttendees.bind(null, tripId, familyId),
    {},
  );

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
            <label
              key={p.personId}
              className={cx(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                on ? 'border-accent bg-accent-soft text-accent' : 'border-edge text-muted',
              )}
            >
              <input
                type="checkbox"
                name="personId"
                value={p.personId}
                checked={on}
                onChange={() => toggle(p.personId)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="font-medium">{p.name}</span>
              {age != null ? (
                <span className="text-xs opacity-70">
                  {approximate ? '~' : ''}
                  {age}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>

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
