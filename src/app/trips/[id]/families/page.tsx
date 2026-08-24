import { AttendeePicker } from '@/components/families/AttendeePicker';
import { loadHouseholdPeople, loadKnownFamilies } from '@/actions/families';
import { FamilyProposalCard, type ProposalView } from '@/components/families/FamilyProposalCard';
import { InviteFamilyForm } from '@/components/families/InviteFamilyForm';
import {
  LeaveTripButton,
  ResendInvitesButton,
  StatusButton,
} from '@/components/families/FamilyControls';
import { AdvanceButton } from '@/components/AdvanceButton';
import { DeleteTripButton } from '@/components/DeleteTripButton';
import { CopyLink } from '@/components/CopyLink';
import { Badge, Card, EmptyState, PageTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { loadTripContext, rows } from '@/lib/queries';
import { inviteUrl } from '@/lib/email/invites';
import { pluralize } from '@/lib/format';
import { isChildOn } from '@/lib/age';

export default async function FamiliesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadTripContext(id);
  const supabase = await createClient();

  // Prefill the attendee editor from this user's household, so a returning
  // family confirms who is coming instead of retyping everyone.
  const householdPeople = ctx.myFamily ? await loadHouseholdPeople(ctx.myFamily.id) : [];
  const knownFamilies = await loadKnownFamilies(id);

  const [proposalsRes, votesRes, invitationsRes] = await Promise.all([
    supabase
      .from('family_proposals')
      .select('*')
      .eq('trip_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('family_proposal_votes').select('*').eq('trip_id', id),
    supabase.from('invitations').select('*').eq('trip_id', id).is('accepted_at', null),
  ]);

  const proposals = rows('family_proposals', proposalsRes);
  const proposalVotes = rows('family_proposal_votes', votesRes);
  const invitations = rows('invitations', invitationsRes);

  const rosterOpen = ctx.phase === 'invites';
  const activeCount = ctx.votingFamilies.length;

  const proposalViews: ProposalView[] = proposals.map((p) => {
    const votes = proposalVotes.filter((v) => v.proposal_id === p.id);
    return {
      id: p.id,
      proposed_name: p.proposed_name,
      proposed_emails: p.proposed_emails,
      proposed_adults: p.proposed_adults,
      proposed_children: p.proposed_children,
      note: p.note,
      status: p.status,
      proposedByName:
        ctx.families.find((f) => f.id === p.proposed_by_family_id)?.name ?? 'organizer',
      approvals: votes.filter((v) => v.approve).length,
      needed: activeCount,
      myVote: votes.find((v) => v.family_id === ctx.myFamily?.id)?.approve ?? null,
    };
  });

  const pendingProposals = proposalViews.filter((p) => p.status === 'pending');
  const settledProposals = proposalViews.filter((p) => p.status !== 'pending');

  return (
    <div className="space-y-6">
      <PageTitle
        title="Who's coming"
        subtitle={
          rosterOpen
            ? 'Add the families first. Everyone gets an email with a link — no accounts to create.'
            : 'The roster is set. Adding anyone now needs every family to agree first.'
        }
      />

      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        {ctx.families.map((family) => {
          const isMine = family.id === ctx.myFamily?.id;
          const heads = family.family_attendees.length;
          // Ages are as they'll be on the trip, not today — see lib/age.ts.
          const kids = family.family_attendees.filter((a) =>
            isChildOn(a, ctx.trip.agreed_start_date),
          ).length;

          return (
            <Card key={family.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-text">
                    {family.name}
                    {isMine ? <span className="ml-2 text-sm text-muted">(you)</span> : null}
                  </p>
                  <p className="text-sm text-muted">
                    {family.family_members.map((m) => m.email).join(', ')}
                  </p>
                  <p className="text-sm text-muted">
                    {heads === 0
                      ? 'No headcount yet'
                      : `${pluralize(heads, 'person', 'people')}${kids > 0 ? `, ${pluralize(kids, 'kid')}` : ''}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      family.status === 'active'
                        ? 'good'
                        : family.status === 'invited'
                          ? 'neutral'
                          : 'warn'
                    }
                  >
                    {family.status === 'invited' ? 'invite sent' : family.status.replace('_', ' ')}
                  </Badge>
                  {/* The organizer cannot leave their own trip — they would keep
                      access through the organizer clause while showing as gone.
                      They delete it instead. */}
                  {isMine && family.status === 'active' && !ctx.isOrganizer ? (
                    <LeaveTripButton
                      tripId={id}
                      familyId={family.id}
                      familyName={family.name}
                    />
                  ) : null}
                  {ctx.isOrganizer && !isMine && family.status !== 'removed' ? (
                    <StatusButton
                      tripId={id}
                      familyId={family.id}
                      to="removed"
                      variant="danger"
                      confirm={`Remove ${family.name} from this trip? Use this when a family has gone quiet and is holding everyone up.`}
                    >
                      Remove
                    </StatusButton>
                  ) : null}
                </div>
              </div>

              {isMine ? (
                <div className="space-y-4 rounded-lg bg-surface-2 p-4">
                  <div>
                    <p className="mb-2 text-sm font-medium text-text">
                      Who&apos;s coming from your family
                    </p>
                    <AttendeePicker
                      tripId={id}
                      familyId={family.id}
                      tripStart={ctx.trip.agreed_start_date}
                      people={householdPeople}
                    />
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })}
      </section>

      {/* ------------------------------------------------------------------ */}
      {pendingProposals.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Waiting on your approval
          </h2>
          {pendingProposals.map((p) => (
            <FamilyProposalCard
              key={p.id}
              tripId={id}
              proposal={p}
              canVote={Boolean(ctx.myFamily) && ctx.myFamily?.status === 'active'}
            />
          ))}
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          {rosterOpen ? 'Invite a family' : 'Suggest another family'}
        </h2>
        {rosterOpen && !ctx.isOrganizer ? (
          <EmptyState
            title="The organizer is still building the guest list"
            body="Once the trip starts you'll be able to suggest families too."
          />
        ) : (
          <Card>
            <InviteFamilyForm
              tripId={id}
              mode={rosterOpen ? 'invite' : 'propose'}
              known={knownFamilies}
            />
          </Card>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {ctx.isOrganizer && invitations && invitations.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Invites not yet accepted
          </h2>
          <Card className="space-y-3">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-text">{inv.email}</span>
                <CopyLink url={inviteUrl(inv.token)} />
              </div>
            ))}
            <p className="text-xs text-muted">
              If email isn&apos;t configured yet, copy a link and send it however you like — the
              link is the whole sign-in.
            </p>
            <ResendInvitesButton tripId={id} />
          </Card>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {settledProposals.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Earlier suggestions</h2>
          {settledProposals.map((p) => (
            <FamilyProposalCard key={p.id} tripId={id} proposal={p} canVote={false} />
          ))}
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {ctx.isOrganizer && rosterOpen ? (
        <Card className="space-y-3">
          <div>
            <p className="font-medium text-text">Ready to start picking dates?</p>
            <p className="text-sm text-muted">
              Families who haven&apos;t accepted yet can still join — their invite links keep
              working. After this, adding anyone needs the group&apos;s approval.
            </p>
          </div>
          <div>
            <AdvanceButton
              tripId={id}
              to="dates"
              confirm="Move on to picking dates? You can still add families, but it'll need everyone's approval."
            >
              Start picking dates →
            </AdvanceButton>
          </div>
        </Card>
      ) : null}

      {ctx.isOrganizer ? (
        <section className="border-t border-edge pt-6">
          <DeleteTripButton tripId={id} tripName={ctx.trip.name} />
        </section>
      ) : null}
    </div>
  );
}
