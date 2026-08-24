'use client';

import { useTransition } from 'react';
import { resolveLodgingPrefs } from '@/actions/lodging';
import { Button, Card } from '@/components/ui';

export function ResolvePrefsButton({ tripId }: { tripId: string }) {
  const [pending, start] = useTransition();
  return (
    <Card className="space-y-2">
      <p className="text-sm text-muted">
        Combine everyone&apos;s answers and start searching. Types are pooled, so nobody gets ruled
        out; “stay together” wins if any family asked for it.
      </p>
      <Button
        disabled={pending}
        onClick={() =>
          start(() => {
            void resolveLodgingPrefs(tripId);
          })
        }
      >
        {pending ? 'Working…' : 'Search with these'}
      </Button>
    </Card>
  );
}
