import type { Database } from '@/types/db';

export type TripPhase = Database['public']['Enums']['trip_phase'];

/**
 * The steps the app actually walks through.
 *
 * `anchor` (pick a point and a radius) was removed: by the time a group has
 * agreed on a destination they are ready to look at places, and asking them to
 * quantify a search radius was busywork. Where people want to stay is now
 * expressed by the places they put forward in the lodging step.
 *
 * The enum value survives in the database — dropping one means rewriting every
 * dependent column — so `normalizePhase` maps it forward for any trip that was
 * mid-flight when this changed.
 */
export const PHASES: TripPhase[] = ['invites', 'dates', 'destination', 'lodging', 'finalized'];

export function normalizePhase(phase: TripPhase): TripPhase {
  return phase === 'anchor' ? 'lodging' : phase;
}

export const PHASE_META: Record<
  TripPhase,
  { label: string; short: string; blurb: string; segment: string }
> = {
  invites: {
    label: 'Who is coming',
    short: 'Who',
    blurb: 'Invite families and lock the guest list.',
    segment: 'families',
  },
  dates: {
    label: 'When',
    short: 'When',
    blurb: 'Propose dates that work; agree on one window.',
    segment: 'dates',
  },
  destination: {
    label: 'Where',
    short: 'Where',
    blurb: 'Pick the destination — a resort, an island, a city.',
    segment: 'destination',
  },
  // Retired. Kept so the record type stays exhaustive over the DB enum, and so
  // an old link still resolves somewhere sensible.
  anchor: {
    label: 'Where to stay',
    short: 'Stay',
    blurb: 'Shortlist places and pick the units.',
    segment: 'lodging',
  },
  lodging: {
    label: 'Where to stay',
    short: 'Stay',
    blurb: 'Shortlist places and pick the units.',
    segment: 'lodging',
  },
  finalized: {
    label: 'Locked in',
    short: 'Done',
    blurb: 'Dates, destination, and rooms are settled.',
    segment: 'summary',
  },
};

export function phaseIndex(phase: TripPhase): number {
  return PHASES.indexOf(normalizePhase(phase));
}

export function nextPhase(phase: TripPhase): TripPhase {
  return PHASES[Math.min(phaseIndex(phase) + 1, PHASES.length - 1)];
}

/** True once the trip has moved past `phase` — used to gate read-only views. */
export function isPhaseComplete(current: TripPhase, phase: TripPhase): boolean {
  return phaseIndex(current) > phaseIndex(phase);
}

export function phaseHref(tripId: string, phase: TripPhase): string {
  return `/trips/${tripId}/${PHASE_META[normalizePhase(phase)].segment}`;
}
