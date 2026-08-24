import Link from 'next/link';
import { acceptInvite, peekInvitation } from '@/actions/families';
import { SignInForm } from '@/components/SignInForm';
import { Button, Card, PageTitle } from '@/components/ui';
import { getUser } from '@/lib/supabase/server';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, user] = await Promise.all([peekInvitation(token), getUser()]);

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
        ) : new Date(invite.expires_at) < new Date() ? (
          <PageTitle
            title="That invite has expired"
            subtitle="Ask the organizer to send a fresh one — it only takes them a click."
          />
        ) : (
          <>
            <PageTitle
              title={`You're invited to ${invite.trips?.name ?? 'a trip'}`}
              subtitle={`Joining as the ${invite.families?.name ?? 'family'}. You'll help pick dates, then where to go, then where to stay.`}
            />

            {user ? (
              <form action={acceptInvite.bind(null, token)} className="space-y-3">
                <p className="text-sm text-muted">
                  Signed in as {user.email}. {user.email?.toLowerCase() !== invite.email.toLowerCase()
                    ? 'That is a different address than the invite was sent to — accepting will add this one to the family too.'
                    : ''}
                </p>
                <Button type="submit" className="w-full">
                  Join the trip
                </Button>
              </form>
            ) : (
              <SignInForm next={`/invite/${token}`} email={invite.email} />
            )}
          </>
        )}
      </Card>
    </main>
  );
}
