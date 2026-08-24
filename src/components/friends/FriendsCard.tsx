'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { removeFriend, requestFriend, type Friend, type SentRequest } from '@/actions/friends';
import type { ActionState } from '@/actions/auth';
import { Button, Field, FormError, Input } from '@/components/ui';

/**
 * The families you travel with, kept between trips.
 *
 * The point is that the first trip with someone new is the only time anybody
 * types their address. After that they are one tap on the invite form of every
 * future trip.
 */
export function FriendsCard({ friends, sent }: { friends: Friend[]; sent: SentRequest[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [gone, setGone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [state, submit, sending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await requestFriend(prev, formData);
      if (result.ok) formRef.current?.reset();
      return result;
    },
    {},
  );

  const unlink = (linkId: string) =>
    start(async () => {
      setError(null);
      const res = await removeFriend(linkId);
      if (res.error) setError(res.error);
      else setGone((x) => [...x, linkId]);
    });

  const live = friends.filter((f) => !gone.includes(f.linkId));
  const waiting = sent.filter((s) => !gone.includes(s.linkId));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Families you travel with
        </h2>
        <p className="text-sm text-muted">
          Add someone once and they&apos;re one tap on every future trip. They see your family name
          and email address — nothing about who&apos;s in your family, or their ages.
        </p>
      </div>

      {live.length > 0 ? (
        <ul className="space-y-1 border-t border-edge pt-3">
          {live.map((f) => (
            <li key={f.linkId} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm">
                <span className="text-text">{f.name}</span>
                <span className="text-muted"> · {f.emails.join(', ')}</span>
              </span>
              <Button
                variant="ghost"
                className="px-2 py-1 text-xs"
                disabled={pending}
                onClick={() => unlink(f.linkId)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-edge pt-3 text-sm text-muted">
          Nobody yet. Add the families you usually go away with.
        </p>
      )}

      {waiting.length > 0 ? (
        <div className="space-y-1 border-t border-edge pt-3">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Waiting to hear back</p>
          {waiting.map((s) => (
            <div key={s.linkId} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-muted">{s.email}</span>
              <span className="flex items-center gap-2">
                {/* The link is here because an email can bounce, land in spam,
                    or go to an address they no longer read. */}
                <CopyLink url={s.url} />
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  disabled={pending}
                  onClick={() => unlink(s.linkId)}
                >
                  Cancel
                </Button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <form ref={formRef} action={submit} className="space-y-3 border-t border-edge pt-4">
        <Field label="Add a family" hint="They'll get an email and have to say yes.">
          <Input name="email" type="email" required placeholder="sam@example.com" />
        </Field>
        <FormError message={state.error} />
        {state.ok ? (
          <p className="rounded-lg bg-moss-100 px-3 py-2 text-sm break-all text-moss-600">
            {state.ok}
          </p>
        ) : null}
        <Button type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Send request'}
        </Button>
      </form>

      {error ? (
        <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-600">{error}</p>
      ) : null}
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-xs text-accent underline underline-offset-4"
      onClick={() => {
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
