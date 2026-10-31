import { useRootNavigationState, useRouter } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useAuth } from '@/features/auth/auth-context';
import {
  cancelGeneralAlarmReminders,
  inspectGeneralAlarmNotificationState,
  openGeneralAlarmNotificationSettings,
  registerGeneralAlarmNotifications,
  subscribeToDailyProgramNotificationResponses,
  subscribeToEmergencyDashboardNotificationResponses,
  subscribeToEmergencyNotificationResponses,
  subscribeToGeneralAlarmNotificationResponses,
  subscribeToGroupLocationNotificationResponses,
  subscribeToQuestionRoundNotificationResponses,
  subscribeToWakeUpCallNotificationResponses,
  unregisterGeneralAlarmNotifications,
} from '@/features/general-alarm/general-alarm-notifications';
import type { GeneralAlarmNotificationState } from '@/features/general-alarm/general-alarm-notifications.types';
import { useNotificationsDisabled } from '@/features/general-alarm/useNotificationPreference';
import { useI18n } from '@/features/i18n/i18n';
import type { ProtectedRoutePath } from '@/features/navigation/routes';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';

type GeneralAlarmNotificationsContextValue = GeneralAlarmNotificationState & {
  disable: () => Promise<void>;
  enable: () => Promise<void>;
  enabled: boolean;
  isWorking: boolean;
  openSettings: () => Promise<void>;
  unregisterDevice: () => Promise<void>;
};

const initialState: GeneralAlarmNotificationState = {
  availability: 'checking',
  permissionGranted: false,
};
const disabledState: GeneralAlarmNotificationState = {
  availability: 'disabled',
  permissionGranted: false,
};

const GeneralAlarmNotificationsContext =
  createContext<GeneralAlarmNotificationsContextValue | null>(null);

export function GeneralAlarmNotificationsProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { isLoading: isAuthLoading, session } = useAuth();
  const { language } = useI18n();
  const [notificationsDisabled, setNotificationsDisabled, preferenceLoaded] =
    useNotificationsDisabled();
  const [notificationState, setNotificationState] = useState(initialState);
  const [isWorking, setIsWorking] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<ProtectedRoutePath | null>(null);

  useEffect(() => {
    const groupLocationSubscription = subscribeToGroupLocationNotificationResponses(() => {
      setPendingRoute('/group');
    });
    const programSubscription = subscribeToDailyProgramNotificationResponses(() => {
      setPendingRoute('/program');
    });
    const questionRoundSubscription = subscribeToQuestionRoundNotificationResponses(() => {
      setPendingRoute('/question-round');
    });
    const wakeUpSubscription = subscribeToWakeUpCallNotificationResponses(() => {
      setPendingRoute('/alarm');
    });
    const busSubscription = subscribeToGeneralAlarmNotificationResponses(() => {
      setPendingRoute('/bus');
    });
    const emergencySubscription = subscribeToEmergencyNotificationResponses(() => {
      setPendingRoute('/emergency');
    });
    const emergencyDashboardSubscription =
      subscribeToEmergencyDashboardNotificationResponses(() => {
        setPendingRoute('/emergency-dashboard');
      });
    return () => {
      groupLocationSubscription.remove();
      programSubscription.remove();
      questionRoundSubscription.remove();
      wakeUpSubscription.remove();
      busSubscription.remove();
      emergencyDashboardSubscription.remove();
      emergencySubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!rootNavigationState?.key || isAuthLoading || !pendingRoute) return;
    router.push(pendingRoute);
    setPendingRoute(null);
  }, [isAuthLoading, pendingRoute, rootNavigationState?.key, router]);

  useEffect(() => {
    let isActive = true;

    if (!session?.user.id || !preferenceLoaded) {
      void cancelGeneralAlarmReminders();
      return () => {
        isActive = false;
      };
    }

    if (notificationsDisabled) {
      void cancelGeneralAlarmReminders();
      return () => {
        isActive = false;
      };
    }

    void inspectGeneralAlarmNotificationState().then(async (state) => {
      if (!isActive) return;
      setNotificationState(state);

      if (state.permissionGranted) {
        const registered = await registerGeneralAlarmNotifications(language, false);
        if (isActive) setNotificationState(registered);
      }
    });

    return () => {
      isActive = false;
    };
  }, [language, notificationsDisabled, preferenceLoaded, session?.user.id]);

  useEffect(() => {
    // Remove reminders scheduled by earlier app versions after boarding removal.
    void cancelGeneralAlarmReminders();
  }, [session?.user.id]);

  const enable = useCallback(async () => {
    if (isWorking) return;
    setIsWorking(true);
    const state = await registerGeneralAlarmNotifications(language, true);
    setNotificationState(state);
    if (state.permissionGranted) {
      setNotificationsDisabled(false);
    }
    setIsWorking(false);
  }, [isWorking, language, setNotificationsDisabled]);

  const disable = useCallback(async () => {
    if (isWorking) return;
    setIsWorking(true);

    try {
      await unregisterGeneralAlarmNotifications();
      setNotificationsDisabled(true);
      setNotificationState(disabledState);
    } catch (error) {
      setNotificationState((current) => ({
        availability: 'error',
        errorMessage: getOriginalErrorMessage(error),
        permissionGranted: current.permissionGranted,
      }));
    } finally {
      setIsWorking(false);
    }
  }, [isWorking, setNotificationsDisabled]);

  const unregisterDevice = useCallback(async () => {
    try {
      await unregisterGeneralAlarmNotifications();
    } catch {
      // Signing out must not be blocked by a best-effort device cleanup.
    } finally {
      setNotificationState(
        notificationsDisabled ? disabledState : initialState,
      );
    }
  }, [notificationsDisabled]);

  const effectiveNotificationState = notificationsDisabled
    ? disabledState
    : notificationState;

  const value = useMemo<GeneralAlarmNotificationsContextValue>(
    () => ({
      ...effectiveNotificationState,
      disable,
      enable,
      enabled:
        Boolean(session?.user.id) &&
        effectiveNotificationState.availability === 'registered' &&
        effectiveNotificationState.permissionGranted,
      isWorking,
      openSettings: openGeneralAlarmNotificationSettings,
      unregisterDevice,
    }),
    [
      disable,
      effectiveNotificationState,
      enable,
      isWorking,
      session?.user.id,
      unregisterDevice,
    ],
  );

  return (
    <GeneralAlarmNotificationsContext.Provider value={value}>
      {children}
    </GeneralAlarmNotificationsContext.Provider>
  );
}

export function useGeneralAlarmNotifications() {
  const value = useContext(GeneralAlarmNotificationsContext);
  if (!value) {
    throw new Error(
      'useGeneralAlarmNotifications must be used inside GeneralAlarmNotificationsProvider.',
    );
  }
  return value;
}
