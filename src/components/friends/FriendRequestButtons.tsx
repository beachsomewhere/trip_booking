'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { acceptFriend, declineFriend } from '@/actions/friends';
import { Button } from '@/components/ui';

/** Yes or no, on the request page itself. */
export function FriendRequestButtons({ token, fromName }: { token: string; fromName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null);

  if (done === 'accepted') {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-moss-100 px-3 py-2 text-sm text-moss-600">
          Done — you&apos;re on {fromName}&apos;s list.
        </p>
        {/* Until they name it, a brand-new household is literally called "My
            family", which is what everyone who added them would see. */}
        <p className="text-sm text-muted">
          Set your family name so they know which family you are — it takes a moment.
        </p>
        <Link href="/household">
          <Button variant="secondary">Name your family</Button>
        </Link>
      </div>
    );
  }
  if (done === 'declined') {
    return <p className="text-sm text-muted">No problem — nothing was shared.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await acceptFriend(token);
              if (res.error) setError(res.error);
              else {
                setDone('accepted');
                router.refresh();
              }
            })
          }
        >
          {pending ? 'Saving…' : 'Yes, add us'}
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await declineFriend(token);
              if (res.error) setError(res.error);
              else setDone('declined');
            })
          }
        >
          No thanks
        </Button>
      </div>
      {error ? (
        <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-600">{error}</p>
      ) : null}
    </div>
  );
}
