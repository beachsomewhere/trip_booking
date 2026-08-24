import 'server-only';
import { Resend } from 'resend';
import { emailFrom, resendApiKey, siteUrl } from '@/lib/env';

/**
 * "The Barnes want to keep you on their list."
 *
 * Deliberately not a trip invitation: nothing is being planned yet, and the
 * email says so. Someone who reads this as "you are committed to a holiday"
 * will decline it for the wrong reason.
 */
export interface FriendEmail {
  to: string;
  token: string;
  /** The household doing the asking. */
  fromName: string;
  fromEmail?: string | null;
}

export function friendUrl(token: string): string {
  return `${siteUrl()}/friends/${token}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function render({ fromName, token }: FriendEmail): string {
  const url = friendUrl(token);
  const who = escapeHtml(fromName);
  return `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1a17">
  <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b6558;margin:0 0 8px">
    Lock the Trip
  </p>
  <h1 style="font-size:22px;margin:0 0 12px">${who} would like to add you</h1>
  <p style="font-size:15px;line-height:1.55;color:#3d3a33;margin:0 0 20px">
    Lock the Trip is how ${who} plans trips with the people they travel with. Saying yes puts your
    family on their list, so when they do plan something you are one tap away instead of a retyped
    email address.
  </p>
  <p style="font-size:15px;line-height:1.55;color:#3d3a33;margin:0 0 20px">
    <strong>This is not an invitation to a trip.</strong> Nothing is being planned yet, and you are
    not agreeing to go anywhere. They will see your family name and email address — nothing else.
  </p>
  <p style="margin:0 0 24px">
    <a href="${url}"
       style="display:inline-block;background:#0f6a62;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:15px;font-weight:500">
      Have a look
    </a>
  </p>
  <p style="font-size:13px;color:#6b6558;margin:0">
    Or paste this link: <br /><span style="word-break:break-all">${url}</span>
  </p>
</div>`.trim();
}

/**
 * Sends the request, or logs it.
 *
 * Same bargain as invitations: with no RESEND_API_KEY the URL goes to the
 * server console rather than the send failing, and the caller learns whether it
 * was really delivered so it can offer a copyable link instead.
 */
export async function sendFriendEmail(req: FriendEmail): Promise<{ delivered: boolean }> {
  const key = resendApiKey();

  if (!key) {
    console.info(`[friend] no RESEND_API_KEY — request for ${req.to}: ${friendUrl(req.token)}`);
    return { delivered: false };
  }

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: emailFrom(),
      to: req.to,
      subject: `${req.fromName} would like to add your family`,
      html: render(req),
      replyTo: req.fromEmail ?? undefined,
    });
    if (error) {
      console.error('[friend] resend rejected the send', error);
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    console.error('[friend] send failed', err);
    return { delivered: false };
  }
}
