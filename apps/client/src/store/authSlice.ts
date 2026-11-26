import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthResponse, AuthUser } from '@aia/shared';

/**
 * The access token lives only in memory (never localStorage) so XSS can't read a
 * persisted copy. On page load we restore the session through the httpOnly refresh cookie.
 */
interface AuthState {
  status: 'checking' | 'authenticated' | 'unauthenticated';
  user: AuthUser | null;
  accessToken: string | null;
}

const initialState: AuthState = { status: 'checking', user: null, accessToken: null };

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    credentialsReceived(state, action: PayloadAction<AuthResponse>) {
      state.status = 'authenticated';
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
    },
    userUpdated(state, action: PayloadAction<Partial<AuthUser>>) {
      if (state.user) Object.assign(state.user, action.payload);
    },
    signedOut: () => ({ ...initialState, status: 'unauthenticated' as const }),
  },
});

export const { credentialsReceived, userUpdated, signedOut } = authSlice.actions;
