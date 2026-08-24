import Link from 'next/link';
import { declineInvite, peekInvitation } from '@/actions/families';
import { Button, Card, PageTitle } from '@/components/ui';

/**
 * Declining from the invite email.
 *
 * This is a page with a button, not a link that acts on load. Mail clients and
 * corporate scanners routinely fetch every URL in a message to check it is
 * safe; a bare GET that declined would have families dropped off trips they
 * never even opened.
 */
export default async function DeclinePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;
  const invite = await peekInvitation(token);

  const tripName = invite?.trips?.name ?? 'this trip';

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <Link
        href="/"
        className="mb-8 block font-[family-name:var(--font-display)] text-lg font-semibold"
      >
        Lock the Trip
      </Link>

      <Card className="space-y-5">
        {done ? (
          <PageTitle
            title="Thanks — we've let them know"
            subtitle={`${tripName} will carry on without you, and the group can see you've declined so nobody chases you about it.`}
          />
        ) : !invite ? (
          <PageTitle
            title="That link doesn't work"
            subtitle="It may have been withdrawn. Nothing has been changed."
          />
        ) : (
          <>
            <PageTitle
              title={`Not coming to ${tripName}?`}
              subtitle="The other families will see that you've declined, so they can plan around you and stop waiting."
            />

            <form action={declineInvite.bind(null, token)} className="space-y-3">
              <Button type="submit" variant="danger" className="w-full">
                Yes, count us out
              </Button>
            </form>

            <Link href={`/invite/${token}`} className="block text-center text-sm text-accent">
              Actually, we&apos;re in — join the trip
            </Link>
          </>
        )}
      </Card>
    </main>
  );
}
