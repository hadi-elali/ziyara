export type ProtectedRouteDecision = 'allow' | 'loading' | 'login' | 'unauthorized';
export type LoginScreenDecision = 'check-in' | 'form' | 'loading' | 'return';

export function getProtectedRouteDecision({
  admin,
  hasSession,
  isAdmin,
  isLoading,
}: {
  admin: boolean;
  hasSession: boolean;
  isAdmin: boolean;
  isLoading: boolean;
}): ProtectedRouteDecision {
  if (isLoading) {
    return 'loading';
  }

  if (!hasSession) {
    return 'login';
  }

  return admin && !isAdmin ? 'unauthorized' : 'allow';
}

export function getLoginScreenDecision({
  hasProfileError,
  hasSession,
  isAdmin,
  isAuthLoading,
  isGroupCheckBlocking,
  isGroupCheckLoading,
}: {
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

  if (!isAdmin && isGroupCheckLoading) {
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
    !hasSession ||
    (!isAuthLoading && !hasProfileError && !isGroupCheckBlocking)
  );
}
