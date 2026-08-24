'use client';

import { useActionState, useRef, useState } from 'react';
import { proposeDates } from '@/actions/proposals';
import { DateRangeCalendar, type MarkedRange } from '@/components/dates/DateRangeCalendar';
import type { ActionState } from '@/actions/auth';
import { Button, Field, FormError, Textarea } from '@/components/ui';
import { formatDateRange, nightsBetween, pluralize } from '@/lib/format';

export function ProposeDatesForm({
  tripId,
  marked = [],
}: {
  tripId: string;
  marked?: MarkedRange[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await proposeDates(tripId, prev, fd);
      if (result.ok) {
        formRef.current?.reset();
        setStart(null);
        setEnd(null);
      }
      return result;
    },
    {},
  );

  const complete = Boolean(start && end);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      {/* The calendar is the input; these carry its value to the server action,
          which still expects `start` and `end` as YYYY-MM-DD. */}
      <input type="hidden" name="start" value={start ?? ''} />
      <input type="hidden" name="end" value={end ?? ''} />

      <DateRangeCalendar
        start={start}
        end={end}
        marked={marked}
        onSelect={(s, e) => {
          setStart(s);
          setEnd(e);
        }}
      />

      <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
        {complete ? (
          <span className="text-text">
            <strong>{formatDateRange(start!, end!)}</strong>
            <span className="ml-2 text-muted">
              {pluralize(nightsBetween(start!, end!), 'night')}
            </span>
          </span>
        ) : start ? (
          <span className="text-muted">Now pick the day you&apos;d leave.</span>
        ) : (
          <span className="text-muted">Pick the day you&apos;d arrive.</span>
        )}
      </div>

      <Field label="Anything to add?" hint="“Spring break week” — helps others read it fast.">
        <Textarea name="note" maxLength={280} />
      </Field>

      <FormError message={state.error} />
      {state.ok ? <p className="text-sm text-moss-600">{state.ok}</p> : null}

      <Button type="submit" disabled={pending || !complete}>
        {pending ? 'Adding…' : 'Suggest these dates'}
      </Button>
    </form>
  );
}
