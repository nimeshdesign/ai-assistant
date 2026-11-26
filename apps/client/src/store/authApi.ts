import type {
  AuthResponse,
  AuthSessionView,
  AuthUser,
  ChangePasswordInput,
  LoginInput,
  ProfileUpdateInput,
  ProfileView,
  RegisterInput,
  SettingsView,
} from '@aia/shared';
import type { z } from 'zod';
import type { permissionsUpdateSchema, preferencesUpdateSchema, privacyUpdateSchema, voiceUpdateSchema } from '@aia/shared';
import { api } from './api';
import { credentialsReceived, signedOut, userUpdated } from './authSlice';

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    // ---------- Auth ----------
    register: build.mutation<AuthResponse, RegisterInput>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({ data: null }));
        if (data) dispatch(credentialsReceived(data));
      },
    }),
    login: build.mutation<AuthResponse, LoginInput>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({ data: null }));
        if (data) dispatch(credentialsReceived(data));
      },
    }),
    /** Restore a session from the refresh cookie (used on app start). */
    restoreSession: build.mutation<AuthResponse, void>({
      query: () => ({ url: '/auth/refresh', method: 'POST' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          dispatch(credentialsReceived((await queryFulfilled).data));
        } catch {
          dispatch(signedOut());
        }
      },
    }),
    logout: build.mutation<void, { everywhere?: boolean } | void>({
      query: (arg) => ({ url: arg && arg.everywhere ? '/auth/logout-all' : '/auth/logout', method: 'POST' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        // Sign out locally even if the network call fails.
        await queryFulfilled.catch(() => undefined);
        dispatch(signedOut()); // also clears cached API data (see store middleware)
      },
    }),
    me: build.query<AuthUser, void>({ query: () => '/auth/me', providesTags: ['Me'] }),

    // ---------- Profile & account ----------
    getProfile: build.query<ProfileView, void>({ query: () => '/users/me/profile', providesTags: ['Profile'] }),
    updateProfile: build.mutation<ProfileView, Partial<ProfileUpdateInput>>({
      query: (body) => ({ url: '/users/me/profile', method: 'PATCH', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({ data: null }));
        if (data) {
          dispatch(userUpdated({ name: data.name }));
          dispatch(authApi.util.upsertQueryData('getProfile', undefined, data));
        }
      },
    }),
    changePassword: build.mutation<{ otherSessionsSignedOut: number }, ChangePasswordInput>({
      query: (body) => ({ url: '/users/me/password', method: 'PATCH', body }),
      invalidatesTags: ['Sessions'],
    }),
    deleteAccount: build.mutation<void, { password: string }>({
      query: (body) => ({ url: '/users/me', method: 'DELETE', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch {
          return; // e.g. wrong password: the dialog shows the error, the user stays signed in
        }
        dispatch(signedOut()); // also clears cached API data (see store middleware)
      },
    }),
    getSessions: build.query<AuthSessionView[], void>({ query: () => '/users/me/sessions', providesTags: ['Sessions'] }),
    revokeSession: build.mutation<void, string>({
      query: (id) => ({ url: `/users/me/sessions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Sessions'],
    }),

    // ---------- Settings ----------
    getSettings: build.query<SettingsView, void>({ query: () => '/settings', providesTags: ['Settings'] }),
    updatePreferences: build.mutation<SettingsView, z.infer<typeof preferencesUpdateSchema>>({
      query: (body) => ({ url: '/settings/preferences', method: 'PATCH', body }),
      async onQueryStarted(_arg, lifecycle) {
        await syncSettings(lifecycle);
      },
    }),
    updateVoice: build.mutation<SettingsView, z.infer<typeof voiceUpdateSchema>>({
      query: (body) => ({ url: '/settings/voice', method: 'PATCH', body }),
      async onQueryStarted(_arg, lifecycle) {
        await syncSettings(lifecycle);
      },
    }),
    updatePrivacy: build.mutation<SettingsView, z.infer<typeof privacyUpdateSchema>>({
      query: (body) => ({ url: '/settings/privacy', method: 'PATCH', body }),
      async onQueryStarted(_arg, lifecycle) {
        await syncSettings(lifecycle);
      },
    }),
    updatePermissions: build.mutation<SettingsView, z.infer<typeof permissionsUpdateSchema>>({
      query: (body) => ({ url: '/settings/permissions', method: 'PATCH', body }),
      async onQueryStarted(_arg, lifecycle) {
        await syncSettings(lifecycle);
      },
    }),
  }),
});

/** Keep the cached GET /settings in sync with the server's response to a PATCH. */
async function syncSettings({
  dispatch,
  queryFulfilled,
}: {
  dispatch: (a: unknown) => unknown;
  queryFulfilled: Promise<{ data: SettingsView }>;
}) {
  const res = await queryFulfilled.catch(() => null);
  if (res) dispatch(authApi.util.upsertQueryData('getSettings', undefined, res.data));
}

export const {
  useRegisterMutation,
  useLoginMutation,
  useRestoreSessionMutation,
  useLogoutMutation,
  useGetProfileQuery,
  useUpdateProfileMutation,
  useChangePasswordMutation,
  useDeleteAccountMutation,
  useGetSessionsQuery,
  useRevokeSessionMutation,
  useGetSettingsQuery,
  useUpdatePreferencesMutation,
  useUpdateVoiceMutation,
  useUpdatePrivacyMutation,
  useUpdatePermissionsMutation,
} = authApi;
