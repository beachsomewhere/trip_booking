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
