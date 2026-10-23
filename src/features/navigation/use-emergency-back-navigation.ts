import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

type EmergencyBackFallback = '/' | '/check-in' | '/startup';

/** A notification can leave an emergency screen as the only route after startup guards settle. */
export function useEmergencyBackNavigation(pathname: string, fallback: EmergencyBackFallback) {
  const router = useRouter();
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback);
    }
  }, [fallback, router]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !['/emergency', '/emergency-dashboard'].includes(pathname)) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // Leave existing stack history to the navigator's normal back handling.
      if (router.canGoBack()) return false;
      goBack();
      return true;
    });

    return () => subscription.remove();
  }, [goBack, pathname, router]);

  return goBack;
}
