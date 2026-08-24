'use client';

import { useActionState, useState } from 'react';
import { addManualCandidate } from '@/actions/lodging';
import type { ActionState } from '@/actions/auth';
import { Button, Field, FormError, Input } from '@/components/ui';

/**
 * The Airbnb/VRBO path. Unfurling fills in what it can; when the site blocks
 * the fetch — which happens routinely — the fields stay editable rather than
 * the whole thing failing.
 */
export function PasteLinkForm({ tripId }: { tripId: string }) {
  const [url, setUrl] = useState('');
  const [looking, setLooking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [prefill, setPrefill] = useState<{
    name: string;
    photoUrl: string;
    address: string;
    description: string;
    capacity: string;
    bedrooms: string;
    price: string;
  } | null>(null);

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const r = await addManualCandidate(tripId, prev, fd);
      if (r.ok) {
        setUrl('');
        setPrefill(null);
        setBlocked(false);
      }
      return r;
    },
    {},
  );

  async function unfurl() {
    if (!url.trim()) return;
    setLooking(true);
    setBlocked(false);
    try {
      const res = await fetch('/api/unfurl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      setBlocked(Boolean(json.blocked));
      setPrefill({
        name: json.title ?? '',
        photoUrl: json.image ?? '',
        address: json.address ?? json.siteName ?? '',
        description: json.description ?? '',
        capacity: json.capacity ?? '',
        bedrooms: json.bedrooms ?? '',
        price: json.price ?? '',
      });
    } catch {
      setBlocked(true);
      setPrefill({
        name: '',
        photoUrl: '',
        address: '',
        description: '',
        capacity: '',
        bedrooms: '',
        price: '',
      });
    } finally {
      setLooking(false);
    }
  }

  return (
    <form action={action} className="space-y-4">
      <Field
        label="Paste a link"
        hint="Airbnb, VRBO, Booking, a hotel's own site — anything with a URL."
      >
        <div className="flex gap-2">
          {/* Width on the wrapper, not the input — see AttendeeEditor. */}
          <div className="flex-1">
            <Input
              name="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={unfurl}
              placeholder="https://www.airbnb.com/rooms/…"
            />
          </div>
          <Button type="button" variant="secondary" onClick={unfurl} disabled={looking || !url}>
            {looking ? 'Reading…' : 'Read it'}
          </Button>
        </div>
      </Field>

      {prefill ? (
        <>
          {blocked ? (
            <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-600">
              That site blocked us from reading the page — Airbnb and VRBO often do. Fill in what you
              can and the card works exactly the same for everyone else.
            </p>
          ) : null}

          {/* Everything the page gave up, pre-filled and still editable. What
              the reader of this card knows is exactly what is typed here. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input name="name" defaultValue={prefill.name} required maxLength={160} />
            </Field>
            <Field label="Sleeps how many?" hint="The one thing no site reports reliably.">
              <Input
                name="capacityNote"
                defaultValue={prefill.capacity}
                placeholder="Sleeps 10"
                maxLength={120}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bedrooms">
              <Input
                name="bedrooms"
                defaultValue={prefill.bedrooms}
                placeholder="4 bedrooms"
                maxLength={120}
              />
            </Field>
            <Field label="Rough price" hint="Helps others compare at a glance.">
              <Input
                name="priceNote"
                defaultValue={prefill.price}
                placeholder="$540/night"
                maxLength={120}
              />
            </Field>
          </div>
          <Field label="Where">
            <Input name="address" defaultValue={prefill.address} maxLength={240} />
          </Field>
          <Field label="What is it?" hint="A line or two so nobody has to open the link.">
            <Input
              name="description"
              defaultValue={prefill.description.slice(0, 280)}
              maxLength={280}
            />
          </Field>
          <input type="hidden" name="photoUrl" value={prefill.photoUrl} />
        </>
      ) : null}

      <FormError message={state.error} />
      {state.ok ? <p className="text-sm text-moss-600">{state.ok}</p> : null}

      <Button type="submit" disabled={pending || !prefill}>
        {pending ? 'Adding…' : 'Add to the list'}
      </Button>
    </form>
  );
}
