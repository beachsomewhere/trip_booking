import type { ComponentProps, ReactNode } from 'react';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ' +
  'transition-colors disabled:opacity-50 disabled:pointer-events-none';

const variants = {
  primary: 'bg-accent text-white hover:brightness-110',
  secondary: 'bg-surface-2 text-text border border-edge hover:bg-edge/60',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
  danger: 'bg-clay-500 text-white hover:bg-clay-600',
} as const;

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: keyof typeof variants }) {
  return <button className={cx(buttonBase, variants[variant], className)} {...props} />;
}

export function Card({
  className,
  children,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cx('rounded-xl border border-edge bg-surface p-5 shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'accent' | 'warn' | 'good';
  children: ReactNode;
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    warn: 'bg-clay-100 text-clay-600',
    good: 'bg-moss-100 text-moss-600',
  } as const;
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-text">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-text ' +
  'placeholder:text-muted/70';

/**
 * Note: `inputClass` sets `w-full`, and `cx` only concatenates — it does not
 * resolve Tailwind conflicts. Passing a competing width (`w-20`, `flex-1`)
 * through `className` leaves both classes on the element, and the winner is
 * decided by stylesheet order rather than by which you wrote last. That once
 * made an age field render wider than the name beside it.
 *
 * Put widths on a wrapper element instead.
 */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cx(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cx(inputClass, 'min-h-20', className)} {...props} />;
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-text">
        {title}
      </h1>
      {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-edge px-6 py-10 text-center">
      <p className="text-sm font-medium text-text">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p> : null}
    </div>
  );
}

/** Renders a server-action error passed back through useActionState. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-600" role="alert">
      {message}
    </p>
  );
}
