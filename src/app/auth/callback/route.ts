import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Completes a magic-link sign-in.
 *
 * Two link shapes arrive here: the PKCE `?code=` form and the
 * `?token_hash=&type=` form. Both are handled, but they are not equally good.
 *
 * PKCE binds the link to the browser that asked for it, via a code verifier in
 * that browser's cookies. Ask on a laptop and open the email on a phone and
 * there is no verifier, so sign-in fails — correctly, but for a reason nobody
 * can act on. supabase/templates/magic_link.html therefore sends a token hash
 * instead, which needs no verifier and works from any device.
 */

/** Turns SDK diagnostics into something the person reading it can act on. */
function humanReadable(message: string): string {
  if (/code verifier/i.test(message)) {
    return 'That link has to be opened in the same browser that asked for it. Enter your address and we\u2019ll send a fresh one.';
  }
  if (/expired|invalid/i.test(message)) {
    return 'That sign-in link has expired or was already used. Ask for a new one.';
  }
  return message;
}
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get('next') ?? '/trips';
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error('[auth/callback] code exchange failed', error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(humanReadable(error.message))}&next=${encodeURIComponent(next)}`,
    );
  }

  // A token hash with no type is a magic link; nothing else omits it.
  if (tokenHash && !type) {
    const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(humanReadable(error.message))}&next=${encodeURIComponent(next)}`,
    );
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error('[auth/callback] otp verification failed', error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(humanReadable(error.message))}&next=${encodeURIComponent(next)}`,
    );
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('That sign-in link was incomplete. Request a new one.')}`,
  );
}
