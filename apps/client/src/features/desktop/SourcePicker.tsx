import { useEffect, useState } from 'react';
import { AppWindow, Monitor } from 'lucide-react';
import type { CaptureSourceInfo } from '@aia/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { getDesktop } from '@/lib/desktop';
import { cn } from '@/lib/utils';

/**
 * Screen/window picker for the desktop app. When the page asks to share the screen, the shell
 * lists what can be shared and this dialog lets the user choose. Nothing is shared until they do.
 */
export function SourcePicker() {
  const bridge = getDesktop();
  const [request, setRequest] = useState<{ id: string; sources: CaptureSourceInfo[] } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    return bridge.onPickSource((id, sources) => {
      setSelected(null);
      setRequest({ id, sources });
    });
  }, [bridge]);

  const answer = (sourceId: string | null) => {
    if (request) bridge?.chooseSource(request.id, sourceId);
    setRequest(null);
  };

  const screens = request?.sources.filter((s) => s.kind === 'screen') ?? [];
  const windows = request?.sources.filter((s) => s.kind === 'window') ?? [];

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && answer(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose what to share</DialogTitle>
          <DialogDescription>Only the screen or window you pick is read. You can stop at any time.</DialogDescription>
        </DialogHeader>
        {[
          ['Screens', screens, Monitor],
          ['Windows', windows, AppWindow],
        ].map(([label, list, Icon]) =>
          (list as CaptureSourceInfo[]).length ? (
            <div key={label as string} className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label as string}</p>
              <ul className="grid grid-cols-2 gap-2" role="listbox" aria-label={label as string}>
                {(list as CaptureSourceInfo[]).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected === s.id}
                      onClick={() => setSelected(s.id)}
                      onDoubleClick={() => answer(s.id)}
                      className={cn(
                        'w-full rounded-lg border p-1.5 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        selected === s.id && 'border-primary bg-accent',
                      )}
                    >
                      <img src={s.thumbnail} alt="" className="aspect-video w-full rounded bg-muted object-cover" />
                      <span className="mt-1 flex items-center gap-1 text-xs">
                        {(() => {
                          const I = Icon as typeof Monitor;
                          return <I className="size-3 shrink-0 text-muted-foreground" />;
                        })()}
                        <span className="truncate">{s.name}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
        {request && request.sources.length === 0 && <p className="text-sm text-muted-foreground">Nothing is available to share.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => answer(null)}>
            Cancel
          </Button>
          <Button onClick={() => answer(selected)} disabled={!selected}>
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
