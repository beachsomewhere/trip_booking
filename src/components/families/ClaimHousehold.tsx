'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { claimHousehold, declineHouseholdClaim, type ClaimableHousehold } from '@/actions/household';
import { Button, Card } from '@/components/ui';

/**
 * "The Barnes list you as Jo — is that you?"
 *
 * Somebody adding their spouse to the family list and that spouse signing in
 * used to produce a second, empty household: they saw none of the family they
 * were actually in. This is how they get in — by answering, not automatically,
 * because an email match is a claim anyone can make about anyone.
 *
 * Renders nothing when there is nothing to ask, which is almost always.
 */
export function ClaimHousehold({ options }: { options: ClaimableHousehold[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [answered, setAnswered] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const open = options.filter((o) => !answered.includes(o.householdId));
  if (open.length === 0) return null;

  return (
    <Card className="space-y-3 border-accent">
      {open.map((o) => (
        <div key={o.householdId} className="space-y-2">
          <p className="text-sm text-text">
            <strong>{o.householdName}</strong> list you as <strong>{o.personName}</strong>. If
            that&apos;s you, join them — you&apos;ll share one family and see the trips they&apos;re
            on, instead of starting an empty one.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await claimHousehold(o.householdId);
                  if (res.error) setError(res.error);
                  else {
                    setAnswered((x) => [...x, o.householdId]);
                    router.refresh();
                  }
                })
              }
            >
              Yes, that&apos;s me
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await declineHouseholdClaim(o.householdId);
                  if (res.error) setError(res.error);
                  else setAnswered((x) => [...x, o.householdId]);
                })
              }
            >
              Not me
            </Button>
          </div>
        </div>
      ))}
      {error ? (
        <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-600">{error}</p>
      ) : null}
    </Card>
  );
}
