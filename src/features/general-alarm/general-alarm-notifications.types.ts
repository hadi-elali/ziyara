import type { BusBoardingStatus } from '@/domain/database';

export type GeneralAlarmNotificationAvailability =
  | 'checking'
  | 'denied'
  | 'disabled'
  | 'error'
  | 'expo_go'
  | 'missing_project_id'
  | 'registered'
  | 'simulator'
  | 'unsupported';

export type GeneralAlarmNotificationState = {
  availability: GeneralAlarmNotificationAvailability;
  errorMessage?: string | null;
  permissionGranted: boolean;
};

export type ScheduledGeneralAlarmReminder = {
  boardingId: number;
  body: string;
  fireDate: Date;
  nextStatus: BusBoardingStatus;
  participantId: number;
  title: string;
};

export type NotificationResponseSubscription = {
  remove: () => void;
};
