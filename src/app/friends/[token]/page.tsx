import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FriendRequestButtons } from '@/components/friends/FriendRequestButtons';
import { SignInForm } from '@/components/SignInForm';
import { Button, Card, PageTitle } from '@/components/ui';
import { createAdminClient, getUser } from '@/lib/supabase/server';

/**
 * Answering "would you like to be on our list".
 *
 * Read through the admin client for the same reason the invite page is: the
 * recipient may have no account at all yet, so RLS would hide from them the one
 * row that is addressed to them. Nothing is written here — accepting goes
 * through accept_friend(), which re-checks the address against the caller's own
 * session, so seeing this page grants nothing on its own.
 */
async function peekRequest(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('household_links')
    .select('to_email, status, expires_at, households!household_links_from_household_id_fkey(name)')
    .eq('token', token)
    .maybeSingle();
  return data;
}

export default async function FriendRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ manual?: string }>;
}) {
  const { token } = await params;
  const { manual } = await searchParams;
  const [link, user] = await Promise.all([peekRequest(token), getUser()]);

  const expired = link ? new Date(link.expires_at) < new Date() : false;
  const pending = Boolean(link) && !expired && link?.status === 'pending';
  const fromName = link?.households?.name ?? 'A family';

  // Signed out on a live request: mint a session from the token rather than
  // emailing a second link to an inbox they have just demonstrably read.
  if (!user && pending && !manual) {
    redirect(`/friends/${token}/start`);
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
        {!link ? (
          <>
            <PageTitle
              title="That link doesn't work"
              subtitle="It may have been withdrawn, or the address was cut off in an email. Ask them to send it again."
            />
            <Link href="/login">
              <Button variant="secondary">Sign in instead</Button>
            </Link>
          </>
        ) : expired ? (
          <PageTitle
            title="That request has expired"
            subtitle="Ask them to send a fresh one — it takes a click."
          />
        ) : link.status === 'accepted' ? (
          <>
            <PageTitle
              title={`You're already on ${fromName}'s list`}
              subtitle="Nothing more to do here."
            />
            <Link href="/trips">
              <Button>My trips</Button>
            </Link>
          </>
        ) : link.status === 'declined' ? (
          <PageTitle
            title="You've already said no to this"
            subtitle="They can ask again if it was a mistake."
          />
        ) : (
          <>
            <PageTitle
              title={`${fromName} would like to add you`}
              subtitle="This is not an invitation to a trip — nothing is being planned yet, and you are not agreeing to go anywhere."
            />

            <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-text">
              Saying yes puts your family on their list, so the next time they plan something you are
              one tap away instead of a retyped address. They&apos;ll see your family name and email
              address — nothing else. You can undo it at any time from Your family.
            </p>

            {user ? (
              <>
                <p className="text-sm text-muted">
                  Signed in as {user.email}.
                  {user.email?.toLowerCase() !== link.to_email.toLowerCase()
                    ? ` This request went to ${link.to_email} — sign in as that address to answer it.`
                    : ''}
                </p>
                {user.email?.toLowerCase() === link.to_email.toLowerCase() ? (
                  <FriendRequestButtons token={token} fromName={fromName} />
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm text-muted">We&apos;ll email you a link to sign in.</p>
                <SignInForm next={`/friends/${token}`} email={link.to_email} />
              </>
            )}
          </>
        )}
      </Card>
    </main>
  );
}
