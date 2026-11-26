import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/** Copy text to the clipboard, with a temporary "copied" flag and toast feedback. */
export function useCopy(resetMs = 1500) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string, label = 'Copied to clipboard') => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(label);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), resetMs);
      } catch {
        toast.error('Could not copy — your browser blocked clipboard access.');
      }
    },
    [resetMs],
  );

  return { copy, copied };
}
