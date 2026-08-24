'use client';

import { useActionState, useRef, useState } from 'react';
import { inviteFamily } from '@/actions/families';
import type { ActionState } from '@/actions/auth';
import { Button, Field, FormError, Input } from '@/components/ui';

/**
 * One form, two meanings. During the `invites` phase the organizer adds
 * families outright; afterwards anyone can suggest one, but it needs the other
 * families' approval before an email goes anywhere.
 */
export interface KnownFamily {
  /** Null when they were invited but never joined — still worth offering. */
  householdId: string | null;
  name: string;
  emails: string[];
}

/**
 * Adds a family and sends their invitation, immediately.
 *
 * Any family can do this, at any point in the trip — these are people who
 * already know each other, and the invitation is identical whoever sends it.
 */
export function InviteFamilyForm({
  tripId,
  known = [],
}: {
  tripId: string;
  /** Families you have travelled with before. */
  known?: KnownFamily[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState('');
  const [emails, setEmails] = useState('');

  const [state, submit, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await inviteFamily(tripId, prev, formData);
      if (result.ok) {
        formRef.current?.reset();
        setName('');
        setEmails('');
      }
      return result;
    },
    {},
  );

  return (
    <form ref={formRef} action={submit} className="space-y-4">
      {/* Fills the fields below rather than inviting outright: the emails may be
          stale, and after the roster locks this still has to go through the
          group's approval gate like any other addition. */}
      {known.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-text">You&apos;ve invited before</p>
          <div className="flex flex-wrap gap-2">
            {known.map((k) => (
              <button
                key={k.householdId ?? k.emails.join(',')}
                type="button"
                onClick={() => {
                  setName(k.name);
                  setEmails(k.emails.join(', '));
                }}
                className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-left text-sm hover:border-accent"
              >
                <span className="block font-medium text-text">{k.name}</span>
                <span className="block text-xs text-muted">{k.emails.join(', ')}</span>
                <span className="block text-xs text-muted">
                  {k.householdId
                    ? 'Family saved — they only confirm who\u2019s coming'
                    : 'Never joined a trip yet'}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            Picking one fills in the fields below — check the addresses are still right.
          </p>
        </div>
      ) : (
        /* The picker vanishing entirely reads as "this feature does not exist",
           which is how it was first reported. Say why it is empty instead. */
        <p className="text-xs text-muted">
          Families you&apos;ve shared a trip with will appear here to pick from, so you only type
          their details once.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Family name" hint="However the group refers to them — shown as typed.">
          <Input
            name="name"
            required
            maxLength={60}
            placeholder="The Chens"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email(s)" hint="Comma-separated. Both spouses share one family.">
          <Input
            name="emails"
            required
            placeholder="kyle@example.com, sam@example.com"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
          />
        </Field>
      </div>


      <FormError message={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-moss-100 px-3 py-2 text-sm text-moss-600">{state.ok}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send invite'}
      </Button>
    </form>
  );
}
