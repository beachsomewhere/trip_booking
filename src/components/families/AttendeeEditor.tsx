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
  /** Comma-separated. Anyone with an address can sign in and follow the trip. */
  emails: string;
}

let counter = 0;
export const blankPerson = (): EditablePerson => ({
  key: `p${counter++}`,
  personId: null,
  name: '',
  birthYear: '',
  birthMonth: '',
  coming: true,
  emails: '',
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
          the remove button, or the labels drift out of line. Hidden once the
          rows wrap: headings that line up with nothing are worse than none, and
          every field below is labelled for screen readers regardless. */}
      <div className="hidden items-center gap-2 px-1 text-xs font-medium text-muted sm:flex">
        {showComing ? <span className="w-9 text-center">On?</span> : null}
        <span className="flex-1">Name</span>
        <span className="w-56">Born *</span>
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
              className={cx(
                'space-y-2 rounded-lg border border-edge p-2',
                showComing && !row.coming && 'opacity-60',
              )}
            >
            {/* One line on a laptop; two on a phone. The born group is a fixed
                224px, so on a narrow screen a single row left the name field
                squeezed to a sliver — you could not see whose row you were
                editing. */}
            <div className="flex flex-wrap items-center gap-2">
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

              <div className="min-w-0 flex-1">
                <Input
                  name="attendeeName"
                  value={row.name}
                  onChange={(e) => update(row.key, { name: e.target.value })}
                  placeholder="Name"
                  aria-label="Name"
                />
              </div>

              <div className="flex basis-full items-center gap-2 sm:basis-auto">
              <div className="flex min-w-0 flex-1 gap-2 sm:w-56 sm:flex-none">
                <select
                  name="birthMonth"
                  value={row.birthMonth}
                  onChange={(e) => update(row.key, { birthMonth: e.target.value })}
                  aria-label="Birth month"
                  required
                  className="min-w-0 flex-[3] rounded-lg border border-edge bg-surface px-2 py-2 text-sm text-text sm:w-28 sm:flex-none"
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
                  required
                  className="min-w-0 flex-[2] rounded-lg border border-edge bg-surface px-2 py-2 text-sm text-text sm:w-24 sm:flex-none"
                >
                  <option value="">Year</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <span className="w-9 shrink-0 text-center text-sm text-muted" aria-live="polite">
                {age != null ? `${approximate ? '~' : ''}${age}` : ''}
              </span>

              <Button
                type="button"
                variant="ghost"
                className="w-9 shrink-0 px-0"
                onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                aria-label={`Remove ${row.name || 'person'}`}
              >
                ×
              </Button>
              </div>
            </div>

            {/* Addresses belong to the person, so the group knows whose is
                whose — and anyone listed here can sign in and follow the trip,
                whether or not they are travelling. */}
            <div className="flex flex-wrap items-center gap-2 pl-2">
              <span className="text-xs text-muted">Email</span>
              <div className="flex-1">
                <Input
                  name="personEmails"
                  value={row.emails}
                  onChange={(e) => update(row.key, { emails: e.target.value })}
                  placeholder="kyle@example.com"
                  aria-label={`Email for ${row.name || 'this person'}`}
                />
              </div>
            </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted">
        Birth month and year are required — they&apos;re how ages stay right on a trip that&apos;s
        still months away, and we never keep a full date of birth. At least one person needs an
        email so the group can reach you. Ages shown are as they&apos;ll be
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
