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
  const ages = formData.getAll('attendeeAge').map((v) => String(v).trim());

  const rows = names
    .map((name, i) => ({ name: name || null, age: ages[i] === '' ? null : Number(ages[i]) }))
    .filter((r) => r.name !== null || r.age !== null)
    .filter((r) => r.age === null || (Number.isFinite(r.age) && r.age >= 0 && r.age < 120));

  const supabase = await createClient();
  const { error: delError } = await supabase
    .from('family_attendees')
    .delete()
    .eq('family_id', familyId);
  if (delError) return { error: delError.message };

  if (rows.length > 0) {
    const { error } = await supabase
      .from('family_attendees')
      .insert(rows.map((r) => ({ ...r, family_id: familyId })));
    if (error) return { error: error.message };
  }

  revalidatePath(`/trips/${tripId}`, 'layout');
  return { ok: 'Saved.' };
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
