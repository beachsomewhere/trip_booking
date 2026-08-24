'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient, createClient, getUser } from '@/lib/supabase/server';
import { sendInviteEmail } from '@/lib/email/invites';
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
    supabase.from('trips').select('name, organizer_user_id').eq('id', tripId).maybeSingle(),
    supabase
      .from('invitations')
      .select('id, email, token, family_id, families!invitations_family_id_fkey(name)')
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
      fromFamily: inv.families?.name ?? 'organizer',
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

/**
 * Proposes adding a family once the roster is locked. Nothing is emailed until
 * every active family approves — the spec's "do you agree to this addition".
 */
export async function proposeFamily(
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
  const { error } = await supabase.rpc('propose_family', {
    p_trip_id: tripId,
    p_name: parsedName.data.name,
    p_emails: parsedEmails.data,
    p_adults: Number(formData.get('adults') ?? 0) || 0,
    p_children: Number(formData.get('children') ?? 0) || 0,
    p_note: (formData.get('note') as string) || undefined,
  });
  if (error) return { error: error.message };

  revalidatePath(`/trips/${tripId}/families`);
  return { ok: `Proposed ${parsedName.data.name}. The other families need to approve before an invite goes out.` };
}

export async function voteFamilyProposal(tripId: string, proposalId: string, approve: boolean) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('vote_family_proposal', {
    p_proposal_id: proposalId,
    p_approve: approve,
  });
  if (error) throw new Error(error.message);

  // Unanimous approval created the family and its invitation rows; send them.
  if (data === 'approved') await flushInvitations(tripId);

  revalidatePath(`/trips/${tripId}/families`);
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
 * Replaces a family's attendee list. Ages are what make the lodging phase
 * meaningful — "sleeps 8" means something different with four toddlers.
 */
export async function saveAttendees(
  tripId: string,
  familyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const names = formData.getAll('attendeeName').map((v) => String(v).trim());
  const months = formData.getAll('birthMonth').map((v) => String(v).trim());
  const years = formData.getAll('birthYear').map((v) => String(v).trim());
  const personIds = formData.getAll('personId').map((v) => String(v).trim());
  const emailLists = formData.getAll('personEmails').map((v) => String(v));
  const coming = formData.getAll('coming').map((v) => String(v) === '1');

  const num = (v: string) => (v === '' ? null : Number(v));

  const people = names
    .map((name, i) => ({
      name,
      birth_month: num(months[i] ?? ''),
      birth_year: num(years[i] ?? ''),
      person_id: personIds[i] || null,
      emails: [
        ...new Set(
          (emailLists[i] ?? '')
            .split(/[\s,;]+/)
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean),
        ),
      ],
      coming: coming[i] ?? true,
    }))
    .filter((p) => p.name.length > 0);

  const supabase = await createClient();

  // The household is the durable record: it keeps everyone, including people
  // sitting this trip out, so the next trip still knows about them.
  const { data: householdId, error: hhError } = await supabase.rpc('ensure_household');
  if (hhError) return { error: hhError.message };

  const saved: { person: (typeof people)[number]; id: string | null }[] = [];

  for (const person of people) {
    const payload = {
      household_id: householdId,
      name: person.name,
      birth_month: person.birth_month,
      birth_year: person.birth_year,
    };

    if (person.person_id) {
      const { error } = await supabase
        .from('household_people')
        .update(payload)
        .eq('id', person.person_id);
      if (error) return { error: error.message };
      saved.push({ person, id: person.person_id });
    } else {
      const { data, error } = await supabase
        .from('household_people')
        .insert(payload)
        .select('id')
        .single();
      if (error) return { error: error.message };
      saved.push({ person, id: data?.id ?? null });
    }
  }

  // Addresses belong to people; replace them wholesale so a removal sticks.
  for (const s2 of saved) {
    if (!s2.id) continue;
    await supabase.from('household_person_emails').delete().eq('person_id', s2.id);
    if (s2.person.emails.length > 0) {
      await supabase
        .from('household_person_emails')
        .insert(s2.person.emails.map((email) => ({ person_id: s2.id!, email })));
    }
  }

  // Make sure this trip's family is attached to the household, so a future
  // visit prefills from it, then pull everyone's addresses onto this trip.
  await supabase.from('families').update({ household_id: householdId }).eq('id', familyId);
  await supabase.rpc('sync_household_emails', { p_family_id: familyId });

  // Attendees are replaced wholesale — only the people marked as coming, with a
  // snapshot of their birth data so other families can read the headcount
  // without access to this household's records.
  const { error: delError } = await supabase
    .from('family_attendees')
    .delete()
    .eq('family_id', familyId);
  if (delError) return { error: delError.message };

  const attending = saved.filter((s) => s.person.coming);
  if (attending.length > 0) {
    const { error } = await supabase.from('family_attendees').insert(
      attending.map((s) => ({
        family_id: familyId,
        person_id: s.id,
        name: s.person.name,
        birth_month: s.person.birth_month,
        birth_year: s.person.birth_year,
      })),
    );
    if (error) return { error: error.message };
  }

  revalidatePath(`/trips/${tripId}`, 'layout');
  return {
    ok: `Saved. We'll remember ${people.length === 1 ? 'them' : 'everyone'} for your next trip.`,
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
    birthYear: p.birth_year == null ? '' : String(p.birth_year),
    birthMonth: p.birth_month == null ? '' : String(p.birth_month),
    emails: (p.household_person_emails ?? []).map((e) => e.email).join(', '),
    // Match on name too, so attendees added before households existed still
    // show as coming rather than appearing to have been dropped.
    coming: attendingIds.has(p.id) || attendingNames.has(p.name.toLowerCase()),
  }));
}

/** Adds a second email (a spouse) to your own family. */
export async function addFamilyEmail(
  tripId: string,
  familyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get('email'));
  if (!email.success) return { error: 'That does not look like an email address.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('family_members')
    .insert({ family_id: familyId, email: email.data });
  if (error) {
    return { error: error.code === '23505' ? 'That email is already on your family.' : error.message };
  }

  revalidatePath(`/trips/${tripId}/families`);
  return { ok: `${email.data} can now sign in with their own email.` };
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

/** Read-only preview of what a token points at, for the pre-sign-in screen. */
export async function peekInvitation(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('invitations')
    .select('email, expires_at, accepted_at, trip_id, trips!invitations_trip_id_fkey(name), families!invitations_family_id_fkey(name)')
    .eq('token', token)
    .maybeSingle();
  return data;
}
