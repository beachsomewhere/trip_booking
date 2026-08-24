import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/SignInForm';
import { Card, FormError, PageTitle } from '@/components/ui';
import { getUser } from '@/lib/supabase/server';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; email?: string }>;
}) {
  const { next, error, email } = await searchParams;
  const user = await getUser();
  if (user && !next) redirect('/trips');

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <Link
        href="/"
        className="mb-8 block font-[family-name:var(--font-display)] text-lg font-semibold"
      >
        Lock the Trip
      </Link>
      <Card className="space-y-5">
        <PageTitle title="Sign in" subtitle="Use the email address your invite was sent to." />
        <FormError message={error} />
        <SignInForm next={next ?? '/trips'} email={email} />
      </Card>
    </main>
  );
}
