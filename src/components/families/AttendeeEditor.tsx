'use client';

import { useActionState, useState } from 'react';
import type { ActionState } from '@/actions/auth';
import { Button, FormError, Input, cx } from '@/components/ui';
import { MONTHS, ageOn, birthYearOptions } from '@/lib/age';

export interface EditablePerson {
  key: string;
  /** household_people.id when this person is remembered from a past trip. */
  personId: string | null;
  name: string;
  birthYear: string;
  birthMonth: string;
  coming: boolean;
}

let counter = 0;
export const blankPerson = (): EditablePerson => ({
  key: `p${counter++}`,
  personId: null,
  name: '',
  birthYear: '',
  birthMonth: '',
  coming: true,
});

/**
 * Who is coming, and when they were born.
 *
 * Birth month and year are asked for once and remembered on the household, so
 * the next trip already knows everyone and their current age. Storing a birth
 * date rather than an age is the whole point: an age typed in today is wrong by
 * the time a trip eighteen months out actually happens.
 */
export function AttendeeEditor({
  initial,
  tripStart,
  save,
  showComing = true,
  saveLabel,
}: {
  initial: EditablePerson[];
  /** Ages are shown as they will be on the trip, not as they are today. */
  tripStart: string | null;
  /** Bound server action — trip attendees, or the household on its own. */
  save: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /**
   * The "coming on this trip" column. Off when editing the household outside
   * any trip, where the question does not apply.
   */
  showComing?: boolean;
  saveLabel?: string;
}) {
  const [rows, setRows] = useState<EditablePerson[]>(() =>
    initial.length > 0 ? initial : [blankPerson(), blankPerson()],
  );

  const [state, action, pending] = useActionState<ActionState, FormData>(save, {});

  const update = (key: string, patch: Partial<EditablePerson>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const years = birthYearOptions();
  const coming = rows.filter((r) => r.coming && r.name.trim());

  return (
    <form action={action} className="space-y-3">
      {/* Column widths mirror the rows exactly, including the age readout and
          the remove button, or the labels drift out of line. */}
      <div className="flex items-center gap-2 px-1 text-xs font-medium text-muted">
        {showComing ? <span className="w-9 text-center">On?</span> : null}
        <span className="flex-1">Name</span>
        <span className="w-56">Born</span>
        <span className="w-9 text-center">Age</span>
        <span className="w-9" aria-hidden />
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const { age, approximate } = ageOn(
            {
              birth_year: row.birthYear ? Number(row.birthYear) : null,
              birth_month: row.birthMonth ? Number(row.birthMonth) : null,
              age: null,
            },
            tripStart,
          );

          return (
            <div
              key={row.key}
              className={cx('flex items-center gap-2', showComing && !row.coming && 'opacity-50')}
            >
              {showComing ? (
                <label className="flex w-9 justify-center">
                  <span className="sr-only">Coming on this trip</span>
                  <input
                    type="checkbox"
                    checked={row.coming}
                    onChange={(e) => update(row.key, { coming: e.target.checked })}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </label>
              ) : null}

              {/* Only people who are coming are submitted, but every row is kept
                  on the household so next trip still remembers them. */}
              <input type="hidden" name="personId" value={row.personId ?? ''} />
              <input type="hidden" name="coming" value={!showComing || row.coming ? '1' : '0'} />

              <div className="flex-1">
                <Input
                  name="attendeeName"
                  value={row.name}
                  onChange={(e) => update(row.key, { name: e.target.value })}
                  placeholder="Name"
                  aria-label="Name"
                />
              </div>

              <div className="flex w-56 gap-2">
                <select
                  name="birthMonth"
                  value={row.birthMonth}
                  onChange={(e) => update(row.key, { birthMonth: e.target.value })}
                  aria-label="Birth month"
                  className="w-28 rounded-lg border border-edge bg-surface px-2 py-2 text-sm text-text"
                >
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  name="birthYear"
                  value={row.birthYear}
                  onChange={(e) => update(row.key, { birthYear: e.target.value })}
                  aria-label="Birth year"
                  className="w-24 rounded-lg border border-edge bg-surface px-2 py-2 text-sm text-text"
                >
                  <option value="">Year</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <span className="w-9 text-center text-sm text-muted" aria-live="polite">
                {age != null ? `${approximate ? '~' : ''}${age}` : ''}
              </span>

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
          );
        })}
      </div>

      <p className="text-xs text-muted">
        We keep birth month and year — never a full date of birth — so the next trip already knows
        everyone&apos;s age. Ages shown are as they&apos;ll be
        {tripStart ? ' on the trip' : ' today'}.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => setRows((rs) => [...rs, blankPerson()])}>
          Add person
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? 'Saving…'
            : saveLabel
              ? saveLabel
              : coming.length > 0
                ? `Save ${coming.length} coming`
                : "Save who's coming"}
        </Button>
        {state.ok ? <span className="text-sm text-moss-600">{state.ok}</span> : null}
      </div>
      <FormError message={state.error} />
    </form>
  );
}
