import 'server-only';

/**
 * The bits every email needs to survive an inbox.
 *
 * Gmail threads messages by subject and then hides whatever repeats between
 * them behind a "…" — the same trimming it uses for quoted replies. Our emails
 * were near-identical below the headline (same tracker, same button, same
 * footer), so the second reminder for a step arrived as a progress graphic and
 * a chevron, with the actual instruction collapsed out of sight.
 *
 * Two things fix it, and both earn their place regardless:
 *
 *   - a preheader, which is what the inbox shows next to the subject, and which
 *     differs per message because it says where the trip is;
 *   - a visible sent stamp, so no two messages in a thread are identical and
 *     you can tell which one is the latest.
 */

/**
 * Inbox preview text. Hidden in the body, shown beside the subject line.
 *
 * The trailing whitespace stops clients padding the preview with whatever HTML
 * comes next — usually the word "Lock" from the logotype.
 */
export function preheader(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0">
  ${escapeHtml(text)}${'&#8203;&nbsp;'.repeat(60)}
</div>`;
}

/**
 * "Sent 25 August 2026, 15:14 UTC" — small, grey, and last.
 *
 * Deliberately visible rather than a hidden random token: it does the same job
 * of making each message unique, and unlike invisible junk it is something a
 * reader might actually want when three reminders are stacked in a thread.
 */
export function sentStamp(now: Date = new Date()): string {
  const stamp = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    // Seconds, not minutes: two reminders sent in the same minute would
    // otherwise be byte-identical, which is the case this exists to prevent.
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(now);

  return `<p style="font-size:12px;color:#a9a294;margin:20px 0 0">Sent ${stamp} UTC</p>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
