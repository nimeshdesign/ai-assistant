import { createSlice, isAnyOf, type PayloadAction } from '@reduxjs/toolkit';
import type { ProfileView, SettingsView } from '@aia/shared';
import { authApi } from './authApi';
import { signedOut } from './authSlice';

/**
 * Client mirror of the signed-in user's `user_profiles` + `user_settings` (minus theme,
 * which lives in the ui slice). The server is the source of truth: this slice is hydrated
 * from GET /settings and GET /users/me/profile, updated optimistically by
 * `useUpdateSettings`, and reset on sign-out.
 */
export type SettingsState = { profile: ProfileView } & Omit<SettingsView, 'theme'>;

export const DEFAULT_SETTINGS: SettingsState = {
  profile: {
    name: '',
    headline: '',
    targetRole: '',
    experienceLevel: 'junior',
    yearsOfExperience: 0,
    preferredLanguages: [],
  },
  answer: { style: 'conversational', length: 'normal', includeCodeExamples: true, codeLanguage: 'javascript' },
  voice: {
    voiceName: '',
    rate: 1,
    pitch: 1,
    autoSpeakAnswers: false,
    sttLanguage: 'en-US',
    sttEngine: 'server',
    ttsEngine: 'browser',
    aiVoice: 'alloy',
  },
  ai: { model: '', temperature: 0.4 },
  assistant: { captureIntervalMs: 3000, autoGenerateAnswers: true },
  privacy: { saveHistory: true, retentionDays: 90, storeRawAudio: false, storeScreenshots: false },
  permissions: { screenCapture: false, microphone: false },
};

export type SettingsSection = keyof SettingsState;

export const settingsSlice = createSlice({
  name: 'settings',
  initialState: DEFAULT_SETTINGS,
  reducers: {
    updateSection<S extends SettingsSection>(
      state: SettingsState,
      action: PayloadAction<{ section: S; values: Partial<SettingsState[S]> }>,
    ) {
      Object.assign(state[action.payload.section], action.payload.values);
    },
  },
  extraReducers: (builder) => {
    builder
      .addMatcher(
        isAnyOf(
          authApi.endpoints.getSettings.matchFulfilled,
          authApi.endpoints.updatePreferences.matchFulfilled,
          authApi.endpoints.updateVoice.matchFulfilled,
          authApi.endpoints.updatePrivacy.matchFulfilled,
          authApi.endpoints.updatePermissions.matchFulfilled,
        ),
        (state, { payload }) => {
          const { theme: _theme, ...rest } = payload;
          return { ...state, ...rest };
        },
      )
      .addMatcher(
        isAnyOf(authApi.endpoints.getProfile.matchFulfilled, authApi.endpoints.updateProfile.matchFulfilled),
        (state, { payload }) => {
          state.profile = payload;
        },
      )
      .addMatcher(signedOut.match, () => DEFAULT_SETTINGS);
  },
});

export const { updateSection } = settingsSlice.actions;
