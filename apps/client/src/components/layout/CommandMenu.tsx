import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Command } from 'cmdk';
import { Dialog as D } from 'radix-ui';
import { Monitor, Moon, Search, Sun } from 'lucide-react';
import { CATEGORY_CATALOG, type Theme } from '@aia/shared';
import { CategoryIcon } from '@/components/common/CategoryIcon';
import { useSetTheme } from '@/hooks/useSetTheme';
import { NAV_SECTIONS } from './nav';

const itemCls =
  'flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm outline-none select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground';
const groupCls =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase';

/** ⌘K / Ctrl+K command palette: jump to pages, start practice by topic, switch theme. */
export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const setTheme = useSetTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <D.Content
          aria-describedby={undefined}
          className="fixed top-[15%] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
        >
          <D.Title className="sr-only">Command menu</D.Title>
          <Command loop>
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder="Search pages, topics and actions…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-1.5">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">No results.</Command.Empty>
              <Command.Group heading="Go to" className={groupCls}>
                {NAV_SECTIONS.flatMap((s) => s.items).map(({ to, label, icon: Icon, description }) => (
                  <Command.Item key={to} value={`${label} ${description}`} onSelect={() => run(() => navigate(to))} className={itemCls}>
                    <Icon />
                    <span>{label}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{description}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Practise a topic" className={groupCls}>
                {CATEGORY_CATALOG.map((c) => (
                  <Command.Item
                    key={c.slug}
                    value={`practise ${c.name} ${c.description}`}
                    onSelect={() => run(() => navigate(`/practice/session?categories=${c.slug}&difficulty=mixed&count=10`))}
                    className={itemCls}
                  >
                    <CategoryIcon name={c.icon} />
                    <span>{c.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Theme" className={groupCls}>
                {(
                  [
                    ['light', 'Light theme', Sun],
                    ['dark', 'Dark theme', Moon],
                    ['system', 'System theme', Monitor],
                  ] as [Theme, string, typeof Sun][]
                ).map(([value, label, Icon]) => (
                  <Command.Item key={value} value={label} onSelect={() => run(() => setTheme(value))} className={itemCls}>
                    <Icon />
                    {label}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
