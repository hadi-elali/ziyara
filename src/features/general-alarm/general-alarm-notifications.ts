import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Linking, Platform } from 'react-native';

import type { NotificationResponse } from 'expo-notifications';

import type { Language } from '@/features/i18n/i18n';
import { supabase } from '@/features/auth/supabase';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import type {
  GeneralAlarmNotificationState,
  NotificationResponseSubscription,
  ScheduledGeneralAlarmReminder,
} from '@/features/general-alarm/general-alarm-notifications.types';

const channelId = 'general-alarm';
const wakeUpChannelId = 'wake-up-calls-v2';
const pushTokenStorageKey = 'ziyara.general-alarm.expo-push-token';
const reminderKind = 'general_alarm_reminder';
const runsInExpoGo = isRunningInExpoGo();
type NotificationsModule = typeof import('expo-notifications');
const Notifications: NotificationsModule | null = runsInExpoGo
  ? null
  // Expo Go throws while evaluating the package on Android, so this must stay conditional.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  : require('expo-notifications');
const expoGoState: GeneralAlarmNotificationState = {
  availability: 'expo_go',
  permissionGranted: false,
};

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId() {
  const configuredProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof configuredProjectId === 'string'
    ? configuredProjectId
    : Constants.easConfig?.projectId;
}

async function ensureAndroidChannels(): Promise<typeof wakeUpChannelId | undefined> {
  if (Platform.OS !== 'android' || !Notifications) return;

  // Keep v1 for older dispatchers and clients during the rollout.
  await Notifications.setNotificationChannelAsync('wake-up-calls-v1', {
    description: 'Weckrufe der Reiseleitung',
    enableVibrate: true,
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    name: 'Weckrufe',
    showBadge: true,
    sound: 'weckruf.wav',
    vibrationPattern: [0, 300, 180, 300],
  });
  const previous = await Notifications.getNotificationChannelAsync('wake-up-calls-v1');
  // Vibration patterns are immutable too. Preserve disabled vibration, muted
  // channels and the other exposed user preferences when creating v2.
  const wakeUpChannel = await Notifications.setNotificationChannelAsync(wakeUpChannelId, {
    audioAttributes: previous?.audioAttributes,
    bypassDnd: previous?.bypassDnd ?? false,
    description: 'Weckrufe der Reiseleitung mit längeren Vibrationsimpulsen',
    enableLights: previous?.enableLights ?? false,
    enableVibrate: previous?.enableVibrate ?? true,
    groupId: previous?.groupId,
    importance: previous?.importance ?? Notifications.AndroidImportance.HIGH,
    lightColor: previous?.lightColor,
    lockscreenVisibility: previous?.lockscreenVisibility ?? Notifications.AndroidNotificationVisibility.PUBLIC,
    name: 'Weckrufe',
    showBadge: previous?.showBadge ?? true,
    sound: previous && previous.sound !== 'custom' ? previous.sound : 'weckruf.wav',
    vibrationPattern: [0, 800, 250, 800, 250, 800, 250, 800],
  });
  await Notifications.setNotificationChannelAsync(channelId, {
    description: 'Weckrufe und Erinnerungen der Reiseleitung',
    enableVibrate: true,
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    name: 'Erinnerungen der Reiseleitung',
    showBadge: true,
    sound: 'default',
    vibrationPattern: [0, 300, 180, 300],
  });
  await Notifications.setNotificationChannelAsync('emergency-alerts', {
    description: 'Dringende Hilfeanfragen an das medizinische Team oder Reiseteam',
    enableVibrate: true,
    importance: Notifications.AndroidImportance.MAX,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    name: 'Notfallmeldungen',
    showBadge: true,
    sound: 'default',
    vibrationPattern: [0, 450, 180, 450],
  });
  return wakeUpChannel?.id === wakeUpChannelId ? wakeUpChannelId : undefined;
}

export async function inspectGeneralAlarmNotificationState(): Promise<GeneralAlarmNotificationState> {
  if (!Notifications) return expoGoState;

  try {
    await ensureAndroidChannels();
    const permission = await Notifications.getPermissionsAsync();

    if (!permission.granted) {
      return { availability: 'denied', permissionGranted: false };
    }

    if (!Device.isDevice) {
      return { availability: 'simulator', permissionGranted: true };
    }

    if (!getProjectId()) {
      return { availability: 'missing_project_id', permissionGranted: true };
    }

    // Device permission alone does not confirm server registration.
    return { availability: 'checking', permissionGranted: true };
  } catch (error) {
    return {
      availability: 'error',
      errorMessage: getOriginalErrorMessage(error),
      permissionGranted: false,
    };
  }
}

export async function registerGeneralAlarmNotifications(
  language: Language,
  requestPermission: boolean,
): Promise<GeneralAlarmNotificationState> {
  if (!Notifications) return expoGoState;

  let permissionGranted = false;

  try {
    const registeredWakeUpChannel = await ensureAndroidChannels();
    let permission = await Notifications.getPermissionsAsync();

    if (!permission.granted && requestPermission && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
    }

    if (!permission.granted) {
      return { availability: 'denied', permissionGranted: false };
    }
    permissionGranted = true;

    if (!Device.isDevice) {
      return { availability: 'simulator', permissionGranted: true };
    }

    const projectId = getProjectId();
    if (!projectId) {
      return { availability: 'missing_project_id', permissionGranted: true };
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const registration = {
      p_expo_push_token: token,
      p_locale: language,
      p_platform: platform,
    } as const;
    let { error } = await supabase.rpc('register_push_notification_device', {
      ...registration,
      ...(registeredWakeUpChannel ? { p_wake_up_channel_id: registeredWakeUpChannel } : {}),
    });
    // A client may arrive before the additive migration. Register normally and
    // keep v1 until a later registration can advertise the installed v2 channel.
    if (registeredWakeUpChannel && error?.code === 'PGRST202') {
      ({ error } = await supabase.rpc('register_push_notification_device', registration));
    }

    if (error) throw error;
    await AsyncStorage.setItem(pushTokenStorageKey, token);
    return { availability: 'registered', permissionGranted: true };
  } catch (error) {
    return {
      availability: 'error',
      errorMessage: getOriginalErrorMessage(error),
      permissionGranted,
    };
  }
}

export async function unregisterGeneralAlarmNotifications() {
  const token = await AsyncStorage.getItem(pushTokenStorageKey);
  let unregisterError: unknown = null;

  if (token) {
    const { error } = await supabase.rpc('unregister_push_notification_device', {
      p_expo_push_token: token,
    });
    unregisterError = error;
  }

  await cancelGeneralAlarmReminders();
  if (!unregisterError) {
    await AsyncStorage.removeItem(pushTokenStorageKey);
  } else {
    throw unregisterError;
  }
}

function isGeneralAlarmReminder(data: Record<string, unknown> | undefined) {
  return data?.kind === reminderKind;
}

function reminderKey(reminder: ScheduledGeneralAlarmReminder) {
  return [
    reminder.boardingId,
    reminder.participantId,
    reminder.nextStatus,
    reminder.fireDate.getTime(),
  ].join(':');
}

export async function syncGeneralAlarmReminders(
  reminders: ScheduledGeneralAlarmReminder[],
) {
  if (!Notifications) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const desiredKeys = new Set(reminders.map(reminderKey));
  const existingKeys = new Set<string>();

  for (const notification of scheduled) {
    const data = notification.content.data ?? {};
    if (!isGeneralAlarmReminder(data)) continue;

    const existingKey = typeof data.reminderKey === 'string' ? data.reminderKey : null;
    if (!existingKey || !desiredKeys.has(existingKey)) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    } else {
      existingKeys.add(existingKey);
    }
  }

  for (const reminder of reminders) {
    const key = reminderKey(reminder);
    if (existingKeys.has(key)) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        body: reminder.body,
        data: {
          boardingId: reminder.boardingId,
          kind: reminderKind,
          nextStatus: reminder.nextStatus,
          participantId: reminder.participantId,
          reminderKey: key,
          route: '/bus',
        },
        priority: Notifications.AndroidNotificationPriority.HIGH,
        sound: 'default',
        title: reminder.title,
      },
      trigger: {
        channelId,
        date: reminder.fireDate,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
      },
    });
  }
}

export async function cancelGeneralAlarmReminders() {
  if (!Notifications) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((notification) => isGeneralAlarmReminder(notification.content.data))
      .map((notification) =>
        Notifications.cancelScheduledNotificationAsync(notification.identifier),
      ),
  );
}

function isBusNotificationResponse(response: NotificationResponse | null) {
  return response?.notification.request.content.data?.route === '/bus';
}

function isEmergencyNotificationResponse(response: NotificationResponse | null) {
  return response?.notification.request.content.data?.route === '/emergency';
}

function isEmergencyDashboardNotificationResponse(response: NotificationResponse | null) {
  return response?.notification.request.content.data?.route === '/emergency-dashboard';
}

export function subscribeToGeneralAlarmNotificationResponses(
  listener: () => void,
): NotificationResponseSubscription {
  if (!Notifications) return { remove: () => undefined };

  const previousResponse = Notifications.getLastNotificationResponse();
  if (isBusNotificationResponse(previousResponse)) {
    Notifications.clearLastNotificationResponse();
    queueMicrotask(listener);
  }

  return Notifications.addNotificationResponseReceivedListener((response) => {
    if (isBusNotificationResponse(response)) listener();
  });
}

export function subscribeToEmergencyNotificationResponses(
  listener: () => void,
): NotificationResponseSubscription {
  if (!Notifications) return { remove: () => undefined };

  const previousResponse = Notifications.getLastNotificationResponse();
  if (isEmergencyNotificationResponse(previousResponse)) {
    Notifications.clearLastNotificationResponse();
    queueMicrotask(listener);
  }

  return Notifications.addNotificationResponseReceivedListener((response) => {
    if (isEmergencyNotificationResponse(response)) listener();
  });
}

export function subscribeToEmergencyDashboardNotificationResponses(
  listener: () => void,
): NotificationResponseSubscription {
  if (!Notifications) return { remove: () => undefined };

  const previousResponse = Notifications.getLastNotificationResponse();
  if (isEmergencyDashboardNotificationResponse(previousResponse)) {
    Notifications.clearLastNotificationResponse();
    queueMicrotask(listener);
  }

  return Notifications.addNotificationResponseReceivedListener((response) => {
    if (isEmergencyDashboardNotificationResponse(response)) listener();
  });
}

export function subscribeToQuestionRoundNotificationResponses(
  listener: () => void,
): NotificationResponseSubscription {
  if (!Notifications) return { remove: () => undefined };

  const matches = (response: NotificationResponse | null) =>
    response?.notification.request.content.data?.route === '/question-round';
  if (matches(Notifications.getLastNotificationResponse())) {
    Notifications.clearLastNotificationResponse();
    queueMicrotask(listener);
  }
  return Notifications.addNotificationResponseReceivedListener((response) => {
    if (matches(response)) listener();
  });
}

export function subscribeToDailyProgramNotificationResponses(
  listener: () => void,
): NotificationResponseSubscription {
  if (!Notifications) return { remove: () => undefined };

  const matches = (response: NotificationResponse | null) =>
    response?.notification.request.content.data?.route === '/program';
  if (matches(Notifications.getLastNotificationResponse())) {
    Notifications.clearLastNotificationResponse();
    queueMicrotask(listener);
  }
  return Notifications.addNotificationResponseReceivedListener((response) => {
    if (matches(response)) listener();
  });
}

export function subscribeToGroupLocationNotificationResponses(
  listener: () => void,
): NotificationResponseSubscription {
  if (!Notifications) return { remove: () => undefined };

  const matches = (response: NotificationResponse | null) =>
    response?.notification.request.content.data?.route === '/group';
  if (matches(Notifications.getLastNotificationResponse())) {
    Notifications.clearLastNotificationResponse();
    queueMicrotask(listener);
  }
  return Notifications.addNotificationResponseReceivedListener((response) => {
    if (matches(response)) listener();
  });
}

export function openGeneralAlarmNotificationSettings() {
  return Linking.openSettings();
}

export function subscribeToWakeUpCallNotificationResponses(listener: () => void): NotificationResponseSubscription {
  if (!Notifications) return { remove: () => undefined };
  const matches = (response: NotificationResponse | null) => response?.notification.request.content.data?.route === '/alarm';
  if (matches(Notifications.getLastNotificationResponse())) {
    Notifications.clearLastNotificationResponse();
    queueMicrotask(listener);
  }
  return Notifications.addNotificationResponseReceivedListener((response) => { if (matches(response)) listener(); });
}
