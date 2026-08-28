/**
 * Brings the lock-in panel into view and marks it, briefly.
 *
 * Saying who is coming and locking the step in are two separate actions, and
 * the second one is easy to miss: the first has visible feedback and the lock
 * is often below the fold. Someone testing this did exactly that — picked their
 * family, saw "1 coming", and stopped, with the trip still waiting on them.
 *
 * The outline is set inline rather than with a class because Tailwind only
 * ships classes it can find in the source, and one applied from a string at
 * runtime would be compiled away.
 */
export const LOCK_PANEL_ID = 'lock-in';

export function revealLockPanel() {
  if (typeof document === 'undefined') return;

  const el = document.getElementById(LOCK_PANEL_ID);
  if (!el) return;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  el.style.transition = 'outline-color 400ms ease';
  el.style.outline = '2px solid var(--accent)';
  el.style.outlineOffset = '3px';
  window.setTimeout(() => {
    el.style.outlineColor = 'transparent';
    window.setTimeout(() => {
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.transition = '';
    }, 500);
  }, 1600);
}
