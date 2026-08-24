import { Card } from '@/components/ui';
import { pluralize } from '@/lib/format';
import { ageOn, CHILD_AGE, type BirthInfo } from '@/lib/age';

/**
 * Splits a family's attendees into adults and children's ages on a given date.
 *
 * Anyone whose birth data is missing counts as an adult: a listing that sleeps
 * four adults sleeps four people, so guessing that way is the safe direction to
 * be wrong in.
 */
export function splitByAge(
  attendees: BirthInfo[],
  onDate: string | null,
): { adults: number; childAges: number[] } {
  const childAges: number[] = [];
  let adults = 0;
  for (const a of attendees) {
    const { age } = ageOn(a, onDate);
    if (age != null && age < CHILD_AGE) childAges.push(age);
    else adults += 1;
  }
  return { adults, childAges: childAges.sort((x, y) => y - x) };
}

export type TogetherPref = 'together' | 'separate_ok' | 'prefer_separate' | 'no_preference';

export interface ArrangementRow {
  familyId: string;
  name: string;
  isMine: boolean;
  headcount: number;
  adults: number;
  /**
   * Ages of everyone under 18, on the trip's own start date, oldest first.
   * Listings price by adults, cap children, and charge for cots — so the ages
   * matter, not just the count. Anyone whose birth data is missing is counted
   * as an adult and does not appear here.
   */
  childAges: number[];
  /** Null until that family has answered. */
  pref: TogetherPref | null;
}

/** "2 adults, 2 children (9, 6)" — the shape a booking form asks for. */
function describe(rows: ArrangementRow[]): string {
  const adults = rows.reduce((n, r) => n + r.adults, 0);
  const ages = rows.flatMap((r) => r.childAges).sort((a, b) => b - a);
  if (adults === 0 && ages.length === 0) return 'nobody listed yet';
  if (ages.length === 0) return pluralize(adults, 'adult');
  return `${pluralize(adults, 'adult')}, ${pluralize(ages.length, 'child', 'children')} (${ages.join(', ')})`;
}

/** How each answer reads beside a family's name. */
const QUALIFIER: Record<TogetherPref, string> = {
  together: 'wants one roof',
  separate_ok: "doesn't mind either way",
  prefer_separate: 'their own place',
  no_preference: 'no strong feeling',
};

/**
 * Who is sleeping where, family by family.
 *
 * The group's resolved answer ("together" / "separate OK") is not what anyone
 * needs while shopping. Someone hunting for a rental needs to know it has to
 * fit the Barnes, the Millers and the Chens — nine people — and that the Kurz
 * are handling themselves, so it does not need to sleep eleven. That is only
 * legible per family, so it is shown per family.
 *
 * Only an explicit "our own place" takes a family out of the shared count. A
 * family that has not answered still needs beds, so they stay in it and are
 * marked unanswered — rounding them out of the number would understate what to
 * book, which is the more expensive mistake.
 */
export function SleepingArrangement({ rows }: { rows: ArrangementRow[] }) {
  const separate = rows.filter((r) => r.pref === 'prefer_separate');
  const sharing = rows.filter((r) => r.pref !== 'prefer_separate');

  const sharedHeadcount = sharing.reduce((n, r) => n + r.headcount, 0);
  const separateHeadcount = separate.reduce((n, r) => n + r.headcount, 0);
  const unanswered = sharing.filter((r) => !r.pref);

  return (
    <Card className="space-y-4">
      <p className="text-sm text-text">
        {sharing.length > 0 ? (
          <>
            <strong>One place for {sharedHeadcount}</strong>
            <span className="text-muted"> — {describe(sharing)}.</span>
          </>
        ) : (
          <strong>Everyone is sorting their own place.</strong>
        )}
        {separate.length > 0 ? (
          <span className="text-muted">
            {' '}
            {pluralize(separate.length, 'family', 'families')} looking separately (
            {separateHeadcount}).
          </span>
        ) : null}
        {unanswered.length > 0 ? (
          <span className="text-muted">
            {' '}
            {unanswered.length === 1
              ? `${unanswered[0].name} hasn't said yet — counted in, for now.`
              : `${unanswered.length} families haven't said yet — counted in, for now.`}
          </span>
        ) : null}
      </p>

      <Group title={`Together — ${sharedHeadcount}`} rows={sharing} empty="Nobody." />
      {separate.length > 0 ? (
        <Group title={`Their own place — ${separateHeadcount}`} rows={separate} />
      ) : null}
      <p className="border-t border-edge pt-3 text-xs text-muted">
        Ages are as of the first day of the trip.
      </p>
    </Card>
  );
}

function Group({ title, rows, empty }: { title: string; rows: ArrangementRow[]; empty?: string }) {
  return (
    <div className="space-y-1 border-t border-edge pt-3">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.familyId}
              className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"
            >
              <span className="text-text">
                {r.name}
                {r.isMine ? <span className="text-muted"> (you)</span> : null}
                <span className="text-muted"> · {describe([r])}</span>
              </span>
              <span className={r.pref ? 'shrink-0 text-muted' : 'shrink-0 text-clay-600'}>
                {r.pref ? QUALIFIER[r.pref] : "hasn't said"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
