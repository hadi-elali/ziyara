type StartupState = {
  hasActiveCheck: boolean;
  hasCompletedOnboarding: boolean;
  hasGroupCheckError: boolean;
  hasProfileError: boolean;
  hasSession: boolean;
  isAdmin: boolean;
  isAuthLoading: boolean;
  isGroupCheckBlocking: boolean;
  isGroupCheckLoading: boolean;
  pathname: string;
};

export function isStartupNavigationPending(state: Pick<StartupState,
  'hasProfileError' | 'hasSession' | 'isAdmin' | 'isAuthLoading' | 'isGroupCheckLoading'
>): boolean {
  return state.isAuthLoading || (
    state.hasSession && !state.isAdmin && !state.hasProfileError && state.isGroupCheckLoading
  );
}

/** Keep transient startup redirects behind the native splash screen. */
export function isStartupRouteReady(state: StartupState): boolean {
  const { pathname } = state;

  if (pathname === '/startup') return false;

  // These public entry points do not depend on the profile or group check.
  if (['/onboarding', '/forgot-password', '/reset-password'].includes(pathname)) {
    return true;
  }

  if (state.isAuthLoading) return false;

  if (['/login', '/register'].includes(pathname)) return !state.hasSession;

  // Keep notification and deep-link emergency entry available during a check.
  if (['/emergency', '/emergency-dashboard'].includes(pathname)) return true;

  if (pathname === '/check-in') {
    if (!state.hasSession) return false; // RequireAuth is about to open login.
    if (state.hasProfileError) return true;
    if (state.isGroupCheckLoading) return false;
    return state.hasActiveCheck || state.hasGroupCheckError;
  }

  if (state.hasSession) {
    if (state.hasProfileError || state.isGroupCheckBlocking) return false;
    return state.isAdmin || !state.isGroupCheckLoading;
  }

  // The tab layout redirects a fresh installation to language selection.
  const isTab = ['/', '/map', '/search', '/bookmarks', '/settings'].includes(pathname);
  return !isTab || state.hasCompletedOnboarding;
}
