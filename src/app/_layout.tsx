import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  usePathname,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { BottomTabInset, Colors, Spacing } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { canAccessNonBlockingRoutes } from '@/features/auth/protected-route-policy';
import { BusManagementProvider } from '@/features/bus-management/bus-management-context';
import { DailyProgramProvider } from '@/features/daily-program/daily-program-context';
import { AppErrorBoundary } from '@/features/errors/AppErrorBoundary';
import { GroupCheckProvider, useGroupCheck } from '@/features/group-check/group-check-context';
import { GeneralAlarmNotificationsProvider } from '@/features/general-alarm/general-alarm-notifications-context';
import { HomeLockScreen } from '@/features/home-lock/HomeLockScreen';
import { useHomeLock } from '@/features/home-lock/use-home-lock';
import { AppI18nProvider, useI18n } from '@/features/i18n/i18n';
import { isStartupNavigationPending, isStartupRouteReady } from '@/features/navigation/startup-state';
import { useEmergencyBackNavigation } from '@/features/navigation/use-emergency-back-navigation';
import { useOnboarding } from '@/features/onboarding/onboarding-state';
import { useScreenCaptureProtection } from '@/features/privacy/use-screen-capture-protection';
import { QuestionRoundProvider } from '@/features/question-round/question-round-context';
import { AppThemeProvider, useThemeMode } from '@/features/theme/theme-mode';
import { TripGuidanceProvider } from '@/features/trip-guidance/trip-guidance-context';
import { WakeUpCallProvider } from '@/features/wake-up-call/wake-up-call-context';
import { TripGroupProvider } from '@/features/trip-groups/trip-group-context';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  useScreenCaptureProtection();

  return (
    <AppErrorBoundary>
      <AppI18nProvider>
        <AppThemeProvider>
          <AuthProvider>
            <BusManagementProvider>
              <TripGroupProvider>
                <DailyProgramProvider>
                  <WakeUpCallProvider>
                    <GeneralAlarmNotificationsProvider>
                      <TripGuidanceProvider>
                        <GroupCheckProvider>
                          <QuestionRoundProvider>
                            <RootNavigation />
                          </QuestionRoundProvider>
                        </GroupCheckProvider>
                      </TripGuidanceProvider>
                    </GeneralAlarmNotificationsProvider>
                  </WakeUpCallProvider>
                </DailyProgramProvider>
              </TripGroupProvider>
            </BusManagementProvider>
          </AuthProvider>
        </AppThemeProvider>
      </AppI18nProvider>
    </AppErrorBoundary>
  );
}

function RootNavigation() {
  const pathname = usePathname();
  const isHomeLocked = useHomeLock();
  const { loaded: isThemeLoaded, resolvedTheme: scheme } = useThemeMode();
  const colors = Colors[scheme];
  const { loaded: isLanguageLoaded, t } = useI18n();
  const { hasCompletedOnboarding, loaded: isOnboardingLoaded } = useOnboarding();
  const {
    hasProfileError,
    isAdmin,
    isLoading: isAuthLoading,
    profileRefreshError,
    refreshProfile,
    session,
  } = useAuth();
  const { activeCheck, hasSyncError, isBlocking, isLoading: isGroupCheckLoading } = useGroupCheck();
  const [hasNavigationLayout, setHasNavigationLayout] = useState(false);
  const hasHiddenSplash = useRef(false);
  const isLocalStateLoaded = isLanguageLoaded && isOnboardingLoaded && isThemeLoaded;
  const isStartupReady = isStartupRouteReady({
    hasActiveCheck: Boolean(activeCheck),
    hasCompletedOnboarding,
    hasGroupCheckError: hasSyncError,
    hasProfileError,
    hasSession: Boolean(session),
    isAdmin,
    isAuthLoading,
    isGroupCheckBlocking: isBlocking,
    isGroupCheckLoading,
    pathname,
  });
  const isStartupPending = isStartupNavigationPending({
    hasProfileError,
    hasSession: Boolean(session),
    isAdmin,
    isAuthLoading,
    isGroupCheckLoading,
  });
  const canAccessAppRoutes = !isStartupPending && canAccessNonBlockingRoutes({
    hasProfileError,
    hasSession: Boolean(session),
    isAuthLoading,
    isGroupCheckBlocking: isBlocking,
  });
  const goBackFromEmergency = useEmergencyBackNavigation(
    pathname,
    isStartupPending ? '/startup' : canAccessAppRoutes ? '/' : '/check-in',
  );

  useEffect(() => {
    if (!hasHiddenSplash.current && hasNavigationLayout && isLocalStateLoaded && isStartupReady) {
      hasHiddenSplash.current = true;
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [hasNavigationLayout, isLocalStateLoaded, isStartupReady]);

  if (!isLanguageLoaded || !isOnboardingLoaded || !isThemeLoaded) {
    return null;
  }

  const emergencyBackOptions = {
    headerBackVisible: false,
    headerLeft: () => (
      <Button
        icon="back"
        label={t('common.back')}
        onPress={goBackFromEmergency}
        size="compact"
        variant="ghost"
      />
    ),
  };

  return (
    <GestureHandlerRootView onLayout={() => setHasNavigationLayout(true)} style={{ flex: 1 }}>
      <NavigationThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerBackTitle: '',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Protected guard={isStartupPending}>
            <Stack.Screen name="startup" options={{ animation: 'none', headerShown: false }} />
          </Stack.Protected>

          <Stack.Protected guard={canAccessAppRoutes}>
            <Stack.Screen
              name="(tabs)"
              options={{ animation: 'none', headerShown: false, title: t('nav.home') }}
            />
            <Stack.Screen name="city/[city]" options={{ title: t('nav.city') }} />
            <Stack.Screen name="place/[slug]" options={{ title: t('nav.placeDetails') }} />
            <Stack.Screen name="reader/[slug]" options={{ title: t('nav.reader') }} />
            <Stack.Screen name="about" options={{ title: t('nav.about') }} />
            <Stack.Screen name="account" options={{ title: t('nav.account') }} />
            <Stack.Screen name="alarm" options={{ title: t('wakeUp.title') }} />
            <Stack.Screen name="bus" options={{ title: t('bus.navTitle') }} />
            <Stack.Screen name="group" options={{ title: t('tripGroups.navTitle') }} />
            <Stack.Screen name="program" options={{ title: t('dailyProgram.overviewTitle') }} />
            <Stack.Screen name="sources" options={{ title: t('nav.sources') }} />
            <Stack.Screen
              name="question-round"
              options={{ title: t('questionRound.navTitle') }}
            />
            <Stack.Screen
              name="question-round-management"
              options={{ title: t('questionRound.adminTitle') }}
            />
          </Stack.Protected>

          <Stack.Protected guard={!isStartupPending}>
            <Stack.Screen
              name="check-in"
              options={{ animation: 'none', headerShown: !isBlocking, title: t('groupCheck.navTitle') }}
            />
          </Stack.Protected>
          <Stack.Screen
            name="onboarding"
            options={{ headerShown: false, title: t('onboarding.title') }}
          />
          <Stack.Screen
            name="login"
            options={{ headerShown: false, title: t('auth.loginTitle') }}
          />
          <Stack.Screen
            name="register"
            options={{ headerShown: false, title: t('auth.registerTitle') }}
          />
          <Stack.Screen
            name="forgot-password"
            options={{ title: t('nav.forgotPassword') }}
          />
          <Stack.Screen
            name="reset-password"
            options={{ title: t('nav.resetPassword') }}
          />
          <Stack.Screen
            name="emergency"
            options={{ ...emergencyBackOptions, title: t('emergency.navTitle') }}
          />
          <Stack.Screen
            name="emergency-dashboard"
            options={{ ...emergencyBackOptions, title: t('emergencyDashboard.navTitle') }}
          />
          <Stack.Screen name="admin" options={{ title: t('nav.admin') }} />
        </Stack>
      </NavigationThemeProvider>

      {profileRefreshError && !isBlocking ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[
            styles.profileRefreshError,
            { backgroundColor: colors.warningSoft, borderColor: colors.warning },
          ]}>
          <ThemedText style={styles.profileRefreshErrorText} themeColor="warning" type="small">
            {profileRefreshError.message}
          </ThemedText>
          <Button
            icon="refresh"
            label={t('auth.profileRetry')}
            onPress={() => void refreshProfile()}
            variant="secondary"
          />
        </View>
      ) : null}
      <HomeLockScreen locked={isHomeLocked && canAccessAppRoutes} pathname={pathname} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  profileRefreshError: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: BottomTabInset + Spacing.three,
    flexDirection: 'row',
    gap: Spacing.two,
    left: Spacing.three,
    marginHorizontal: 'auto',
    maxWidth: 640,
    padding: Spacing.two,
    position: 'absolute',
    right: Spacing.three,
    zIndex: 10,
  },
  profileRefreshErrorText: {
    flex: 1,
  },
});
