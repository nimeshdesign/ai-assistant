import { combineReducers, configureStore, type Middleware } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { useDispatch, useSelector } from 'react-redux';
import { api } from './api';
import { persistUi, uiSlice } from './uiSlice';
import { settingsSlice } from './settingsSlice';
import { authSlice, signedOut } from './authSlice';

const rootReducer = combineReducers({
  [api.reducerPath]: api.reducer,
  auth: authSlice.reducer,
  ui: uiSlice.reducer,
  settings: settingsSlice.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/**
 * On every sign-out path (logout, failed refresh, account deletion) drop all cached server
 * data, so the next person to sign in on this browser never sees the previous user's data.
 */
const clearOnSignOut: Middleware = (storeApi) => (next) => (action) => {
  const result = next(action);
  if (signedOut.match(action)) storeApi.dispatch(api.util.resetApiState());
  return result;
};

export function makeStore(preloadedState?: Partial<RootState>) {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) =>
      getDefault({
        // Transcription requests carry the recording (a Blob) as their argument.
        serializableCheck: {
          ignoredActionPaths: ['meta.arg.originalArgs.audio', 'meta.baseQueryMeta'],
          ignoredPaths: [/^api\.mutations\.[^.]+\.originalArgs\.audio$/],
        },
      }).concat(api.middleware, clearOnSignOut),
  });
  setupListeners(store.dispatch);

  // Persist UI preferences (theme, sidebar) locally so they apply before sign-in.
  // Account settings are saved on the server, not in localStorage.
  let lastUi = store.getState().ui;
  store.subscribe(() => {
    const ui = store.getState().ui;
    if (ui !== lastUi) {
      lastUi = ui;
      persistUi(ui);
    }
  });
  return store;
}

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
