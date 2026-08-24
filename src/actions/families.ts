'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient, createClient, getUser } from '@/lib/supabase/server';
import { sendInviteEmail } from '@/lib/email/invites';
import { listFamilies } from '@/lib/format';
import type { ActionState } from '@/actions/auth';
import type { Database } from '@/types/db';

type FamilyStatus = Database['public']['Enums']['family_status'];

/** Accepts "a@x.com, b@y.com" or one per line. */
function parseEmails(raw: FormDataEntryValue | null): string[] {
  const value = typeof raw === 'string' ? raw : '';
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  ];
}

const emailListSchema = z
  .array(z.string().email())
  .min(1, 'Add at least one email address.');

const familyFormSchema = z.object({
  name: z.string().trim().min(1, 'Give the family a name.').max(60),
});

/**
 * Sends every not-yet-sent invitation for a trip.
 *
 * Kept separate from the RPCs that create invitation rows so that a failed
 * email never rolls back the roster change — the row persists and this can be
 * retried, rather than the family silently vanishing.
 */
async function flushInvitations(tripId: string): Promise<{ sent: number; failed: number }> {
  const supabase = await createClient();
  const [{ data: trip }, { data: pending }] = await Promise.all([
    supabase.from('trips').select('name, description, organizer_user_id').eq('id', tripId).maybeSingle(),
    supabase
      .from('invitations')
      // invited_by_family_id, NOT family_id: the latter is the family being
      // invited, which is how every invite email ended up telling recipients
      // that they had added themselves.
      .select(
        'id, email, token, family_id, invited_by:families!invitations_invited_by_family_id_fkey(name)',
      )
      .eq('trip_id', tripId)
      .is('sent_at', null),
  ]);

  if (!trip || !pending || pending.length === 0) return { sent: 0, failed: 0 };

  const user = await getUser();
  let sent = 0;
  let failed = 0;

  for (const inv of pending) {
    const { delivered } = await sendInviteEmail({
      to: inv.email,
      token: inv.token,
      tripName: trip.name,
      tripDescription: trip.description,
      fromFamily: inv.invited_by?.name ?? null,
      organizerEmail: user?.email,
    });
    if (delivered) sent++;
    else failed++;

    // Stamp regardless: the row is the record that an invite exists, and the
    // token stays valid, so an undelivered one can be copied out by hand.
    await supabase
      .from('invitations')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', inv.id);
  }

  return { sent, failed };
}

export async function inviteFamily(
  tripId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsedName = familyFormSchema.safeParse({ name: formData.get('name') });
  if (!parsedName.success) return { error: parsedName.error.issues[0].message };

  const emails = parseEmails(formData.get('emails'));
  const parsedEmails = emailListSchema.safeParse(emails);
  if (!parsedEmails.success) {
    return { error: emails.length === 0 ? 'Add at least one email address.' : 'One of those is not a valid email.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('invite_family', {
    p_trip_id: tripId,
    p_name: parsedName.data.name,
    p_emails: parsedEmails.data,
  });
  if (error) return { error: error.message };

  const { sent, failed } = await flushInvitations(tripId);
  revalidatePath(`/trips/${tripId}/families`);

  if (failed > 0 && sent === 0) {
    return {
      ok: `Added ${parsedName.data.name}. Email is not configured, so copy their invite link below and send it yourself.`,
    };
  }
  return { ok: `Invited ${parsedName.data.name}.` };
}

export async function setFamilyStatus(tripId: string, familyId: string, status: FamilyStatus) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_family_status', {
    p_family_id: familyId,
    p_status: status,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/trips/${tripId}`, 'layout');
  revalidatePath('/trips');
}

/**
 * Leaves the trip: the group sees the family as opted out and stops counting
 * them, and the trip drops off this family's list.
 *
 * The redirect is required, not cosmetic. Opting out makes is_trip_member()
 * false, so staying on the trip page would leave the caller staring at a screen
 * that now 404s on refresh.
 */
export async function leaveTrip(tripId: string, familyId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_family_status', {
    p_family_id: familyId,
    p_status: 'opted_out',
  });
  if (error) throw new Error(error.message);

  revalidatePath('/trips');
  redirect('/trips');
}

export async function resendInvites(tripId: string) {
  const supabase = await createClient();
  // Clearing sent_at makes flushInvitations pick them up again.
  await supabase
    .from('invitations')
    .update({ sent_at: null })
    .eq('trip_id', tripId)
    .is('accepted_at', null);
  await flushInvitations(tripId);
  revalidatePath(`/trips/${tripId}/families`);
}

/**
 * First-time setup, done from inside a trip.
 *
 * A family invited to their first trip has no household yet, so the picker has
 * nothing to pick. Rather than sending them elsewhere to fill in a form and
 * come back, this takes names and birth months right there, saves them to the
 * household so every later trip already knows them, and marks the ticked ones
 * as coming — one step instead of a detour.
 */
export async function saveFamilyAndAttend(
  tripId: string,
  familyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const names = formData.getAll('attendeeName').map((v) => String(v).trim());
  const months = formData.getAll('birthMonth').map((v) => String(v).trim());
  const years = formData.getAll('birthYear').map((v) => String(v).trim());
  const emailLists = formData.getAll('personEmails').map((v) => String(v));
  const coming = formData.getAll('coming').map((v) => String(v) === '1');

  const num = (v: string) => (v === '' ? null : Number(v));
  const splitEmails = (v: string) => [
    ...new Set(
      v
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  const people = names
    .map((name, i) => ({
      name,
      birth_month: num(months[i] ?? ''),
      birth_year: num(years[i] ?? ''),
      emails: splitEmails(emailLists[i] ?? ''),
      coming: coming[i] ?? true,
    }))
    .filter((p) => p.name.length > 0);

  if (people.length === 0) return { error: 'Add at least one person.' };

  // Both are load-bearing, so they are required rather than encouraged:
  // without a birth month and year there is no age to compute, and a family
  // with no address at all cannot be reached about the trip again.
  const missingBirth = people.filter((p) => p.birth_month == null || p.birth_year == null);
  if (missingBirth.length > 0) {
    return {
      error: `Add a birth month and year for ${listFamilies(missingBirth.map((p) => p.name))}.`,
    };
  }

  if (!people.some((p) => p.emails.length > 0)) {
    return {
      error:
        'At least one person needs an email address, or nobody in your family can be reached about the trip.',
    };
  }


  const supabase = await createClient();

  const { data: householdId, error: hhError } = await supabase.rpc('ensure_household');
  if (hhError) return { error: hhError.message };

  const created: { id: string; person: (typeof people)[number] }[] = [];

  for (const person of people) {
    const { data, error } = await supabase
      .from('household_people')
      .insert({
        household_id: householdId,
        name: person.name,
        birth_month: person.birth_month,
        birth_year: person.birth_year,
      })
      .select('id')
      .single();
    if (error) return { error: error.message };
    if (!data?.id) continue;

    created.push({ id: data.id, person });

    if (person.emails.length > 0) {
      await supabase
        .from('household_person_emails')
        .insert(person.emails.map((email) => ({ person_id: data.id, email })));
    }
  }

  await supabase.from('families').update({ household_id: householdId }).eq('id', familyId);

  await supabase.from('family_attendees').delete().eq('family_id', familyId);

  const attending = created.filter((c) => c.person.coming);
  if (attending.length > 0) {
    const { error } = await supabase.from('family_attendees').insert(
      attending.map((c) => ({
        family_id: familyId,
        person_id: c.id,
        name: c.person.name,
        birth_month: c.person.birth_month,
        birth_year: c.person.birth_year,
      })),
    );
    if (error) return { error: error.message };
  }

  await supabase.rpc('sync_household_emails', { p_family_id: familyId });

  revalidatePath(`/trips/${tripId}`, 'layout');
  return { ok: "Saved. Your next trip will already know everyone." };
}

/**
 * Records which household people are coming on this trip.
 *
 * Deliberately narrow: it selects from the household rather than editing it.
 * Names, birth data and email addresses are entered once on /household — asking
 * for them again on every trip was the retyping the household exists to remove.
 *
 * Attendee rows carry a snapshot of name and birth data rather than only a
 * pointer, because other families read the headcount and giving every trip
 * member access to every household's records would be a far wider grant.
 */
export async function setTripAttendees(
  tripId: string,
  familyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personIds = formData.getAll('personId').map((v) => String(v));

  const supabase = await createClient();

  const { data: householdId, error: hhError } = await supabase.rpc('ensure_household');
  if (hhError) return { error: hhError.message };

  const { data: people, error: peopleError } = await supabase
    .from('household_people')
    .select('id, name, birth_year, birth_month')
    .eq('household_id', householdId);
  if (peopleError) return { error: peopleError.message };

  // Only ever accept ids that belong to the caller's own household.
  const chosen = (people ?? []).filter((p) => personIds.includes(p.id));

  await supabase.from('families').update({ household_id: householdId }).eq('id', familyId);

  const { error: delError } = await supabase
    .from('family_attendees')
    .delete()
    .eq('family_id', familyId);
  if (delError) return { error: delError.message };

  if (chosen.length > 0) {
    const { error } = await supabase.from('family_attendees').insert(
      chosen.map((p) => ({
        family_id: familyId,
        person_id: p.id,
        name: p.name,
        birth_month: p.birth_month,
        birth_year: p.birth_year,
      })),
    );
    if (error) return { error: error.message };
  }

  // Everyone with an address on the household can follow this trip.
  await supabase.rpc('sync_household_emails', { p_family_id: familyId });

  revalidatePath(`/trips/${tripId}`, 'layout');
  return {
    ok: chosen.length === 0 ? 'Nobody marked as coming yet.' : 'Saved.',
  };
}

/**
 * Families the caller has shared a trip with, for the invite picker.
 *
 * Returns only a display name and the emails they already had access to on that
 * shared trip — never the other household's people or birth data.
 */
export async function loadKnownFamilies(tripId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('known_families', { p_trip_id: tripId });
  if (error) {
    console.error('[known_families]', error.message);
    return [];
  }
  return (data ?? []).map((f) => ({
    householdId: f.household_id,
    name: f.name,
    emails: f.emails ?? [],
  }));
}

/**
 * The household's people, for prefilling a new trip.
 *
 * Anyone already on this trip is marked as coming; the rest are offered
 * unticked, so joining a trip is a matter of confirming rather than retyping.
 */
export async function loadHouseholdPeople(familyId: string) {
  const supabase = await createClient();

  const { data: householdId } = await supabase.rpc('ensure_household');
  if (!householdId) return [];

  const [{ data: people }, { data: attending }] = await Promise.all([
    supabase
      .from('household_people')
      .select('id, name, birth_year, birth_month, household_person_emails(email)')
      .eq('household_id', householdId)
      .order('birth_year', { ascending: true, nullsFirst: false }),
    supabase.from('family_attendees').select('person_id, name').eq('family_id', familyId),
  ]);

  const attendingIds = new Set((attending ?? []).map((a) => a.person_id).filter(Boolean));
  const attendingNames = new Set((attending ?? []).map((a) => (a.name ?? '').toLowerCase()));

  return (people ?? []).map((p) => ({
    personId: p.id,
    name: p.name,
    birthYear: p.birth_year,
    birthMonth: p.birth_month,
    emails: (p.household_person_emails ?? []).map((e) => e.email),
    // Match on name too, so attendees added before households existed still
    // show as coming rather than appearing to have been dropped.
    coming: attendingIds.has(p.id) || attendingNames.has(p.name.toLowerCase()),
  }));
}


/**
 * Redeems an invite token. Resolving the token needs the service-role client:
 * the recipient is by definition not a trip member yet, so RLS would hide the
 * row from them. Only the token itself is used as the lookup key.
 */
export async function acceptInvite(token: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=/invite/${token}`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
  if (error) throw new Error(error.message);

  redirect(`/trips/${data}`);
}

/**
 * Declines an invitation outright, without joining.
 *
 * Deliberately requires no sign-in: asking someone to create a session in order
 * to say "no thanks" is how you end up with no answer at all.
 */
export async function declineInvite(token: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('decline_invitation', { p_token: token });
  if (error) throw new Error(error.message);

  redirect(`/invite/${token}/decline?done=1`);
}

/** Read-only preview of what a token points at, for the pre-sign-in screen. */
export async function peekInvitation(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('invitations')
    .select('email, expires_at, accepted_at, trip_id, trips!invitations_trip_id_fkey(name, description), families!invitations_family_id_fkey(name)')
    .eq('token', token)
    .maybeSingle();
  return data;
}
