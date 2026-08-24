'use client';

import { useMemo, useState } from 'react';
import { cx } from '@/components/ui';

/**
 * Two-month range calendar: click the arrival, click the departure.
 *
 * Replaces two <input type="date"> fields. Those are genuinely bad for this
 * job — they render differently in every browser, force a US mm/dd/yyyy mental
 * model, and make you open two separate pickers to express one range, with no
 * way to see how long the trip is or whether the dates you are choosing overlap
 * what another family already suggested.
 *
 * Dates are handled entirely in UTC and passed around as `YYYY-MM-DD` strings,
 * matching the Postgres `date` columns. Constructing local Date objects here
 * would shift the selection by a day for anyone west of UTC.
 */

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const MONTH_TITLE = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const FULL_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Today as YYYY-MM-DD in UTC. */
function todayKey(): string {
  const now = new Date();
  return key(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Weekday index (0 = Sunday) of the 1st of the month. */
function firstWeekday(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 1)).getUTCDay();
}

function shiftMonth(y: number, m: number, by: number): { y: number; m: number } {
  const total = y * 12 + m + by;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}

export interface MarkedRange {
  start: string;
  end: string;
  label: string;
}

export function DateRangeCalendar({
  start,
  end,
  onSelect,
  marked = [],
  months = 2,
}: {
  start: string | null;
  end: string | null;
  onSelect: (start: string | null, end: string | null) => void;
  /** Ranges other families already suggested, shown as a subtle underline. */
  marked?: MarkedRange[];
  months?: number;
}) {
  const today = useMemo(() => todayKey(), []);

  // Open on the month of the current selection, else this month.
  const [cursor, setCursor] = useState(() => {
    const from = start ?? today;
    return { y: Number(from.slice(0, 4)), m: Number(from.slice(5, 7)) - 1 };
  });

  const [hovered, setHovered] = useState<string | null>(null);

  // While picking the end date, preview the range under the cursor.
  const previewEnd = end ?? (start && hovered && hovered > start ? hovered : null);

  function handleClick(dayKey: string) {
    if (dayKey < today) return;

    // No start yet, or restarting: begin a new range.
    if (!start || end || dayKey < start) {
      onSelect(dayKey, null);
      return;
    }
    // Clicking the start again makes it a one-night stay rather than a no-op,
    // which is what people mean when they click the same day twice.
    onSelect(start, dayKey);
  }

  const markedFor = (dayKey: string) =>
    marked.find((r) => dayKey >= r.start && dayKey <= r.end);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor((c) => shiftMonth(c.y, c.m, -1))}
          className="rounded-lg px-3 py-1 text-sm text-muted hover:bg-surface-2 hover:text-text"
          aria-label="Previous month"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => setCursor((c) => shiftMonth(c.y, c.m, 1))}
          className="rounded-lg px-3 py-1 text-sm text-muted hover:bg-surface-2 hover:text-text"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div
        className={cx('grid gap-6', months > 1 ? 'sm:grid-cols-2' : 'grid-cols-1')}
        onMouseLeave={() => setHovered(null)}
      >
        {Array.from({ length: months }, (_, i) => {
          const { y, m } = shiftMonth(cursor.y, cursor.m, i);
          const lead = firstWeekday(y, m);
          const count = daysInMonth(y, m);

          return (
            <div key={`${y}-${m}`} className={i > 0 ? 'hidden sm:block' : undefined}>
              <p className="mb-2 text-center text-sm font-medium text-text">
                {MONTH_TITLE.format(new Date(Date.UTC(y, m, 1)))}
              </p>

              <div className="grid grid-cols-7 gap-y-1">
                {DAY_LABELS.map((d, idx) => (
                  <span
                    key={idx}
                    className="pb-1 text-center text-xs font-medium text-muted"
                    aria-hidden
                  >
                    {d}
                  </span>
                ))}

                {Array.from({ length: lead }, (_, k) => (
                  <span key={`lead-${k}`} />
                ))}

                {Array.from({ length: count }, (_, k) => {
                  const day = k + 1;
                  const dk = key(y, m, day);

                  const past = dk < today;
                  const isStart = dk === start;
                  const isEnd = dk === end;
                  const inRange =
                    Boolean(start) && Boolean(previewEnd) && dk > start! && dk < previewEnd!;
                  const isEdge = isStart || isEnd || (dk === previewEnd && !end);
                  const mark = markedFor(dk);

                  return (
                    <button
                      key={dk}
                      type="button"
                      disabled={past}
                      onClick={() => handleClick(dk)}
                      onMouseEnter={() => setHovered(dk)}
                      aria-label={FULL_DATE.format(new Date(`${dk}T00:00:00Z`))}
                      aria-pressed={isStart || isEnd}
                      title={mark ? `${mark.label} suggested this week` : undefined}
                      className={cx(
                        'relative mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors',
                        past && 'cursor-not-allowed text-muted/40',
                        !past && !isEdge && !inRange && 'text-text hover:bg-surface-2',
                        inRange && 'bg-accent-soft text-accent',
                        isEdge && 'bg-accent font-semibold text-white',
                      )}
                    >
                      {day}
                      {mark && !isEdge ? (
                        <span
                          aria-hidden
                          className="absolute bottom-1 h-1 w-1 rounded-full bg-clay-500"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {marked.length > 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <span aria-hidden className="h-1 w-1 rounded-full bg-clay-500" />
          Already suggested by another family
        </p>
      ) : null}
    </div>
  );
}
