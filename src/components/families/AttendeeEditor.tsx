'use client';

import { useActionState, useState } from 'react';
import { saveAttendees } from '@/actions/families';
import type { ActionState } from '@/actions/auth';
import { Button, FormError, Input } from '@/components/ui';

interface Row {
  key: string;
  name: string;
  age: string;
}

let counter = 0;
const newRow = (name = '', age = ''): Row => ({ key: `r${counter++}`, name, age });

/**
 * Who is actually coming, with ages. This is the number every later screen
 * leans on — Google Places will not tell us a house sleeps eight, so the group's
 * own headcount is the only capacity signal the lodging phase has.
 */
export function AttendeeEditor({
  tripId,
  familyId,
  initial,
}: {
  tripId: string;
  familyId: string;
  initial: { name: string | null; age: number | null }[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((a) => newRow(a.name ?? '', a.age === null ? '' : String(a.age)))
      : [newRow(), newRow()],
  );

  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveAttendees.bind(null, tripId, familyId),
    {},
  );

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex gap-2">
            <Input
              name="attendeeName"
              value={row.name}
              onChange={(e) => update(row.key, { name: e.target.value })}
              placeholder="Name"
              className="flex-1"
            />
            <Input
              name="attendeeAge"
              value={row.age}
              onChange={(e) => update(row.key, { age: e.target.value })}
              placeholder="Age"
              inputMode="numeric"
              className="w-20"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
              aria-label={`Remove ${row.name || 'person'}`}
            >
              ×
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => setRows((rs) => [...rs, newRow()])}>
          Add person
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save who’s coming'}
        </Button>
        {state.ok ? <span className="text-sm text-moss-600">{state.ok}</span> : null}
      </div>
      <FormError message={state.error} />
    </form>
  );
}
