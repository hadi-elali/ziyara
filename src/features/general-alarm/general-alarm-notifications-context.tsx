import { useRouter } from 'expo-router';
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
import { useBusManagement } from '@/features/bus-management/bus-management-context';
import {
  cancelGeneralAlarmReminders,
  inspectGeneralAlarmNotificationState,
  openGeneralAlarmNotificationSettings,
  registerGeneralAlarmNotifications,
  subscribeToEmergencyDashboardNotificationResponses,
  subscribeToEmergencyNotificationResponses,
  subscribeToGeneralAlarmNotificationResponses,
  syncGeneralAlarmReminders,
  unregisterGeneralAlarmNotifications,
} from '@/features/general-alarm/general-alarm-notifications';
import type { GeneralAlarmNotificationState } from '@/features/general-alarm/general-alarm-notifications.types';
import { buildGeneralAlarmReminderPlans } from '@/features/general-alarm/general-alarm-reminders';
import { useNotificationsDisabled } from '@/features/general-alarm/useNotificationPreference';
import { useI18n } from '@/features/i18n/i18n';
import { emergencyDashboardRoute, emergencyRoute } from '@/features/navigation/routes';
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
  const { isAdmin, session } = useAuth();
  const { activeBoarding, participants } = useBusManagement();
  const { language, t } = useI18n();
  const [notificationsDisabled, setNotificationsDisabled, preferenceLoaded] =
    useNotificationsDisabled();
  const [notificationState, setNotificationState] = useState(initialState);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    const busSubscription = subscribeToGeneralAlarmNotificationResponses(() => {
      router.push('/bus');
    });
    const emergencySubscription = subscribeToEmergencyNotificationResponses(() => {
      router.push(emergencyRoute());
    });
    const emergencyDashboardSubscription =
      subscribeToEmergencyDashboardNotificationResponses(() => {
        router.push(emergencyDashboardRoute());
      });
    return () => {
      busSubscription.remove();
      emergencyDashboardSubscription.remove();
      emergencySubscription.remove();
    };
  }, [router]);

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
    if (
      !session?.user.id ||
      isAdmin ||
      notificationsDisabled ||
      !notificationState.permissionGranted ||
      !activeBoarding
    ) {
      void cancelGeneralAlarmReminders();
      return;
    }

    const plans = buildGeneralAlarmReminderPlans(activeBoarding, participants);
    const reminders = plans.flatMap((plan) =>
      plan.fireDates.map((fireDate) => ({
        boardingId: plan.boardingId,
        body: t(`generalAlarm.notification.reminder.${plan.nextStatus}`, {
          name: plan.participantName,
        }),
        fireDate,
        nextStatus: plan.nextStatus,
        participantId: plan.participantId,
        title: t('generalAlarm.notification.title'),
      })),
    );

    void syncGeneralAlarmReminders(reminders).catch((error) => {
      setNotificationState((current) => ({
        availability: 'error',
        errorMessage: getOriginalErrorMessage(error),
        permissionGranted: current.permissionGranted,
      }));
    });
  }, [
    activeBoarding,
    isAdmin,
    notificationState.permissionGranted,
    notificationsDisabled,
    participants,
    session?.user.id,
    t,
  ]);

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
        Boolean(session?.user.id) && effectiveNotificationState.permissionGranted,
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
