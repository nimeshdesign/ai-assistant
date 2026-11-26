import { NavLink } from 'react-router';
import { PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAppDispatch, useAppSelector } from '@/store';
import { setMobileNavOpen, toggleSidebar } from '@/store/uiSlice';
import { NAV_SECTIONS } from './nav';

export function Sidebar() {
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
  const mobileOpen = useAppSelector((s) => s.ui.mobileNavOpen);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn('fixed inset-0 z-30 bg-black/40 md:hidden', mobileOpen ? 'block' : 'hidden')}
        onClick={() => dispatch(setMobileNavOpen(false))}
        aria-hidden
      />
      <aside
        aria-label="Primary"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r bg-sidebar transition-[width,transform] duration-200',
          collapsed ? 'md:w-16' : 'md:w-60',
          'w-64 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className={cn('flex h-14 items-center gap-2 px-4', collapsed && 'md:justify-center md:px-0')}>
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <span className={cn('font-semibold tracking-tight', collapsed && 'md:hidden')}>Interview AI</span>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
          {NAV_SECTIONS.map((section, i) => (
            <div key={section.title ?? i} className="space-y-1">
              {section.title && (
                <p
                  className={cn(
                    'px-2 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase',
                    collapsed && 'md:hidden',
                  )}
                >
                  {section.title}
                </p>
              )}
              {section.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  title={collapsed ? label : undefined}
                  onClick={() => dispatch(setMobileNavOpen(false))}
                  className={({ isActive }) =>
                    cn(
                      'flex h-9 items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                      isActive && 'bg-accent font-medium text-accent-foreground',
                      collapsed && 'md:justify-center md:px-0',
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" />
                  <span className={cn(collapsed && 'md:hidden')}>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="hidden border-t p-2 md:block">
          <Button
            variant="ghost"
            size="sm"
            className={cn('w-full justify-start text-muted-foreground', collapsed && 'justify-center')}
            onClick={() => dispatch(toggleSidebar())}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && 'Collapse'}
          </Button>
        </div>
      </aside>
    </>
  );
}
