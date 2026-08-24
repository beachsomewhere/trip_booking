'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/env';

export interface ActionState {
  error?: string;
  ok?: string;
}

const emailSchema = z.string().trim().toLowerCase().email('That does not look like an email address.');

/**
 * Sends a magic link. Everyone arrives here from an emailed invite, so there is
 * no password to forget and no account to create — the email IS the identity,
 * which is also what lets us match a signed-in user to the family they were
 * invited as.
 */
export async function sendMagicLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const next = String(formData.get('next') ?? '/trips');
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      // The `?next=` matters beyond routing: the magic-link template builds its
      // link as `{{ .RedirectTo }}&token_hash=...`, so this URL must always
      // carry a query string. See supabase/templates/magic_link.html.
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { error: error.message };
  return { ok: `Check ${parsed.data} for a sign-in link.` };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
