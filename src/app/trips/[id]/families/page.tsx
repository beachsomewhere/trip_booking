import { AttendeePicker } from '@/components/families/AttendeePicker';
import { AttendeeEditor } from '@/components/families/AttendeeEditor';
import { loadHouseholdPeople, loadKnownFamilies, saveFamilyAndAttend } from '@/actions/families';
import { InviteFamilyForm } from '@/components/families/InviteFamilyForm';
import {
  LeaveTripButton,
  ResendInvitesButton,
  StatusButton,
} from '@/components/families/FamilyControls';
import { PhaseLockPanel } from '@/components/PhaseLockPanel';
import { DeleteTripButton } from '@/components/DeleteTripButton';
import { CopyLink } from '@/components/CopyLink';
import { Badge, Card, EmptyState, PageTitle } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { loadPhaseLocks, loadTripContext } from '@/lib/queries';
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
  const locks = await loadPhaseLocks(id, 'invites', ctx);

  const { data: invitationRows } = await supabase
    .from('invitations')
    .select('*')
    .eq('trip_id', id)
    .is('accepted_at', null);
  const invitations = invitationRows ?? [];


  const rosterOpen = ctx.phase === 'invites';


  return (
    <div className="space-y-6">
      <PageTitle
        title="Who's coming"
        subtitle={
          rosterOpen
            ? 'Anyone can add a family — they get an email with a link, no accounts to create.'
            : 'The guest list closed when the trip moved on to picking dates.'
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
                    {/* No household yet — this is their first trip, so take the
                        details here and remember them, rather than sending them
                        off to a settings page and back. */}
                    {householdPeople.length === 0 ? (
                      <AttendeeEditor
                        save={saveFamilyAndAttend.bind(null, id, family.id)}
                        tripStart={ctx.trip.agreed_start_date}
                        initial={[]}
                        saveLabel="Save my family"
                      />
                    ) : (
                      <AttendeePicker
                        tripId={id}
                        familyId={family.id}
                        tripStart={ctx.trip.agreed_start_date}
                        people={householdPeople}
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })}
      </section>


      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          {rosterOpen ? 'Invite a family' : 'The guest list'}
        </h2>
        {/* Guest list closes when the trip moves on: a family arriving after
            dates are being voted on inherits decisions they had no part in, and
            changes the headcount the lodging step is sized against. */}
        {rosterOpen ? (
          <Card>
            <InviteFamilyForm tripId={id} known={knownFamilies} />
          </Card>
        ) : (
          <EmptyState
            title="The guest list is closed"
            body="Families can be added while the trip is still on Who. This one has moved on."
          />
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
      {/* Everyone sees who has confirmed their attendees, not just the
          organizer — that is what tells the group whether waiting will change
          anything. */}
      {rosterOpen ? (
        <PhaseLockPanel
          tripId={id}
          phase="invites"
          nextPhase="dates"
          rows={locks}
          isOrganizer={ctx.isOrganizer}
          advanceLabel="Everyone's in — start picking dates"
          canLock={ctx.myFamily?.status === 'active'}
        />
      ) : null}

      {ctx.isOrganizer ? (
        <section className="border-t border-edge pt-6">
          <DeleteTripButton tripId={id} tripName={ctx.trip.name} />
        </section>
      ) : null}
    </div>
  );
}
