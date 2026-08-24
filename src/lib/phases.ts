import type { Database } from '@/types/db';

export type TripPhase = Database['public']['Enums']['trip_phase'];

export const PHASES: TripPhase[] = [
  'invites',
  'dates',
  'destination',
  'anchor',
  'lodging',
  'finalized',
];

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
  anchor: {
    label: 'What area',
    short: 'Area',
    blurb: 'Narrow to a spot and a radius to search around.',
    segment: 'anchor',
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
  return PHASES.indexOf(phase);
}

export function nextPhase(phase: TripPhase): TripPhase {
  return PHASES[Math.min(phaseIndex(phase) + 1, PHASES.length - 1)];
}

/** True once the trip has moved past `phase` — used to gate read-only views. */
export function isPhaseComplete(current: TripPhase, phase: TripPhase): boolean {
  return phaseIndex(current) > phaseIndex(phase);
}

export function phaseHref(tripId: string, phase: TripPhase): string {
  return `/trips/${tripId}/${PHASE_META[phase].segment}`;
}
