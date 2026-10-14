import { Redirect } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import type { AppRole } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { getProtectedRouteDecision } from '@/features/auth/protected-route-policy';
import { loginRoute, type ProtectedRoutePath } from '@/features/navigation/routes';
import { useTheme } from '@/hooks/use-theme';

type RequireAuthProps = PropsWithChildren<{
  admin?: boolean;
  roles?: readonly AppRole[];
  returnTo: ProtectedRoutePath;
}>;

export function RequireAuth({ admin = false, children, returnTo, roles }: RequireAuthProps) {
  const theme = useTheme();
  const { isAdmin, isLoading, profile, session } = useAuth();
  const decision = getProtectedRouteDecision({
    admin,
    hasSession: Boolean(session),
    hasRequiredRole: !roles || Boolean(profile && roles.includes(profile.role)),
    isAdmin,
    isLoading,
  });

  if (decision === 'loading') {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      </Screen>
    );
  }

  if (decision === 'login') {
    return <Redirect href={loginRoute(returnTo)} />;
  }

  if (decision === 'unauthorized') {
    return <Redirect href="/" />;
  }

  return children;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
