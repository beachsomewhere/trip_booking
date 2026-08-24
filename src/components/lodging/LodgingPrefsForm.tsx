'use client';

import { useActionState } from 'react';
import { saveLodgingPrefs } from '@/actions/lodging';
import type { ActionState } from '@/actions/auth';
import { Button, Card, FormError } from '@/components/ui';
import { HOUSING_LABEL } from '@/lib/format';

const TYPES = ['hotel', 'short_term_rental', 'resort', 'cabin', 'hostel'] as const;

const TOGETHER = [
  { value: 'together', label: 'All under one roof', hint: 'One place big enough for everyone.' },
  { value: 'separate_ok', label: 'Separate is fine', hint: 'Either way works for us.' },
  {
    value: 'prefer_separate',
    label: 'Our own place',
    hint: "We'd rather not share — we'll look for a place that fits just us.",
  },
  { value: 'no_preference', label: 'No strong feeling', hint: 'Go with whatever suits the group.' },
] as const;

export function LodgingPrefsForm({
  tripId,
  initialTypes,
  initialTogether,
}: {
  tripId: string;
  initialTypes: string[];
  initialTogether: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveLodgingPrefs.bind(null, tripId),
    {},
  );

  return (
    <form action={action} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text">What would you stay in?</legend>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <label
              key={t}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-edge bg-surface px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="checkbox"
                name="housingTypes"
                value={t}
                defaultChecked={initialTypes.includes(t)}
                className="accent-[var(--accent)]"
              />
              {HOUSING_LABEL[t]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text">Should everyone stay together?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TOGETHER.map((o) => (
            <label
              key={o.value}
              className="cursor-pointer rounded-lg border border-edge bg-surface p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <span className="flex items-center gap-2 font-medium text-text">
                <input
                  type="radio"
                  name="stayTogether"
                  value={o.value}
                  defaultChecked={initialTogether === o.value}
                  className="accent-[var(--accent)]"
                />
                {o.label}
              </span>
              <span className="mt-1 block text-xs text-muted">{o.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <FormError message={state.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save what we want'}
        </Button>
        {state.ok ? <span className="text-sm text-moss-600">{state.ok}</span> : null}
      </div>
    </form>
  );
}

export function PrefsSummaryCard({ children }: { children: React.ReactNode }) {
  return <Card className="space-y-4">{children}</Card>;
}
