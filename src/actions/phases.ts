'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  sendLockNoticeEmail,
  sendPhaseOpenEmail,
  sendReminderEmail,
} from '@/lib/email/reminders';
import { PHASES, PHASE_META, normalizePhase, phaseHref, type TripPhase } from '@/lib/phases';
import { formatDateRange, listFamilies } from '@/lib/format';

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

  await announceLock(tripId, phase, familyId);

  revalidatePath(`/trips/${tripId}`, 'layout');
}

/**
 * Tells the families who haven't finished that another one has.
 *
 * This is the quiet failure the app was built around: a trip stalls because
 * nobody knows it is stalling. One family finishing is the moment the others
 * can act on, so it is the moment worth an email — and it carries more weight
 * than a reminder, because nobody is being asked, the group is simply moving.
 *
 * Never allowed to break the lock itself. A mail outage must not stop someone
 * finishing a step.
 */
async function announceLock(tripId: string, phase: TripPhase, lockedBy: string) {
  try {
    const supabase = await createClient();

    // Once per family per step per six hours, claimed atomically. Re-locking is
    // ordinary — a withdrawn proposal resets a stale lock, and the UI invites
    // people to change their mind — but it is not news, and announcing it every
    // time is how a helpful nudge becomes a reason to mute the sender.
    const { data: mayAnnounce, error: claimError } = await supabase.rpc(
      'claim_lock_announcement',
      { p_trip_id: tripId, p_phase: phase },
    );
    if (claimError) {
      console.error('[lock-notice] could not claim the announcement', claimError.message);
      return;
    }
    if (!mayAnnounce) return;

    const [{ data: trip }, { data: families }, { data: signoffs }] = await Promise.all([
      supabase.from('trips').select('name').eq('id', tripId).maybeSingle(),
      supabase.from('families').select('id, name, status').eq('trip_id', tripId),
      supabase.from('phase_signoffs').select('family_id').eq('trip_id', tripId).eq('phase', phase),
    ]);
    if (!trip) return;

    // Only families who can actually act: accepted, still in, not yet finished.
    const active = (families ?? []).filter((f) => f.status === 'active');
    const lockedIds = new Set((signoffs ?? []).map((s) => s.family_id));
    const outstanding = active.filter((f) => !lockedIds.has(f.id) && f.id !== lockedBy);
    if (outstanding.length === 0) return;

    const lockedFamily = active.find((f) => f.id === lockedBy)?.name ?? 'A family';
    const remaining = outstanding.map((f) => f.name);

    const { data: members } = await supabase
      .from('family_members')
      .select('family_id, email')
      .in('family_id', outstanding.map((f) => f.id));

    // One email per family, not per address: spouses share a decision, and two
    // copies of the same nudge reads as a broken app.
    await Promise.all(
      outstanding.map((family) => {
        const to = (members ?? [])
          .filter((m) => m.family_id === family.id)
          .map((m) => m.email)
          .filter(Boolean);
        if (to.length === 0) return null;

        return sendLockNoticeEmail({
          to,
          tripName: trip.name,
          phase,
          phaseLabel: PHASE_META[phase].label,
          phaseUrl: phaseHref(tripId, phase),
          lockedFamily,
          lockedCount: lockedIds.size,
          totalCount: active.length,
          remaining,
        });
      }),
    );
  } catch (err) {
    console.error('[lock-notice] could not announce the lock', err);
  }
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
    phase,
    phaseLabel: PHASE_META[phase].label,
    phaseUrl: phaseHref(tripId, phase),
    fromFamily,
    waitingSince,
  });

  revalidatePath(`/trips/${tripId}`, 'layout');
  return { delivered };
}

/**
 * Tells every family that a step has closed and the next one is open.
 *
 * This is the gap the app was built to close. A step finishes, and until
 * somebody happens to open the trip, nobody knows their turn has come round —
 * so the trip stalls at exactly the moment it was ready to move.
 *
 * Sent to everyone, including the families who already locked the step that
 * just closed: they are the ones who have been waiting, and "it moved" is the
 * news they were waiting for. Best-effort, and never allowed to break the
 * advance itself.
 */
export async function announcePhaseOpen(tripId: string, to: TripPhase) {
  try {
    const supabase = await createClient();

    const [{ data: trip }, { data: families }] = await Promise.all([
      supabase
        .from('trips')
        .select('name, phase, agreed_start_date, agreed_end_date, destination_name')
        .eq('id', tripId)
        .maybeSingle(),
      supabase.from('families').select('id, name, status').eq('trip_id', tripId),
    ]);
    if (!trip) return;

    const active = (families ?? []).filter((f) => f.status === 'active');
    if (active.length === 0) return;

    const { data: members } = await supabase
      .from('family_members')
      .select('family_id, email')
      .in('family_id', active.map((f) => f.id));

    const previous = PHASES[Math.max(PHASES.indexOf(normalizePhase(to)) - 1, 0)];
    const finishedLabel = to === previous ? null : PHASE_META[previous].label;

    // What the step that just closed actually decided. "Where is open" is
    // useful; "the dates are Oct 23–30, and where is open" is the answer they
    // came back for.
    const settled =
      previous === 'dates' && trip.agreed_start_date && trip.agreed_end_date
        ? `${formatDateRange(trip.agreed_start_date, trip.agreed_end_date)} it is.`
        : previous === 'destination' && trip.destination_name
          ? `${trip.destination_name} it is.`
          : null;

    await Promise.all(
      active.map((family) => {
        const emails = (members ?? [])
          .filter((m) => m.family_id === family.id)
          .map((m) => m.email)
          .filter(Boolean);
        if (emails.length === 0) return null;

        return sendPhaseOpenEmail({
          to: emails,
          tripName: trip.name,
          phase: to,
          phaseLabel: PHASE_META[to].label,
          phaseBlurb: PHASE_META[to].blurb,
          phaseUrl: phaseHref(tripId, to),
          finishedLabel,
          settled,
        });
      }),
    );
  } catch (err) {
    console.error('[phase-open] could not announce the new step', err);
  }
}
