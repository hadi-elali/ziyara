import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  usePathname,
  useRouter,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { BottomTabInset, Colors, Spacing } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { BusManagementProvider } from '@/features/bus-management/bus-management-context';
import { DailyProgramProvider } from '@/features/daily-program/daily-program-context';
import { AppErrorBoundary } from '@/features/errors/AppErrorBoundary';
import { GroupCheckProvider, useGroupCheck } from '@/features/group-check/group-check-context';
import { GeneralAlarmNotificationsProvider } from '@/features/general-alarm/general-alarm-notifications-context';
import { AppI18nProvider, useI18n } from '@/features/i18n/i18n';
import { supabaseReadFailureTranslationKey } from '@/features/network/supabase-read';
import { emergencyRoute } from '@/features/navigation/routes';
import { useOnboarding } from '@/features/onboarding/onboarding-state';
import { QuestionRoundProvider } from '@/features/question-round/question-round-context';
import { AppThemeProvider, useThemeMode } from '@/features/theme/theme-mode';
import { TripGuidanceProvider } from '@/features/trip-guidance/trip-guidance-context';
import { TripGroupProvider } from '@/features/trip-groups/trip-group-context';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <AppI18nProvider>
        <AppThemeProvider>
          <AuthProvider>
            <BusManagementProvider>
              <TripGroupProvider>
                <DailyProgramProvider>
                  <GeneralAlarmNotificationsProvider>
                    <TripGuidanceProvider>
                      <GroupCheckProvider>
                        <QuestionRoundProvider>
                          <RootNavigation />
                        </QuestionRoundProvider>
                      </GroupCheckProvider>
                    </TripGuidanceProvider>
                  </GeneralAlarmNotificationsProvider>
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
  const router = useRouter();
  const { loaded: isThemeLoaded, resolvedTheme: scheme } = useThemeMode();
  const colors = Colors[scheme];
  const { loaded: isLanguageLoaded, t } = useI18n();
  const { loaded: isOnboardingLoaded } = useOnboarding();
  const { profileSyncErrorKind, refreshProfile, session } = useAuth();
  const { isBlocking } = useGroupCheck();

  useEffect(() => {
    if (isLanguageLoaded && isOnboardingLoaded && isThemeLoaded) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [isLanguageLoaded, isOnboardingLoaded, isThemeLoaded]);

  if (!isLanguageLoaded || !isOnboardingLoaded || !isThemeLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerBackTitle: '',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen
            name="check-in"
            options={{ headerShown: !isBlocking, title: t('groupCheck.navTitle') }}
          />
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

          <Stack.Protected guard={!isBlocking}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('nav.home') }} />
            <Stack.Screen name="city/[city]" options={{ title: t('nav.city') }} />
            <Stack.Screen name="place/[slug]" options={{ title: t('nav.placeDetails') }} />
            <Stack.Screen name="reader/[slug]" options={{ title: t('nav.reader') }} />
            <Stack.Screen name="about" options={{ title: t('nav.about') }} />
            <Stack.Screen name="account" options={{ title: t('nav.account') }} />
            <Stack.Screen name="bus" options={{ title: t('bus.navTitle') }} />
            <Stack.Screen
              name="emergency-dashboard"
              options={{ title: t('emergencyDashboard.navTitle') }}
            />
            <Stack.Screen name="group" options={{ title: t('tripGroups.navTitle') }} />
            <Stack.Screen name="guide" options={{ title: t('guide.navTitle') }} />
            <Stack.Screen name="program" options={{ title: t('dailyProgram.weekTitle') }} />
            <Stack.Screen name="sources" options={{ title: t('nav.sources') }} />
            <Stack.Screen
              name="question-round"
              options={{ title: t('questionRound.navTitle') }}
            />
          </Stack.Protected>

          <Stack.Screen name="emergency" options={{ title: t('emergency.navTitle') }} />
          <Stack.Screen name="admin" options={{ title: t('nav.admin') }} />
        </Stack>
      </NavigationThemeProvider>
      {session && pathname === '/' ? (
        <Pressable
          accessibilityLabel={t('emergency.homeButton')}
          accessibilityRole="button"
          onPress={() => router.push(emergencyRoute())}
          style={({ pressed }) => [
            styles.emergencyButton,
            {
              backgroundColor: colors.danger,
              borderColor: colors.surface,
              shadowColor: colors.text,
            },
            pressed && styles.emergencyButtonPressed,
          ]}>
          <SymbolIcon color={colors.surface} name="alarm" size={25} />
        </Pressable>
      ) : null}
      {profileSyncErrorKind && !isBlocking ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[
            styles.profileRefreshError,
            { backgroundColor: colors.warningSoft, borderColor: colors.warning },
          ]}>
          <ThemedText style={styles.profileRefreshErrorText} themeColor="warning" type="small">
            {t(supabaseReadFailureTranslationKey(profileSyncErrorKind))}
          </ThemedText>
          <Button
            icon="refresh"
            label={t('auth.profileRetry')}
            onPress={() => void refreshProfile()}
            variant="secondary"
          />
        </View>
      ) : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  emergencyButton: {
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 2,
    elevation: 6,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    right: Spacing.three,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    top: '50%',
    transform: [{ translateY: -26 }],
    width: 52,
    zIndex: 20,
  },
  emergencyButtonPressed: {
    opacity: 0.72,
    transform: [{ translateY: -26 }, { scale: 0.96 }],
  },
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
