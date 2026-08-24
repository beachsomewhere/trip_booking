import { leader, liveProposals, tally, type MinimalFamily, type MinimalProposal, type MinimalVote, type VoteChoice } from '@/lib/consensus';
import type { BoardItem } from '@/components/ProposalBoard';

/**
 * Turns raw proposal + vote rows into everything ProposalBoard needs except the
 * phase-specific body, which each page renders itself.
 *
 * Sorted by support so the front-runner is the first thing a late-arriving
 * family sees — that is what makes "just agree with the Barnes" a one-tap path.
 */
export function boardBase<P extends MinimalProposal & { note?: string | null }>(
  proposals: P[],
  votes: MinimalVote[],
  families: MinimalFamily[],
  myFamilyId: string | null,
): { proposal: P; item: Omit<BoardItem, 'body'> }[] {
  const live = liveProposals(proposals);
  const tallies = tally(live, votes, families);
  const front = leader(live, votes, families);
  const nameOf = (id: string) => families.find((f) => f.id === id)?.name ?? 'Someone';

  return live
    .map((proposal) => {
      const t = tallies.get(proposal.id)!;
      const myVote =
        (votes.find((v) => v.proposal_id === proposal.id && v.family_id === myFamilyId)
          ?.choice as VoteChoice | undefined) ?? null;

      return {
        proposal,
        score: t.score,
        item: {
          id: proposal.id,
          familyName: nameOf(proposal.family_id),
          isMine: proposal.family_id === myFamilyId,
          note: proposal.note ?? null,
          yes: t.yes,
          maybe: t.maybe,
          no: t.no,
          yesFamilyNames: t.yesFamilyIds.map(nameOf),
          myVote,
          isLeader: front?.proposalId === proposal.id,
        } satisfies Omit<BoardItem, 'body'>,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ proposal, item }) => ({ proposal, item }));
}
