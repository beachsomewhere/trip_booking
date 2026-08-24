/**
 * Ages from month-and-year birth data.
 *
 * The app stores birth month and year rather than a full date of birth: that is
 * enough to know someone's exact age on a given day — which is all the headcount
 * and lodging logic uses — without holding complete dates of birth for other
 * people's children.
 *
 * Ages are computed *on the trip's start date*, not today. A nine-year-old on a
 * trip eighteen months out is ten by the time anyone books a room for them.
 */

export const CHILD_AGE = 18;

export interface BirthInfo {
  birth_year: number | null;
  birth_month: number | null;
  /** Legacy free-typed age, from before birth data existed. */
  age: number | null;
}

/**
 * Age on `onDate`, or null when nothing is known.
 *
 * With a month and year this is exact. With only a year it assumes mid-year,
 * which can be a year out either side — so `yearOnly` is reported back for
 * callers that want to hedge the wording.
 */
export function ageOn(
  info: BirthInfo,
  onDate: string | null,
): { age: number | null; approximate: boolean } {
  if (info.birth_year == null) {
    // Nothing but a typed-in age: it was accurate whenever it was entered.
    return { age: info.age, approximate: info.age != null };
  }

  const ref = onDate ? new Date(`${onDate}T00:00:00Z`) : new Date();
  const refYear = ref.getUTCFullYear();
  const refMonth = ref.getUTCMonth() + 1;

  let age = refYear - info.birth_year;

  if (info.birth_month == null) {
    // Year only: assume July, so the answer is never more than six months out.
    if (refMonth < 7) age -= 1;
    return { age: Math.max(age, 0), approximate: true };
  }

  if (refMonth < info.birth_month) age -= 1;
  return { age: Math.max(age, 0), approximate: false };
}

export function isChildOn(info: BirthInfo, onDate: string | null): boolean {
  const { age } = ageOn(info, onDate);
  return age != null && age < CHILD_AGE;
}

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Plausible birth years, newest first — nobody scrolls to 1900 for a toddler. */
export function birthYearOptions(now: Date = new Date()): number[] {
  const thisYear = now.getUTCFullYear();
  return Array.from({ length: 100 }, (_, i) => thisYear - i);
}
