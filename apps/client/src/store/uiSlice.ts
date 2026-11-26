import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { authApi } from './authApi';
import type { Theme } from '@aia/shared';

export const THEME_STORAGE_KEY = 'aia.theme';
const SIDEBAR_STORAGE_KEY = 'aia.sidebarCollapsed';

function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
}

const initialState: UiState = {
  theme: read<Theme>(THEME_STORAGE_KEY, 'system'),
  sidebarCollapsed: read<string>(SIDEBAR_STORAGE_KEY, 'false') === 'true',
  mobileNavOpen: false,
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
    },
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setMobileNavOpen(state, action: PayloadAction<boolean>) {
      state.mobileNavOpen = action.payload;
    },
  },
  extraReducers: (builder) => {
    // The saved theme follows the account across devices.
    builder.addMatcher(authApi.endpoints.getSettings.matchFulfilled, (state, { payload }) => {
      state.theme = payload.theme;
    });
  },
});

export const { setTheme, toggleSidebar, setMobileNavOpen } = uiSlice.actions;
export const persistUi = (state: UiState) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, state.theme);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(state.sidebarCollapsed));
  } catch {
    /* storage unavailable (private mode) – ignore */
  }
};
