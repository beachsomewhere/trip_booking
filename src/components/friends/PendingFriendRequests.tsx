'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptFriend, declineFriend, type PendingRequest } from '@/actions/friends';
import { Button, Card } from '@/components/ui';

/**
 * "The Barnes would like to add you", wherever you happen to land.
 *
 * The email can be missed, buried, or sent to an address someone reads on a
 * different device — so the request also waits for them in the app. Renders
 * nothing at all when there is nothing pending, which is the common case.
 */
export function PendingFriendRequests({ requests }: { requests: PendingRequest[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [handled, setHandled] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const open = requests.filter((r) => !handled.includes(r.linkId));
  if (open.length === 0) return null;

  return (
    <Card className="space-y-3 border-accent">
      {open.map((r) => (
        <div key={r.linkId} className="space-y-2">
          <p className="text-sm text-text">
            <strong>{r.fromName}</strong> would like to add your family to the people they travel
            with. They&apos;d see your family name and email address — nothing else, and no trip is
            being planned.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await acceptFriend(r.token);
                  if (res.error) setError(res.error);
                  else {
                    setHandled((x) => [...x, r.linkId]);
                    router.refresh();
                  }
                })
              }
            >
              Yes, add us
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await declineFriend(r.token);
                  if (res.error) setError(res.error);
                  else setHandled((x) => [...x, r.linkId]);
                })
              }
            >
              No thanks
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
