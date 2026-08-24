'use client';

import { useState, useTransition } from 'react';
import { copyPicksFrom, removeCandidate, saveLodgingComment, togglePick } from '@/actions/lodging';
import { Badge, Button, Card, Input, cx } from '@/components/ui';
import { listFamilies } from '@/lib/format';

export interface CandidateView {
  id: string;
  name: string;
  address: string | null;
  photoUrl: string | null;
  url: string | null;
  priceNote: string | null;
  capacityNote: string | null;
  rating: number | null;
  source: string;
  addedByName: string;
  canRemove: boolean;
  pickedByNames: string[];
  myRank: number | null;
  /** What each family said about this place, where they said anything. */
  comments: { familyName: string; note: string }[];
  myComment: string;
}

export function CandidateGrid({
  tripId,
  candidates,
  canPick,
  pickCount,
  headcount,
}: {
  tripId: string;
  candidates: CandidateView[];
  canPick: boolean;
  pickCount: number;
  headcount: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {candidates.map((c) => (
        <CandidateCard
          key={c.id}
          tripId={tripId}
          candidate={c}
          canPick={canPick}
          pickCount={pickCount}
          headcount={headcount}
        />
      ))}
    </div>
  );
}

function CandidateCard({
  tripId,
  candidate: c,
  canPick,
  pickCount,
  headcount,
}: {
  tripId: string;
  candidate: CandidateView;
  canPick: boolean;
  pickCount: number;
  headcount: number;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState(c.myComment);
  const picked = c.myRank !== null;
  const atLimit = !picked && pickCount >= 5;

  return (
    <Card className={cx('flex flex-col gap-2 p-4', picked && 'border-accent')}>
      {c.photoUrl ? (
        // Photos come from Google's proxy and arbitrary listing sites, so
        // next/image optimisation is not worth the remote-pattern config here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.photoUrl} alt="" className="h-32 w-full rounded-lg object-cover" loading="lazy" />
      ) : null}

      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-text">{c.name}</p>
          {picked ? <Badge tone="accent">#{c.myRank}</Badge> : null}
        </div>
        {c.address ? <p className="truncate text-sm text-muted">{c.address}</p> : null}

        <p className="mt-1 text-sm text-muted">
          {[
            c.capacityNote,
            c.priceNote,
            c.rating ? `${c.rating}★` : null,
          ]
            .filter(Boolean)
            .join(' · ') || `No capacity listed — your group is ${headcount}`}
        </p>

        {c.pickedByNames.length > 0 ? (
          <p className="mt-1 text-sm text-moss-600">
            {listFamilies(c.pickedByNames)} shortlisted this
          </p>
        ) : null}

        <p className="mt-1 text-xs text-muted">Added by {c.addedByName}</p>
      </div>

      {c.comments.length > 0 ? (
        <ul className="space-y-1 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          {c.comments.map((m) => (
            <li key={m.familyName}>
              <span className="font-medium text-text">{m.familyName}:</span> {m.note}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Say what you think of a place whether or not you shortlisted it —
          "no swim-up bar" saves four other families looking it up. */}
      {canPick ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a comment (optional)"
              maxLength={280}
              aria-label={`Comment on ${c.name}`}
            />
          </div>
          {note !== c.myComment ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(() => {
                  void saveLodgingComment(tripId, c.id, note);
                })
              }
            >
              Save
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {canPick ? (
          <Button
            variant={picked ? 'primary' : 'secondary'}
            disabled={pending || atLimit}
            onClick={() =>
              start(() => {
                void togglePick(tripId, c.id);
              })
            }
          >
            {picked ? 'In your five' : atLimit ? 'Five already' : 'Add to your five'}
          </Button>
        ) : null}
        {c.url ? (
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-accent"
          >
            Open listing ↗
          </a>
        ) : null}
        {c.canRemove ? (
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            disabled={pending}
            onClick={() =>
              start(() => {
                void removeCandidate(tripId, c.id);
              })
            }
          >
            Remove
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * "Just go with theirs."
 *
 * The spec's least-engaged family is the whole reason this exists: copying a
 * shortlist wholesale is a legitimate answer, and making it one tap is what
 * stops that family from becoming the blocker.
 */
export function CopyPicksButton({
  tripId,
  fromFamilyId,
  fromFamilyName,
  count,
}: {
  tripId: string;
  fromFamilyId: string;
  fromFamilyName: string;
  count: number;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Replace your shortlist with ${fromFamilyName}'s ${count}?`)) return;
        start(() => {
          void copyPicksFrom(tripId, fromFamilyId);
        });
      }}
    >
      Use {fromFamilyName}&apos;s picks
    </Button>
  );
}
