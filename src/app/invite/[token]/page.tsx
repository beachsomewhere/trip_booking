import Link from 'next/link';
import { redirect } from 'next/navigation';
import { acceptInvite, peekInvitation } from '@/actions/families';
import { SignInForm } from '@/components/SignInForm';
import { Button, Card, PageTitle } from '@/components/ui';
import { getUser } from '@/lib/supabase/server';

/**
 * Redeeming an invitation.
 *
 * Clicking the link in the invite email signs you in and joins you in one step.
 * The old flow made you prove you owned an inbox you had just demonstrably read,
 * by emailing you a second link — two round trips through email to join a trip.
 *
 * The trade-off is deliberate and bounded: the token is 256 bits of randomness
 * delivered to that address, so holding it is already equivalent to reading the
 * inbox. To stop a forwarded or screenshotted link from being a standing key to
 * someone's account, auto-sign-in only happens while the invitation is still
 * unaccepted. Once redeemed, the link no longer grants a session and anyone
 * following it gets the ordinary sign-in form.
 */
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ manual?: string }>;
}) {
  const { token } = await params;
  const { manual } = await searchParams;
  const [invite, user] = await Promise.all([peekInvitation(token), getUser()]);

  const expired = invite ? new Date(invite.expires_at) < new Date() : false;
  const usable = Boolean(invite) && !expired;

  // Already signed in as the invited address, and this invite is unredeemed:
  // nothing left to ask. Join and go.
  if (user && invite && usable && !invite.accepted_at) {
    if (user.email?.toLowerCase() === invite.email.toLowerCase()) {
      await acceptInvite(token);
    }
  }

  // Signed out: hand off to the route handler, which mints a session from the
  // token itself rather than emailing a second link. `manual` means that
  // already failed, so fall through to the ordinary sign-in form.
  if (!user && invite && usable && !invite.accepted_at && !manual) {
    redirect(`/invite/${token}/start`);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <Link
        href="/"
        className="mb-8 block font-[family-name:var(--font-display)] text-lg font-semibold"
      >
        Lock the Trip
      </Link>

      <Card className="space-y-5">
        {!invite ? (
          <>
            <PageTitle
              title="That link doesn't work"
              subtitle="It may have been withdrawn, or the address was cut off in an email. Ask whoever invited you to resend it."
            />
            <Link href="/login">
              <Button variant="secondary">Sign in instead</Button>
            </Link>
          </>
        ) : expired ? (
          <PageTitle
            title="That invite has expired"
            subtitle="Ask the organizer to send a fresh one — it only takes them a click."
          />
        ) : (
          <>
            <PageTitle
              title={`You're invited to ${invite.trips?.name ?? 'a trip'}`}
              subtitle={`Joining as ${invite.families?.name ?? 'a family'}. You'll help pick dates, then where to go, then where to stay.`}
            />

            {/* What the trip actually is — adults only, whole families — which
                is what decides whether a family says yes, and who they bring. */}
            {invite.trips?.description ? (
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-text">
                {invite.trips.description}
              </p>
            ) : null}

            {user ? (
              <form action={acceptInvite.bind(null, token)} className="space-y-3">
                <p className="text-sm text-muted">
                  Signed in as {user.email}.{' '}
                  {user.email?.toLowerCase() !== invite.email.toLowerCase()
                    ? 'That is a different address than the invite was sent to — joining will add this one to the family too.'
                    : ''}
                </p>
                <Button type="submit" className="w-full">
                  Join the trip
                </Button>
              </form>
            ) : (
              <>
                <p className="text-sm text-muted">
                  We&apos;ll email you a link to sign in.
                </p>
                <SignInForm next={`/invite/${token}`} email={invite.email} />
              </>
            )}
          </>
        )}
      </Card>
    </main>
  );
}
