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
      {/* Column headers: the fields are narrow enough that placeholders alone
          left people guessing which box was which. */}
      <div className="flex gap-2 px-1 text-xs font-medium text-muted">
        <span className="flex-1">Name</span>
        <span className="w-20">Age</span>
        <span className="w-9" aria-hidden />
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            {/* Widths live on these wrappers, not on the inputs. The shared
                input style sets w-full, and Tailwind resolves a w-full/w-20
                clash by stylesheet order rather than by which class you wrote
                last — which silently made the age box wider than the name. */}
            <div className="flex-1">
              <Input
                name="attendeeName"
                value={row.name}
                onChange={(e) => update(row.key, { name: e.target.value })}
                placeholder="Name"
                aria-label="Name"
              />
            </div>
            <div className="w-20">
              <Input
                name="attendeeAge"
                value={row.age}
                onChange={(e) => update(row.key, { age: e.target.value })}
                placeholder="Age"
                inputMode="numeric"
                aria-label="Age"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-9 px-0"
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
