import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Turns an invitation token into a signed-in session, in one hop.
 *
 * This lives in a route handler rather than in the invite page's render on
 * purpose. Minting a link is a side effect: `generateLink` invalidates any
 * previous token for that address, and a Server Component can render more than
 * once per request — so generating during render produced a token that a second
 * render immediately superseded, and the redirect carried a dead one. Route
 * handlers run exactly once.
 *
 * The `token_hash` form is used rather than PKCE's `?code=` because there is no
 * verifier cookie: nothing about this flow started in the browser.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { origin } = new URL(request.url);
  const back = `${origin}/invite/${token}`;

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from('invitations')
    .select('email, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle();

  // Only unredeemed, unexpired invitations can mint a session. Once accepted,
  // a forwarded link is no longer a key to anybody's account.
  if (!invite || invite.accepted_at || new Date(invite.expires_at) < new Date()) {
    return NextResponse.redirect(back);
  }

  const email = invite.email;

  let { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });

  // A first-time invitee has no auth user yet, and magiclink requires one.
  if (error) {
    await admin.auth.admin.createUser({ email, email_confirm: true });
    ({ data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email }));
  }

  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) {
    console.error('[invite/start] could not mint a session', error?.message);
    // The invite page still offers the ordinary emailed sign-in.
    return NextResponse.redirect(`${back}?manual=1`);
  }

  return NextResponse.redirect(
    `${origin}/auth/callback?token_hash=${encodeURIComponent(
      hashedToken,
    )}&type=magiclink&next=${encodeURIComponent(`/invite/${token}`)}`,
  );
}
