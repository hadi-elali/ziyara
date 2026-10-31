import type { Language } from '@/features/i18n/i18n';
import type {
  GeneralAlarmNotificationState,
  NotificationResponseSubscription,
  ScheduledGeneralAlarmReminder,
} from '@/features/general-alarm/general-alarm-notifications.types';

const unsupportedState: GeneralAlarmNotificationState = {
  availability: 'unsupported',
  permissionGranted: false,
};

export async function inspectGeneralAlarmNotificationState() {
  return unsupportedState;
}

export async function registerGeneralAlarmNotifications(
  _language: Language,
  _requestPermission: boolean,
) {
  return unsupportedState;
}

export async function unregisterGeneralAlarmNotifications() {}

export async function syncGeneralAlarmReminders(
  _reminders: ScheduledGeneralAlarmReminder[],
) {}

export async function cancelGeneralAlarmReminders() {}

export function subscribeToGeneralAlarmNotificationResponses(
  _listener: () => void,
): NotificationResponseSubscription {
  return { remove: () => undefined };
}

export function subscribeToEmergencyNotificationResponses(
  _listener: () => void,
): NotificationResponseSubscription {
  return { remove: () => undefined };
}

export function subscribeToEmergencyDashboardNotificationResponses(
  _listener: () => void,
): NotificationResponseSubscription {
  return { remove: () => undefined };
}

export function subscribeToGroupLocationNotificationResponses(
  _listener: () => void,
): NotificationResponseSubscription {
  return { remove: () => undefined };
}

export async function openGeneralAlarmNotificationSettings() {}

export function subscribeToQuestionRoundNotificationResponses(
  _listener: () => void,
): NotificationResponseSubscription {
  return { remove: () => undefined };
}

export function subscribeToDailyProgramNotificationResponses(
  _listener: () => void,
): NotificationResponseSubscription {
  return { remove: () => undefined };
}

export function subscribeToWakeUpCallNotificationResponses(_listener: () => void): NotificationResponseSubscription {
  return { remove: () => undefined };
}
