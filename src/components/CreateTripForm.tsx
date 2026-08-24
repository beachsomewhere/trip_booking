'use client';

import { useActionState } from 'react';
import { createTrip } from '@/actions/trips';
import type { ActionState } from '@/actions/auth';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';

export function CreateTripForm({ familyName = '' }: { familyName?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTrip, {});

  return (
    <form action={action} className="space-y-4">
      <Field label="Trip name" hint="Whatever the group already calls it.">
        <Input name="name" required maxLength={120} placeholder="Ski week 2027" />
      </Field>
      <Field
        label="Your family name"
        hint={
          familyName
            ? 'This is how you appear on every trip. Changing it here changes it everywhere.'
            : 'Exactly how the group should see you — “The Barnes”, “Mei & Jon”. You can change it later.'
        }
      >
        <Input
          name="familyName"
          required
          maxLength={60}
          placeholder="The Barnes"
          defaultValue={familyName}
        />
      </Field>
      <Field
        label="What kind of trip is it?"
        hint="Who it's for and roughly what it is — this is the first thing invited families read."
      >
        <Textarea
          name="description"
          maxLength={500}
          placeholder="Adults only, long weekend. Kids staying with grandparents."
        />
      </Field>
      <Field
        label="Decide within"
        hint="A visible deadline is the whole point. You can change it later."
      >
        <select name="targetDays" defaultValue="7" className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm">
          <option value="5">5 days</option>
          <option value="7">1 week</option>
          <option value="10">10 days</option>
          <option value="14">2 weeks</option>
        </select>
      </Field>
      <FormError message={state.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating…' : 'Create trip'}
      </Button>
    </form>
  );
}
