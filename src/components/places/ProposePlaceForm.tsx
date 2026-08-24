'use client';

import { useActionState, useState } from 'react';
import { proposeDestination } from '@/actions/proposals';
import { PlaceAutocomplete, type SelectedPlace } from '@/components/places/PlaceAutocomplete';
import type { ActionState } from '@/actions/auth';
import { Button, Field, FormError, Textarea } from '@/components/ui';

/** Suggests a destination for the group to vote on. */
export function ProposePlaceForm({ tripId }: { tripId: string }) {
  const [place, setPlace] = useState<SelectedPlace | null>(null);

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await proposeDestination(tripId, prev, fd);
      if (result.ok) setPlace(null);
      return result;
    },
    {},
  );

  // Coordinates are optional — a group can name a place without Google Places
  // configured — but they are what lets the lodging step search nearby.
  const missingCoords = place !== null && place.lat === undefined;

  return (
    <form action={action} className="space-y-4">
      <PlaceAutocomplete
        label="Where should we go?"
        hint="A resort, an island, a city. Whatever the group would say out loud."
        placeholder="Keystone Ski Resort"
        value={place}
        onSelect={setPlace}
      />

      {place ? (
        <>
          <input type="hidden" name="name" value={place.name} />
          <input type="hidden" name="placeId" value={place.placeId ?? ''} />
          <input type="hidden" name="address" value={place.address ?? ''} />
          <input type="hidden" name="lat" value={place.lat ?? ''} />
          <input type="hidden" name="lng" value={place.lng ?? ''} />
          <input type="hidden" name="photoUrl" value={place.photoUrl ?? ''} />
        </>
      ) : null}


      <Field label="Why here?" hint="One line. It's what other families read before voting.">
        <Textarea name="note" maxLength={280} placeholder="Ski-in, ski-out and there's a pool." />
      </Field>

      {missingCoords ? (
        <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-600">
          No map pin for this one, so the app won&apos;t be able to suggest nearby places later.
          The group can still agree on it and add places by hand.
        </p>
      ) : null}

      <FormError message={state.error} />
      {state.ok ? <p className="text-sm text-moss-600">{state.ok}</p> : null}

      <Button type="submit" disabled={pending || !place}>
        {pending ? 'Adding…' : place ? `Suggest ${place.name}` : 'Pick a place first'}
      </Button>
    </form>
  );
}
