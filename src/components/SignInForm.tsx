'use client';

import { useActionState } from 'react';
import { sendMagicLink, type ActionState } from '@/actions/auth';
import { Button, Field, FormError, Input } from '@/components/ui';

export function SignInForm({ next = '/trips', email }: { next?: string; email?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendMagicLink, {});

  if (state.ok) {
    return (
      <div className="rounded-lg bg-moss-100 px-4 py-3 text-sm text-moss-600">
        {state.ok} The link opens straight into the trip.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" hint="No password. We email you a link that signs you in.">
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={email}
          placeholder="you@example.com"
        />
      </Field>
      <FormError message={state.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Sending…' : 'Email me a sign-in link'}
      </Button>
    </form>
  );
}
