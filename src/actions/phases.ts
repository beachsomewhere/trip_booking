'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { sendReminderEmail } from '@/lib/email/reminders';
import { PHASE_META, phaseHref, type TripPhase } from '@/lib/phases';
import { listFamilies } from '@/lib/format';

/**
 * Locking in a step.
 *
 * A vote says what you want; a lock says you are finished. Without the
 * distinction the group could never tell "hasn't looked yet" from "looked, and
 * is happy" — so nobody knew whether waiting longer would change anything.
 *
 * Locks are per family per phase, and reversible while the phase is open.
 */
async function myFamily(tripId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_family_id', { p_trip_id: tripId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('You are not part of this trip.');
  return data;
}

export async function lockPhase(tripId: string, phase: TripPhase) {
  const familyId = await myFamily(tripId);
  const supabase = await createClient();

  const { error } = await supabase.from('phase_signoffs').upsert(
    {
      trip_id: tripId,
      phase,
      family_id: familyId,
      signed_off_at: new Date().toISOString(),
    },
    { onConflict: 'trip_id,phase,family_id' },
  );
  if (error) throw new Error(error.message);

  revalidatePath(`/trips/${tripId}`, 'layout');
}

export async function unlockPhase(tripId: string, phase: TripPhase) {
  const familyId = await myFamily(tripId);
  const supabase = await createClient();

  const { error } = await supabase
    .from('phase_signoffs')
    .delete()
    .eq('trip_id', tripId)
    .eq('phase', phase)
    .eq('family_id', familyId);
  if (error) throw new Error(error.message);

  revalidatePath(`/trips/${tripId}`, 'layout');
}

/**
 * Nudges one family that the group is waiting on them.
 *
 * Any participating family can send this, not just the organizer — the point is
 * to unblock the group, and requiring the organizer to be the only one who can
 * chase people is how a trip stalls on one person being busy.
 */
export async function remindFamily(tripId: string, familyId: string, phase: TripPhase) {
  const supabase = await createClient();

  const [{ data: trip }, { data: members }, { data: signoffs }, { data: families }] =
    await Promise.all([
      supabase.from('trips').select('name').eq('id', tripId).maybeSingle(),
      supabase.from('family_members').select('email').eq('family_id', familyId),
      supabase.from('phase_signoffs').select('family_id').eq('trip_id', tripId).eq('phase', phase),
      supabase.from('families').select('id, name, status').eq('trip_id', tripId),
    ]);

  const to = (members ?? []).map((m) => m.email).filter(Boolean);
  if (!trip || to.length === 0) return { delivered: false };

  const myFamilyId = await myFamily(tripId);
  const fromFamily = (families ?? []).find((f) => f.id === myFamilyId)?.name ?? null;

  const lockedNames = (signoffs ?? [])
    .map((s) => (families ?? []).find((f) => f.id === s.family_id)?.name)
    .filter((n): n is string => Boolean(n));

  const waitingSince =
    lockedNames.length > 0 ? `${listFamilies(lockedNames)} already have.` : null;

  const { delivered } = await sendReminderEmail({
    to,
    tripName: trip.name,
    phaseLabel: PHASE_META[phase].label,
    phaseUrl: phaseHref(tripId, phase),
    fromFamily,
    waitingSince,
  });

  revalidatePath(`/trips/${tripId}`, 'layout');
  return { delivered };
}
