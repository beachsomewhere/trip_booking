'use client';

import { useState, useTransition } from 'react';
import { deleteTrip } from '@/actions/trips';
import { Button, Card, Input } from '@/components/ui';

/**
 * Deleting a trip is irreversible and takes everyone's votes with it, so it
 * asks you to type the trip's name rather than relying on a confirm dialog —
 * the kind of thing people click through without reading.
 */
export function DeleteTripButton({ tripId, tripName }: { tripId: string; tripName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, start] = useTransition();

  const matches = typed.trim().toLowerCase() === tripName.trim().toLowerCase();

  if (!open) {
    return (
      <Button variant="ghost" className="text-clay-600" onClick={() => setOpen(true)}>
        Delete this trip
      </Button>
    );
  }

  return (
    <Card className="space-y-3 border-clay-500/40">
      <div>
        <p className="font-medium text-text">Delete “{tripName}”?</p>
        <p className="text-sm text-muted">
          This removes the trip for every family, along with all dates, destinations, and
          shortlists. It cannot be undone.
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="block text-sm text-muted">
          Type <strong className="text-text">{tripName}</strong> to confirm
        </span>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={tripName}
          autoComplete="off"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          disabled={!matches || pending}
          onClick={() =>
            start(() => {
              void deleteTrip(tripId);
            })
          }
        >
          {pending ? 'Deleting…' : 'Delete permanently'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(false);
            setTyped('');
          }}
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}
