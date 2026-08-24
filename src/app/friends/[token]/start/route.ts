import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Turns a friend-request token into a signed-in session, in one hop.
 *
 * Same reasoning as the trip-invite equivalent, and the same two constraints.
 *
 * It is a route handler, not render-time: `generateLink` invalidates any
 * previous token for that address, and a Server Component can render more than
 * once per request, so generating during render produced a token the next
 * render immediately superseded.
 *
 * And it only mints a session while the request is still unanswered — once
 * accepted or declined, a forwarded link is no longer a key to that account.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { origin } = new URL(request.url);
  const back = `${origin}/friends/${token}`;

  const admin = createAdminClient();

  const { data: link } = await admin
    .from('household_links')
    .select('to_email, status, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!link || link.status !== 'pending' || new Date(link.expires_at) < new Date()) {
    return NextResponse.redirect(back);
  }

  const email = link.to_email;

  let { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });

  // Someone who has never used the app has no auth user, and magiclink needs one.
  if (error) {
    await admin.auth.admin.createUser({ email, email_confirm: true });
    ({ data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email }));
  }

  // Use the type GoTrue says it issued, not an assumption. generate_link
  // auto-creates a user who has never signed in, and for an unconfirmed one it
  // mints a *signup* token rather than a magiclink token — verifying that as
  // "magiclink" fails with "Email link is invalid or has expired", which is
  // indistinguishable from a genuinely stale link.
  const hashedToken = data?.properties?.hashed_token;
  const otpType = data?.properties?.verification_type ?? 'magiclink';
  if (error || !hashedToken) {
    console.error('[friends/start] could not mint a session', error?.message);
    return NextResponse.redirect(`${back}?manual=1`);
  }

  return NextResponse.redirect(
    `${origin}/auth/callback?token_hash=${encodeURIComponent(
      hashedToken,
    )}&type=${encodeURIComponent(otpType)}&next=${encodeURIComponent(`/friends/${token}`)}`,
  );
}
