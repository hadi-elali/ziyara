import { Redirect, type Href, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthFormScreen } from '@/features/auth/AuthFormScreen';
import { useAuth } from '@/features/auth/auth-context';
import { getLoginScreenDecision } from '@/features/auth/protected-route-policy';
import { useGroupCheck } from '@/features/group-check/group-check-context';
import { checkInRoute, getProtectedReturnRoute } from '@/features/navigation/routes';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const theme = useTheme();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const {
    hasProfileError,
    isAdmin,
    isLoading: isAuthLoading,
    session,
  } = useAuth();
  const { isBlocking, isLoading: isGroupCheckLoading } = useGroupCheck();
  const safeReturnTo = getProtectedReturnRoute(returnTo);
  const decision = getLoginScreenDecision({
    hasProfileError,
    hasSession: Boolean(session),
    isAdmin,
    isAuthLoading,
    isGroupCheckBlocking: isBlocking,
    isGroupCheckLoading,
  });

  if (decision === 'loading') {
    return (
      <SafeAreaView style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </SafeAreaView>
    );
  }

  if (decision === 'check-in') {
    return (
      <Redirect
        href={checkInRoute(safeReturnTo === '/check-in' ? '/' : safeReturnTo)}
      />
    );
  }

  if (decision === 'return') {
    return <Redirect href={safeReturnTo as Href} />;
  }

  return (
    <AuthFormScreen
      mode="login"
      returnTo={safeReturnTo === '/' ? undefined : safeReturnTo}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
