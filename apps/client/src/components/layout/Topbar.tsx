import { useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { ApiStatus } from '@/components/common/ApiStatus';
import { useAppDispatch } from '@/store';
import { setMobileNavOpen } from '@/store/uiSlice';
import { NAV_SECTIONS } from './nav';
import { ThemeToggle } from './ThemeToggle';
import { CommandMenu } from './CommandMenu';
import { UserMenu } from './UserMenu';

const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function Topbar() {
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const current = ALL_ITEMS.find((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)));

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={() => dispatch(setMobileNavOpen(true))}
      >
        <Menu />
      </Button>
      <p className="text-sm font-medium">{current?.label ?? 'Interview AI'}</p>

      <Button
        variant="outline"
        size="sm"
        className="ml-auto hidden w-56 justify-start text-muted-foreground sm:flex"
        onClick={() => setCommandOpen(true)}
      >
        <Search /> Search…
        <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px]">{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </Button>
      <div className="ml-auto flex items-center gap-3 sm:ml-0">
        <Button variant="ghost" size="icon-sm" className="sm:hidden" aria-label="Search" onClick={() => setCommandOpen(true)}>
          <Search />
        </Button>
        <ApiStatus />
        <ThemeToggle />
        <UserMenu />
      </div>
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
    </header>
  );
}
