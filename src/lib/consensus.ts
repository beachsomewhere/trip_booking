/**
 * Vote tallying and consensus, as pure functions.
 *
 * Phases 2-5 all reduce to the same question — "have enough families weighed in,
 * and is there a front-runner?" — so the arithmetic lives here once, with no I/O
 * and no Supabase types. Server actions and UI both call it, which is what keeps
 * the progress bar and the organizer's "ready to advance" prompt from disagreeing.
 */

import type { Database } from '@/types/db';

export type VoteChoice = Database['public']['Enums']['vote_choice'];
export type FamilyStatus = Database['public']['Enums']['family_status'];

export interface MinimalFamily {
  id: string;
  name: string;
  status: FamilyStatus;
}

export interface MinimalProposal {
  id: string;
  family_id: string;
  withdrawn_at?: string | null;
}

export interface MinimalVote {
  proposal_id: string;
  family_id: string;
  choice: VoteChoice;
}

export interface Tally {
  proposalId: string;
  yes: number;
  maybe: number;
  no: number;
  /**
   * Who voted each way, in roster order.
   *
   * Counts alone were not enough: "1 can't" told you a problem existed without
   * telling you whose, which is the one thing you need in order to act on it.
   */
  yesFamilyIds: string[];
  maybeFamilyIds: string[];
  noFamilyIds: string[];
  /**
   * Ranking score. A `yes` is worth two `maybe`s: a trip where everyone is
   * lukewarm should lose to one where half the group is enthusiastic and the
   * rest are fine with it, which is how these decisions actually get made.
   */
  score: number;
}

/** Families whose opinion counts. Opted-out and removed families do not vote. */
export function votingFamilies(families: MinimalFamily[]): MinimalFamily[] {
  return families.filter((f) => f.status === 'active');
}

/** Proposals still on the table. */
export function liveProposals<T extends MinimalProposal>(proposals: T[]): T[] {
  return proposals.filter((p) => !p.withdrawn_at);
}

export function tally(
  proposals: MinimalProposal[],
  votes: MinimalVote[],
  families: MinimalFamily[] = [],
): Map<string, Tally> {
  const voting = new Set(votingFamilies(families).map((f) => f.id));
  const countsFor = (id: string): Tally => ({
    proposalId: id,
    yes: 0,
    maybe: 0,
    no: 0,
    yesFamilyIds: [],
    maybeFamilyIds: [],
    noFamilyIds: [],
    score: 0,
  });

  const result = new Map<string, Tally>();
  for (const p of proposals) result.set(p.id, countsFor(p.id));

  for (const v of votes) {
    const t = result.get(v.proposal_id);
    if (!t) continue;
    // When a roster was supplied, ignore votes from families that have since
    // opted out — otherwise a departed family keeps steering the group.
    if (families.length > 0 && !voting.has(v.family_id)) continue;

    t[v.choice] += 1;
    if (v.choice === 'yes') t.yesFamilyIds.push(v.family_id);
    else if (v.choice === 'maybe') t.maybeFamilyIds.push(v.family_id);
    else t.noFamilyIds.push(v.family_id);
  }

  for (const t of result.values()) t.score = t.yes * 2 + t.maybe;
  return result;
}

/**
 * The front-runner, or null when there is no clear one.
 *
 * Returns null on an exact tie rather than picking arbitrarily — a tie is
 * information the organizer needs, not a coin flip the app should hide.
 */
export function leader(
  proposals: MinimalProposal[],
  votes: MinimalVote[],
  families: MinimalFamily[] = [],
): { proposalId: string; tally: Tally } | null {
  const live = liveProposals(proposals);
  if (live.length === 0) return null;

  const tallies = tally(live, votes, families);
  const ranked = [...tallies.values()].sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return null;
  if (ranked[0].score === 0) return null;
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;

  return { proposalId: ranked[0].proposalId, tally: ranked[0] };
}

/**
 * Families that have engaged with this phase at all — by proposing something or
 * by voting on someone else's proposal. This is what the "3 of 4 families are
 * in" progress line counts, and what the organizer's nudge is based on.
 */
export function respondedFamilyIds(
  proposals: MinimalProposal[],
  votes: MinimalVote[],
): Set<string> {
  const ids = new Set<string>();
  for (const p of liveProposals(proposals)) ids.add(p.family_id);
  for (const v of votes) ids.add(v.family_id);
  return ids;
}

export interface PhaseProgress {
  responded: number;
  total: number;
  waitingOn: MinimalFamily[];
  /** The other side of `waitingOn` — who has actually acted this phase. */
  respondedFamilies: MinimalFamily[];
  everyoneIn: boolean;
}

export function phaseProgress(
  families: MinimalFamily[],
  proposals: MinimalProposal[],
  votes: MinimalVote[],
): PhaseProgress {
  const voting = votingFamilies(families);
  const responded = respondedFamilyIds(proposals, votes);
  const waitingOn = voting.filter((f) => !responded.has(f.id));
  const respondedFamilies = voting.filter((f) => responded.has(f.id));
  return {
    responded: respondedFamilies.length,
    total: voting.length,
    waitingOn,
    respondedFamilies,
    everyoneIn: voting.length > 0 && waitingOn.length === 0,
  };
}

/** Whole days from today until the trip's target date. Negative once overdue. */
export function daysUntil(target: string | Date, now: Date = new Date()): number {
  const end = typeof target === 'string' ? new Date(`${target}T00:00:00`) : target;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ms = end.getTime() - startOfToday.getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Whether to show the organizer the "you can move on without them" prompt.
 *
 * Deliberately not automatic. The app suggests; a person decides. Advancing a
 * trip on a timer while someone is on a plane is exactly the failure that makes
 * groups distrust tools like this.
 */
export function shouldNudgeOrganizer(
  progress: PhaseProgress,
  targetDate: string,
  now: Date = new Date(),
): boolean {
  if (progress.everyoneIn) return false;
  if (progress.total === 0) return false;
  // Something to act on, and either the clock is short or most of the group is in.
  const daysLeft = daysUntil(targetDate, now);
  const majorityIn = progress.responded * 2 > progress.total;
  return progress.responded > 0 && (daysLeft <= 3 || majorityIn);
}
