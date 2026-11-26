import { useCallback } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/store/api';
import {
  authApi,
  useUpdatePermissionsMutation,
  useUpdatePreferencesMutation,
  useUpdatePrivacyMutation,
  useUpdateVoiceMutation,
} from '@/store/authApi';
import { useAppDispatch, useAppSelector } from '@/store';
import { updateSection, type SettingsState } from '@/store/settingsSlice';

type Section = Exclude<keyof SettingsState, 'profile'>;

/**
 * Update a settings section: applied to the UI immediately (optimistic), saved to the
 * server, and rolled back with an error toast if the server rejects it.
 */
export function useUpdateSettings() {
  const dispatch = useAppDispatch();
  const current = useAppSelector((s) => s.settings);
  const [updatePreferences] = useUpdatePreferencesMutation();
  const [updateVoice] = useUpdateVoiceMutation();
  const [updatePrivacy] = useUpdatePrivacyMutation();
  const [updatePermissions] = useUpdatePermissionsMutation();

  return useCallback(
    async <S extends Section>(section: S, values: Partial<SettingsState[S]>, { silent = false } = {}) => {
      const previous = current[section];
      dispatch(updateSection({ section, values }));

      const request =
        section === 'voice'
          ? updateVoice(values)
          : section === 'privacy'
            ? updatePrivacy(values)
            : section === 'permissions'
              ? updatePermissions(values)
              : updatePreferences({ [section]: values });

      try {
        await request.unwrap();
        if (!silent) toast.success('Saved', { id: 'settings-saved', duration: 1200 });
        return true;
      } catch (err) {
        dispatch(updateSection({ section, values: previous as Partial<SettingsState[S]> }));
        dispatch(authApi.util.invalidateTags(['Settings']));
        toast.error(errorMessage(err, 'Could not save your settings.'), { id: 'settings-error' });
        return false;
      }
    },
    [current, dispatch, updatePermissions, updatePreferences, updatePrivacy, updateVoice],
  );
}
