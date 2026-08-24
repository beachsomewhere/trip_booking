'use client';

import { useTransition } from 'react';
import { advancePhase } from '@/actions/trips';
import { Button } from '@/components/ui';
import type { TripPhase } from '@/lib/phases';

export function AdvanceButton({
  tripId,
  to,
  children,
  confirm,
  variant = 'primary',
}: {
  tripId: string;
  to: TripPhase;
  children: React.ReactNode;
  confirm?: string;
  variant?: 'primary' | 'secondary';
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(() => {
          void advancePhase(tripId, to);
        });
      }}
    >
      {pending ? 'Working…' : children}
    </Button>
  );
}
