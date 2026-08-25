import 'server-only';
import { Resend } from 'resend';
import { emailFrom, resendApiKey, siteUrl } from '@/lib/env';

export interface ReminderEmail {
  to: string[];
  tripName: string;
  /** "When", "Who's coming" — the step being waited on. */
  phaseLabel: string;
  phaseUrl: string;
  fromFamily: string | null;
  /** Families already locked in, so the nudge carries social weight. */
  waitingSince: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/**
 * A nudge to one family that the group is waiting on them.
 *
 * Names who is asking and what step is blocked, because "action required" from
 * a piece of software is easy to ignore and "the Barnes are waiting on you to
 * pick dates" is not.
 */
export async function sendReminderEmail(reminder: ReminderEmail): Promise<{ delivered: boolean }> {
  const key = resendApiKey();
  const url = reminder.phaseUrl.startsWith('http')
    ? reminder.phaseUrl
    : `${siteUrl()}${reminder.phaseUrl}`;

  if (!key) {
    console.info(`[reminder] no RESEND_API_KEY — would nudge ${reminder.to.join(', ')}: ${url}`);
    return { delivered: false };
  }

  const asker = reminder.fromFamily ? escapeHtml(reminder.fromFamily) : 'The group';

  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1a17">
  <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b6558;margin:0 0 8px">
    Lock the Trip
  </p>
  <h1 style="font-size:22px;margin:0 0 12px">
    ${asker} ${reminder.fromFamily ? 'is' : 'are'} waiting on you
  </h1>
  <p style="font-size:15px;line-height:1.55;color:#3d3a33;margin:0 0 20px">
    ${escapeHtml(reminder.tripName)} can't move on from
    <strong>${escapeHtml(reminder.phaseLabel)}</strong> until your family locks it in.
    ${reminder.waitingSince ? escapeHtml(reminder.waitingSince) : ''}
  </p>
  <p style="margin:0 0 24px">
    <a href="${url}"
       style="display:inline-block;background:#0f6a62;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:15px;font-weight:500">
      Lock it in
    </a>
  </p>
  <p style="font-size:13px;color:#6b6558;margin:0">
    Or paste this link:<br /><span style="word-break:break-all">${url}</span>
  </p>
</div>`.trim();

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: emailFrom(),
      to: reminder.to,
      subject: `${reminder.tripName}: waiting on you for ${reminder.phaseLabel.toLowerCase()}`,
      html,
    });
    if (error) {
      console.error('[reminder] resend rejected the send', error);
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    console.error('[reminder] send failed', err);
    return { delivered: false };
  }
}

export interface LockNoticeEmail {
  to: string[];
  tripName: string;
  /** "When", "Who's coming" — the step that just moved. */
  phaseLabel: string;
  phaseUrl: string;
  /** The family that just finished. */
  lockedFamily: string;
  lockedCount: number;
  totalCount: number;
  /** Everyone still to go, this recipient included. */
  remaining: string[];
}

/**
 * "The Barnes are done with When" — sent to the families who aren't.
 *
 * A different message from a reminder, and deliberately so. A reminder is
 * somebody asking you personally; this is the group moving without you, which
 * is the thing that actually gets people to open the app. It leads with
 * progress rather than obligation, and says out loud that opting out is a
 * legitimate answer — a family that is not coming stops being a blocker the
 * moment they say so, and never does while they are only ignoring email.
 */
export async function sendLockNoticeEmail(notice: LockNoticeEmail): Promise<{ delivered: boolean }> {
  const key = resendApiKey();
  const url = notice.phaseUrl.startsWith('http')
    ? notice.phaseUrl
    : `${siteUrl()}${notice.phaseUrl}`;

  if (!key) {
    console.info(
      `[lock-notice] no RESEND_API_KEY — would tell ${notice.to.join(', ')} that ` +
        `${notice.lockedFamily} locked ${notice.phaseLabel}: ${url}`,
    );
    return { delivered: false };
  }

  const others = notice.remaining.length > 1 ? notice.remaining.length - 1 : 0;
  const alsoWaiting =
    others > 0
      ? ` You're not the only one — ${others} other ${others === 1 ? 'family hasn' : 'families haven'}'t either.`
      : ' Yours is the last one the group is waiting on.';

  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1a17">
  <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b6558;margin:0 0 8px">
    Lock the Trip
  </p>
  <h1 style="font-size:22px;margin:0 0 12px">
    ${escapeHtml(notice.lockedFamily)} are done with ${escapeHtml(notice.phaseLabel.toLowerCase())}
  </h1>
  <p style="font-size:15px;line-height:1.55;color:#3d3a33;margin:0 0 20px">
    That's <strong>${notice.lockedCount} of ${notice.totalCount}</strong> families in on
    ${escapeHtml(notice.tripName)}.${alsoWaiting}
  </p>
  <p style="font-size:15px;line-height:1.55;color:#3d3a33;margin:0 0 20px">
    Have a look, change anything you need to, and lock it in.
  </p>
  <p style="margin:0 0 24px">
    <a href="${url}"
       style="display:inline-block;background:#0f6a62;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:15px;font-weight:500">
      Take a look
    </a>
  </p>
  <p style="font-size:14px;color:#6b6558;margin:0 0 20px">
    Not coming on this one? Say so from the same page — the group will stop waiting on you, and
    nobody has to guess.
  </p>
  <p style="font-size:13px;color:#6b6558;margin:0">
    Or paste this link:<br /><span style="word-break:break-all">${url}</span>
  </p>
</div>`.trim();

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: emailFrom(),
      to: notice.to,
      subject: `${notice.lockedFamily} locked in ${notice.phaseLabel.toLowerCase()} — ${notice.tripName}`,
      html,
    });
    if (error) {
      console.error('[lock-notice] resend rejected the send', error);
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    console.error('[lock-notice] send failed', err);
    return { delivered: false };
  }
}
