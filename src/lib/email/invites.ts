import 'server-only';
import { Resend } from 'resend';
import { emailFrom, resendApiKey, siteUrl } from '@/lib/env';

export interface InviteEmail {
  to: string;
  token: string;
  tripName: string;
  fromFamily: string;
  organizerEmail?: string | null;
}

export function inviteUrl(token: string): string {
  return `${siteUrl()}/invite/${token}`;
}

function renderInvite({ tripName, fromFamily, token }: InviteEmail): string {
  const url = inviteUrl(token);
  return `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1a17">
  <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b6558;margin:0 0 8px">
    Lock the Trip
  </p>
  <h1 style="font-size:22px;margin:0 0 12px">You're invited to ${escapeHtml(tripName)}</h1>
  <p style="font-size:15px;line-height:1.55;color:#3d3a33;margin:0 0 20px">
    ${escapeHtml(fromFamily)} added your family. You'll pick dates first, then where to go,
    then where to stay — a few taps each, one decision at a time.
  </p>
  <p style="margin:0 0 24px">
    <a href="${url}"
       style="display:inline-block;background:#0f6a62;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:15px;font-weight:500">
      Join the trip
    </a>
  </p>
  <p style="font-size:13px;color:#6b6558;margin:0">
    Or paste this link: <br /><span style="word-break:break-all">${url}</span>
  </p>
</div>`.trim();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
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
