export type ProtectedRouteDecision = 'allow' | 'loading' | 'login' | 'unauthorized';
export type LoginScreenDecision = 'check-in' | 'form' | 'loading' | 'onboarding' | 'return';

export function getProtectedRouteDecision({
  admin,
  hasSession,
  hasRequiredRole = true,
  isAdmin,
  isLoading,
}: {
  admin: boolean;
  hasSession: boolean;
  hasRequiredRole?: boolean;
  isAdmin: boolean;
  isLoading: boolean;
}): ProtectedRouteDecision {
  if (isLoading) {
    return 'loading';
  }

  if (!hasSession) {
    return 'login';
  }

  return (admin && !isAdmin) || !hasRequiredRole ? 'unauthorized' : 'allow';
}

export function getLoginScreenDecision({
  bypassGroupCheck = false,
  hasCompletedOnboarding,
  hasProfileError,
  hasSession,
  isAuthLoading,
  isGroupCheckBlocking,
  isGroupCheckLoading,
}: {
  bypassGroupCheck?: boolean;
  hasCompletedOnboarding: boolean;
  hasProfileError: boolean;
  hasSession: boolean;
  isAdmin: boolean;
  isAuthLoading: boolean;
  isGroupCheckBlocking: boolean;
  isGroupCheckLoading: boolean;
}): LoginScreenDecision {
  if (isAuthLoading) {
    return 'loading';
  }

  if (!hasSession) {
    return 'form';
  }

  if (hasProfileError) {
    return 'check-in';
  }

  if (bypassGroupCheck) return 'return';

  // Home and check-in stay protected until this launch's intro is complete.
  if (!hasCompletedOnboarding) return 'onboarding';

  if (isGroupCheckLoading) {
    return 'loading';
  }

  return isGroupCheckBlocking ? 'check-in' : 'return';
}

export function canAccessNonBlockingRoutes({
  hasProfileError,
  hasSession,
  isAuthLoading,
  isGroupCheckBlocking,
}: {
  hasProfileError: boolean;
  hasSession: boolean;
  isAuthLoading: boolean;
  isGroupCheckBlocking: boolean;
}) {
  return (
    hasSession && !isAuthLoading && !hasProfileError && !isGroupCheckBlocking
  );
}
