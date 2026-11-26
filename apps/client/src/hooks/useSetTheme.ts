import { useCallback } from 'react';
import type { Theme } from '@aia/shared';
import { useAppDispatch, useAppSelector } from '@/store';
import { useUpdatePreferencesMutation } from '@/store/authApi';
import { setTheme } from '@/store/uiSlice';

/** Change the theme locally and, when signed in, save it to the account (best effort). */
export function useSetTheme() {
  const dispatch = useAppDispatch();
  const signedIn = useAppSelector((s) => s.auth.status === 'authenticated');
  const [updatePreferences] = useUpdatePreferencesMutation();
  return useCallback(
    (theme: Theme) => {
      dispatch(setTheme(theme));
      if (signedIn) void updatePreferences({ theme });
    },
    [dispatch, signedIn, updatePreferences],
  );
}
