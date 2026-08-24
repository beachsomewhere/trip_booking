'use client';

import { useActionState, useRef } from 'react';
import { proposeDates } from '@/actions/proposals';
import type { ActionState } from '@/actions/auth';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';

export function ProposeDatesForm({ tripId }: { tripId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const r = await proposeDates(tripId, prev, fd);
      if (r.ok) ref.current?.reset();
      return r;
    },
    {},
  );

  return (
    <form ref={ref} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Arrive">
          <Input name="start" type="date" required />
        </Field>
        <Field label="Leave">
          <Input name="end" type="date" required />
        </Field>
      </div>
      <Field label="Anything to add?" hint="“Spring break week” — helps others read it fast.">
        <Textarea name="note" maxLength={280} />
      </Field>
      <FormError message={state.error} />
      {state.ok ? <p className="text-sm text-moss-600">{state.ok}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Suggest these dates'}
      </Button>
    </form>
  );
}
