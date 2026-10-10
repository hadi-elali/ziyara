import { Redirect, type Href, useLocalSearchParams } from 'expo-router';

import { AuthFormScreen } from '@/features/auth/AuthFormScreen';
import { useAuth } from '@/features/auth/auth-context';
import { useGroupCheck } from '@/features/group-check/group-check-context';
import { bypassesGroupCheck, checkInRoute, getProtectedReturnRoute } from '@/features/navigation/routes';

export default function RegisterScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const { session } = useAuth();
  const { isBlocking } = useGroupCheck();
  const safeReturnTo = getProtectedReturnRoute(returnTo);

  if (session) {
    if (isBlocking && !bypassesGroupCheck(safeReturnTo)) {
      return (
        <Redirect
          href={checkInRoute(safeReturnTo === '/check-in' ? '/' : safeReturnTo)}
        />
      );
    }

    return <Redirect href={safeReturnTo as Href} />;
  }

  return (
    <AuthFormScreen
      mode="register"
      returnTo={safeReturnTo === '/' ? undefined : safeReturnTo}
    />
  );
}
