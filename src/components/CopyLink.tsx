'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';

/** Fallback path when email is not configured: hand the organizer the URL. */
export function CopyLink({ url, label = 'Copy invite link' }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className="px-2 py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt('Copy this invite link:', url);
        }
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}
