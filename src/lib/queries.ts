import { notFound, redirect } from 'next/navigation';
import { createClient, getUser } from '@/lib/supabase/server';
import type { Database } from '@/types/db';
import { normalizePhase, type TripPhase } from '@/lib/phases';

export type Trip = Database['public']['Tables']['trips']['Row'];
export type Family = Database['public']['Tables']['families']['Row'];
export type Attendee = Database['public']['Tables']['family_attendees']['Row'];
export type Member = Database['public']['Tables']['family_members']['Row'];

export interface FamilyWithPeople extends Family {
  family_members: Member[];
  family_attendees: Attendee[];
}

export interface TripContext {
  trip: Trip;
  phase: TripPhase;
  families: FamilyWithPeople[];
  /** Active families only — the ones whose votes count. */
  votingFamilies: FamilyWithPeople[];
  myFamily: FamilyWithPeople | null;
  isOrganizer: boolean;
  userId: string;
  userEmail: string | null;
  /** Total heads across active families. Every lodging card needs this. */
  headcount: number;
  adults: number;
  children: number;
}

const CHILD_AGE = 18;

/**
 * The one loader every trip screen uses.
 *
 * Pulls the trip, the full roster, and the caller's position in it in a single
 * round trip, so individual pages only query the rows specific to their phase.
 */
export async function loadTripContext(tripId: string): Promise<TripContext> {
  const user = await getUser();
  if (!user) redirect(`/login?next=/trips/${tripId}`);

  const supabase = await createClient();

  const [{ data: trip }, { data: families }] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
    supabase
      .from('families')
      .select('*, family_members(*), family_attendees(*)')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true }),
  ]);

  // RLS returns zero rows rather than an error for a trip you are not in, so a
  // missing trip and a forbidden trip look the same here — which is the point.
  if (!trip) notFound();

  const roster = (families ?? []) as FamilyWithPeople[];
  const voting = roster.filter((f) => f.status === 'active');
  const myFamily =
    roster.find((f) => f.family_members.some((m) => m.user_id === user.id)) ?? null;

  const attendees = voting.flatMap((f) => f.family_attendees);
  const children = attendees.filter((a) => a.age !== null && a.age < CHILD_AGE).length;

  return {
    trip,
    phase: normalizePhase(trip.phase as TripPhase),
    families: roster,
    votingFamilies: voting,
    myFamily,
    isOrganizer: trip.organizer_user_id === user.id,
    userId: user.id,
    userEmail: user.email ?? null,
    headcount: attendees.length,
    adults: attendees.length - children,
    children,
  };
}

/**
 * Unwraps a Supabase list query, logging failures instead of silently yielding
 * an empty array.
 *
 * A `?? []` on a failed query renders as "nothing here yet", which is
 * indistinguishable from a genuinely empty table. That cost real debugging time
 * once already (a PostgREST embed error surfaced as an empty trip list), so
 * every list read goes through here.
 */
export function rows<T>(
  label: string,
  res: { data: T[] | null; error: { message: string } | null },
): T[] {
  if (res.error) console.error(`[query:${label}] ${res.error.message}`);
  return res.data ?? [];
}

export function familyName(families: { id: string; name: string }[], id: string | null): string {
  if (!id) return 'Someone';
  return families.find((f) => f.id === id)?.name ?? 'Someone';
}
