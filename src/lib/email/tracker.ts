import 'server-only';

import { PHASES, PHASE_META, phaseIndex, type TripPhase } from '@/lib/phases';

/**
 * The trip's progress, as a strip of numbered steps in an email.
 *
 * Every message the app sends is about one step, and none of them said where
 * that step sat in the whole thing. "The Barnes locked in when" means very
 * little on its own; "step 2 of 5, two to go" is a status you can act on
 * without opening anything.
 *
 * Built out of a table with inline styles, and nothing else. Email clients
 * strip <style> blocks, ignore flexbox and grid, and Outlook renders through
 * Word — a table of coloured cells is the one layout that survives all of
 * them. No images either: they are blocked by default in most clients, and a
 * status that only appears once you click "show images" is not a status.
 */

const DONE_BG = '#0f6a62';
const DONE_FG = '#ffffff';
const NOW_BG = '#f0b429';
const NOW_FG = '#1c1a17';
const TODO_BG = '#e7e2d8';
const TODO_FG = '#8a8377';

export interface TrackerOptions {
  /** Where the trip is now. */
  phase: TripPhase;
  /**
   * Marks the current step as finished rather than in progress — for the
   * message that says a step has just closed and the next one is open.
   */
  currentIsDone?: boolean;
}

/** The visible steps. `finalized` is the finish line, not a step to work on. */
const STEPS = PHASES.filter((p) => p !== 'finalized');

export function renderTracker({ phase, currentIsDone = false }: TrackerOptions): string {
  const here = phaseIndex(phase);
  const cells = STEPS.map((step, i) => {
    const done = i < here || (i === here && currentIsDone);
    const now = i === here && !currentIsDone;

    const bg = done ? DONE_BG : now ? NOW_BG : TODO_BG;
    const fg = done ? DONE_FG : now ? NOW_FG : TODO_FG;
    const label = PHASE_META[step].short;
    // A tick reads as finished at a glance; the number keeps the sequence
    // legible for anyone whose client drops the colour.
    const mark = done ? '&#10003;' : String(i + 1);

    return `
      <td width="25%" align="center" style="padding:0 3px">
        <div style="background:${bg};color:${fg};border-radius:6px;padding:8px 4px;font-size:13px;font-weight:600;line-height:1.2">
          ${mark} ${label}
        </div>
      </td>`;
  }).join('');

  const label = trackerCaption({ phase, currentIsDone });

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="margin:0 0 8px;border-collapse:separate">
  <tr>${cells}</tr>
</table>
<p style="font-size:13px;color:#6b6558;margin:0 0 24px;text-align:center">${label}</p>`.trim();
}

/** "Step 2 of 4 · when · two steps to go after this." */
export function trackerCaption({ phase, currentIsDone = false }: TrackerOptions): string {
  const here = phaseIndex(phase);

  if (phase === 'finalized') return 'All four steps done — the trip is booked.';

  const humanStep = here + 1;
  // Steps still to come. The same either way: on step 2 of 4 there are two
  // ahead of you, and having just finished step 2 there are still two ahead.
  const left = STEPS.length - humanStep;

  const position = currentIsDone
    ? `Step ${humanStep} of ${STEPS.length} done`
    : `Step ${humanStep} of ${STEPS.length}`;

  const remaining =
    left <= 0
      ? currentIsDone
        ? ' — that was the last one.'
        : ' — the last step.'
      : ` — ${left} more ${left === 1 ? 'step' : 'steps'} after this.`;

  return `${position}: ${PHASE_META[phase].label.toLowerCase()}${remaining}`;
}
