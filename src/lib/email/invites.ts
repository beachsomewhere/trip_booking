import 'server-only';
import { Resend } from 'resend';
import { emailFrom, resendApiKey, siteUrl } from '@/lib/env';
import { escapeHtml, preheader, sentStamp } from '@/lib/email/shell';

export interface InviteEmail {
  to: string;
  token: string;
  tripName: string;
  tripDescription?: string | null;
  /** The family doing the inviting. Null when it cannot be determined. */
  fromFamily: string | null;
  organizerEmail?: string | null;
}

export function inviteUrl(token: string): string {
  return `${siteUrl()}/invite/${token}`;
}

function renderInvite({ tripName, fromFamily, token, tripDescription }: InviteEmail): string {
  const url = inviteUrl(token);
  return `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1a17">
  ${preheader(fromFamily ? `${fromFamily} added your family to ${tripName}` : `You're invited to ${tripName}`)}
  <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b6558;margin:0 0 8px">
    Lock the Trip
  </p>
  <h1 style="font-size:22px;margin:0 0 12px">You're invited to ${escapeHtml(tripName)}</h1>
  ${
    tripDescription
      ? `<p style="font-size:15px;line-height:1.55;color:#1c1a17;margin:0 0 16px;padding:12px 14px;background:#f4efe6;border-radius:8px">${escapeHtml(tripDescription)}</p>`
      : ''
  }
  <p style="font-size:15px;line-height:1.55;color:#3d3a33;margin:0 0 20px">
    ${fromFamily ? `${escapeHtml(fromFamily)} added your family.` : 'You have been added to this trip.'}
    You'll pick dates first, then where to go, then where to stay — a few taps each,
    one decision at a time.
  </p>
  <p style="margin:0 0 24px">
    <a href="${url}"
       style="display:inline-block;background:#0f6a62;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:15px;font-weight:500">
      Join the trip
    </a>
  </p>
  <p style="font-size:14px;color:#6b6558;margin:0 0 20px">
    Can't make it?
    <a href="${url}/decline" style="color:#a5471f">Let them know</a> — it saves the group
    waiting on an answer.
  </p>
  <p style="font-size:13px;color:#6b6558;margin:0">
    Or paste this link: <br /><span style="word-break:break-all">${url}</span>
  </p>
  ${sentStamp()}
</div>`.trim();
}


/**
 * Sends an invite, or logs it.
 *
 * With no RESEND_API_KEY the invite URL goes to the server console instead of
 * failing. That is the difference between being able to test a four-family flow
 * on a laptop and not — and it means a missing key never silently loses an
 * invitation, since the caller still learns whether it was really delivered.
 */
export async function sendInviteEmail(invite: InviteEmail): Promise<{ delivered: boolean }> {
  const key = resendApiKey();

  if (!key) {
    console.info(
      `[invite] no RESEND_API_KEY — invite for ${invite.to}: ${inviteUrl(invite.token)}`,
    );
    return { delivered: false };
  }

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: emailFrom(),
      to: invite.to,
      subject: `You're invited to ${invite.tripName}`,
      html: renderInvite(invite),
      replyTo: invite.organizerEmail ?? undefined,
    });
    if (error) {
      console.error('[invite] resend rejected the send', error);
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    console.error('[invite] send failed', err);
    return { delivered: false };
  }
}
