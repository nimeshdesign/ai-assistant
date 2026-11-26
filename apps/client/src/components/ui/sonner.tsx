import { Toaster as Sonner } from 'sonner';
import { useAppSelector } from '@/store';

export function Toaster() {
  const theme = useAppSelector((s) => s.ui.theme);
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{ classNames: { toast: 'font-sans' } }}
    />
  );
}
