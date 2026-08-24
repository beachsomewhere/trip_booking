'use client';

import { useActionState, useRef } from 'react';
import { inviteFamily, proposeFamily } from '@/actions/families';
import type { ActionState } from '@/actions/auth';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';

/**
 * One form, two meanings. During the `invites` phase the organizer adds
 * families outright; afterwards anyone can suggest one, but it needs the other
 * families' approval before an email goes anywhere.
 */
export function InviteFamilyForm({
  tripId,
  mode,
}: {
  tripId: string;
  mode: 'invite' | 'propose';
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = mode === 'invite' ? inviteFamily : proposeFamily;
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await action(tripId, prev, formData);
      if (result.ok) formRef.current?.reset();
      return result;
    },
    {},
  );

  return (
    <form ref={formRef} action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Family name" hint="However the group refers to them — shown as typed.">
          <Input name="name" required maxLength={60} placeholder="The Chens" />
        </Field>
        <Field label="Email(s)" hint="Comma-separated. Both spouses share one family.">
          <Input name="emails" required placeholder="kyle@example.com, sam@example.com" />
        </Field>
      </div>

      {mode === 'propose' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Adults" hint="Rough count is fine — they'll confirm.">
              <Input name="adults" type="number" min={0} max={20} defaultValue={2} />
            </Field>
            <Field label="Kids">
              <Input name="children" type="number" min={0} max={20} defaultValue={0} />
            </Field>
          </div>
          <Field label="Why them?" hint="Shown to the other families when they vote.">
            <Textarea name="note" maxLength={280} placeholder="They were with us in Tahoe." />
          </Field>
        </>
      ) : null}

      <FormError message={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-moss-100 px-3 py-2 text-sm text-moss-600">{state.ok}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending
          ? 'Working…'
          : mode === 'invite'
            ? 'Send invite'
            : 'Propose this family'}
      </Button>
    </form>
  );
}
