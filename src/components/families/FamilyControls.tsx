'use client';

import { useState, useTransition } from 'react';
import { leaveTrip, resendInvites, setFamilyStatus } from '@/actions/families';
import { Button } from '@/components/ui';
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

/**
 * Leaving a trip. Explains the consequences before doing it, because opting out
 * removes the trip from your list entirely — there is no "opt back in" button
 * to find afterwards, since you can no longer see the page it would live on.
 */
export function LeaveTripButton({
  tripId,
  familyId,
  familyName,
}: {
  tripId: string;
  familyId: string;
  familyName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setOpen(true)}>
        Leave trip
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg bg-surface-2 p-3 text-sm">
      <p className="font-medium text-text">Leave this trip?</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
        <li>The others will see {familyName} as opted out and stop waiting on you.</li>
        <li>This trip disappears from your list.</li>
        <li>Your original invite email still works if you change your mind.</li>
      </ul>
      <div className="mt-3 flex gap-2">
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            start(() => {
              void leaveTrip(tripId, familyId);
            })
          }
        >
          {pending ? 'Leaving…' : 'Leave the trip'}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Stay
        </Button>
      </div>
    </div>
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

