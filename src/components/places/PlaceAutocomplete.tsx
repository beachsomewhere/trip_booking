'use client';

import { useEffect, useRef, useState } from 'react';
import { Field, Input, cx } from '@/components/ui';

export interface SelectedPlace {
  name: string;
  placeId?: string;
  address?: string;
  lat?: number;
  lng?: number;
  photoUrl?: string;
}

interface Suggestion {
  placeId: string;
  primary: string;
  secondary: string;
}

/**
 * Place search backed by Google Places, with a working fallback.
 *
 * When Places is not configured the field degrades to plain text rather than
 * breaking: a group can still name "Keystone" and vote on it, they just do not
 * get a pin or a photo. That keeps the app usable before anyone has set up a
 * GCP project, which is otherwise a hard blocker on three of the five phases.
 */
export function PlaceAutocomplete({
  label,
  hint,
  placeholder,
  onSelect,
  value,
  requireCoords = false,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  onSelect: (place: SelectedPlace | null) => void;
  value: SelectedPlace | null;
  requireCoords?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Suggestions are only meaningful for a query long enough to have produced
  // them; deriving that rather than clearing state in the effect avoids a
  // cascading render on every keystroke.
  const visible = query.trim().length < 2 ? [] : suggestions;

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        setConfigured(json.configured ?? false);
        setSuggestions(json.suggestions ?? []);
        setOpen(true);
      } catch {
        /* aborted or offline — the fallback field still works */
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function choose(s: Suggestion) {
    setOpen(false);
    setQuery('');
    onSelect({ name: s.primary, placeId: s.placeId, address: s.secondary });

    try {
      const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(s.placeId)}`);
      if (!res.ok) return;
      const d = await res.json();
      onSelect({
        name: d.name ?? s.primary,
        placeId: d.placeId ?? s.placeId,
        address: d.address ?? s.secondary,
        lat: d.lat ?? undefined,
        lng: d.lng ?? undefined,
        photoUrl: d.photoUrl ?? undefined,
      });
    } catch {
      /* keep the prediction-level selection */
    }
  }

  if (value) {
    return (
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-text">{label}</span>
        <div className="flex items-start justify-between gap-3 rounded-lg border border-edge bg-surface-2 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-text">{value.name}</p>
            {value.address ? <p className="truncate text-sm text-muted">{value.address}</p> : null}
            {requireCoords && value.lat === undefined ? (
              <p className="text-xs text-clay-600">
                No map pin for this one — searching nearby places needs coordinates.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="shrink-0 text-sm text-muted underline"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <Field
        label={label}
        hint={
          configured === false
            ? 'Place search is off on this deployment — type a name and the group can still vote on it.'
            : hint
        }
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (visible.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
        />
      </Field>

      {open && visible.length > 0 ? (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-edge bg-surface shadow-lg">
          {visible.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => choose(s)}
                className={cx(
                  'block w-full px-3 py-2 text-left hover:bg-surface-2',
                  'border-b border-edge last:border-0',
                )}
              >
                <span className="block text-sm font-medium text-text">{s.primary}</span>
                {s.secondary ? (
                  <span className="block text-xs text-muted">{s.secondary}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* No API key: let them commit whatever they typed. */}
      {configured === false && query.trim().length > 1 ? (
        <button
          type="button"
          onClick={() => {
            onSelect({ name: query.trim() });
            setQuery('');
          }}
          className="mt-2 text-sm font-medium text-accent"
        >
          Use “{query.trim()}”
        </button>
      ) : null}

      {loading ? <p className="mt-1 text-xs text-muted">Searching…</p> : null}
    </div>
  );
}
