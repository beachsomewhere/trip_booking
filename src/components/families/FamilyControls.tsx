'use client';

import { useActionState, useTransition } from 'react';
import { addFamilyEmail, resendInvites, setFamilyStatus } from '@/actions/families';
import type { ActionState } from '@/actions/auth';
import { Button, FormError, Input } from '@/components/ui';
import type { Database } from '@/types/db';

type FamilyStatus = Database['public']['Enums']['family_status'];

export function StatusButton({
  tripId,
  familyId,
  to,
  children,
  variant = 'ghost',
  confirm,
}: {
  tripId: string;
  familyId: string;
  to: FamilyStatus;
  children: React.ReactNode;
  variant?: 'ghost' | 'secondary' | 'danger';
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={pending}
      className="px-2 py-1 text-xs"
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(() => {
          void setFamilyStatus(tripId, familyId, to);
        });
      }}
    >
      {children}
    </Button>
  );
}

export function ResendInvitesButton({ tripId }: { tripId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(() => {
          void resendInvites(tripId);
        })
      }
    >
      {pending ? 'Sending…' : 'Resend pending invites'}
    </Button>
  );
}

export function AddEmailForm({ tripId, familyId }: { tripId: string; familyId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addFamilyEmail.bind(null, tripId, familyId),
    {},
  );
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        {/* Width on the wrapper, not the input — see AttendeeEditor. */}
        <div className="flex-1">
          <Input name="email" type="email" required placeholder="spouse@example.com" />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          Add
        </Button>
      </div>
      {state.ok ? <p className="text-xs text-moss-600">{state.ok}</p> : null}
      <FormError message={state.error} />
    </form>
  );
}
