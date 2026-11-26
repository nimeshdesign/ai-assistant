import { useEffect } from 'react';
import { useAppSelector } from '@/store';

/** Keep the `.dark` class on <html> in sync with the selected theme (and the OS when "system"). */
export function useApplyTheme() {
  const theme = useAppSelector((s) => s.ui.theme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
