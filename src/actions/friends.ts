'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, getUser } from '@/lib/supabase/server';
import { sendFriendEmail, friendUrl } from '@/lib/email/friends';
import type { ActionState } from '@/actions/auth';

/**
 * The circle of families you travel with, kept between trips.
 *
 * Every one of these returns its failure rather than throwing it. They are
 * called from buttons inside transitions, where a thrown server action is
 * swallowed silently and the click simply appears to do nothing.
 */

function revalidateEverywhere() {
  // The pending banner is on both, and the picker reads the same list.
  revalidatePath('/household');
  revalidatePath('/trips', 'layout');
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('That does not look like an email address.');

export async function requestFriend(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(String(formData.get('email') ?? ''));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await getUser();
  if (!user) return { error: 'Not signed in.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('request_friend', { p_email: parsed.data });
  if (error) return { error: error.message };

  const link = Array.isArray(data) ? data[0] : data;
  if (!link?.link_token) return { error: 'Could not create that request.' };

  // Who is asking, in their own words — the household's name, not an email.
  const { data: household } = await supabase.rpc('ensure_household', {});
  const { data: me } = await supabase
    .from('households')
    .select('name')
    .eq('id', household as string)
    .maybeSingle();

  const { delivered } = await sendFriendEmail({
    to: parsed.data,
    token: link.link_token,
    fromName: me?.name ?? 'A family',
    fromEmail: user.email,
  });

  revalidateEverywhere();

  // A missing mail key must never silently lose a request, so hand back the
  // link instead of claiming it was sent.
  return delivered
    ? { ok: `Asked ${parsed.data}. They'll show up here once they say yes.` }
    : { ok: `Couldn't send the email. Pass this on instead: ${friendUrl(link.link_token)}` };
}

export async function acceptFriend(token: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('accept_friend', { p_token: token });
  if (error) return { error: error.message };
  revalidateEverywhere();
  return {};
}

export async function declineFriend(token: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('decline_friend', { p_token: token });
  if (error) return { error: error.message };
  revalidateEverywhere();
  return {};
}

/** Unlinks an accepted friend, or cancels a request you sent. */
export async function removeFriend(linkId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_friend', { p_link_id: linkId });
  if (error) return { error: error.message };
  revalidateEverywhere();
  return {};
}

export interface Friend {
  linkId: string;
  householdId: string | null;
  name: string;
  emails: string[];
}

export async function loadFriends(): Promise<Friend[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_friends');
  if (error) {
    console.error('[my_friends]', error.message);
    return [];
  }
  return (data ?? []).map((f) => ({
    linkId: f.link_id,
    householdId: f.household_id,
    name: f.name,
    emails: f.emails ?? [],
  }));
}

export interface PendingRequest {
  linkId: string;
  token: string;
  fromName: string;
}

export async function loadPendingFriendRequests(): Promise<PendingRequest[]> {
  const user = await getUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pending_friend_requests');
  if (error) {
    console.error('[pending_friend_requests]', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    linkId: r.link_id,
    token: r.token,
    fromName: r.from_name,
  }));
}

export interface SentRequest {
  linkId: string;
  email: string;
  url: string;
}

export async function loadSentFriendRequests(): Promise<SentRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('sent_friend_requests');
  if (error) {
    console.error('[sent_friend_requests]', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    linkId: r.link_id,
    email: r.to_email,
    url: friendUrl(r.token),
  }));
}
