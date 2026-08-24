'use client';

import { useActionState } from 'react';
import { renameHousehold } from '@/actions/household';
import type { ActionState } from '@/actions/auth';
import { Button, Field, FormError, Input } from '@/components/ui';

/**
 * What this family calls itself.
 *
 * Used on every trip they join, in place of whatever the organizer typed into
 * the invite — you decide how your family is listed, not the person inviting
 * you. Trips already under way are renamed too, unless another family there
 * has already taken the name.
 */
export function HouseholdNameForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(renameHousehold, {});

  return (
    <form action={action} className="space-y-3">
      <Field
        label="Your family name"
        hint="Exactly how you want to appear — “The Barnes”, “Mei & Jon”."
      >
        <Input name="householdName" defaultValue={initial} required maxLength={60} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save name'}
        </Button>
        {state.ok ? <span className="text-sm text-moss-600">{state.ok}</span> : null}
      </div>
      <FormError message={state.error} />
    </form>
  );
}
