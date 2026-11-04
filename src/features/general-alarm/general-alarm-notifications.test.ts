import { describe, expect, it, jest } from '@jest/globals';
import {
  cancelGeneralAlarmReminders,
  inspectGeneralAlarmNotificationState,
  registerGeneralAlarmNotifications,
  subscribeToGeneralAlarmNotificationResponses,
  subscribeToGroupCheckNotificationResponses,
  syncGeneralAlarmReminders,
} from '@/features/general-alarm/general-alarm-notifications';

jest.mock('expo', () => ({
  isRunningInExpoGo: () => true,
}));

jest.mock('expo-notifications', () => {
  throw new Error('expo-notifications must not load in Expo Go');
});

jest.mock('@/features/auth/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

describe('general alarm notifications in Expo Go', () => {
  it('does not evaluate expo-notifications', async () => {
    await expect(inspectGeneralAlarmNotificationState()).resolves.toEqual({
      availability: 'expo_go',
      permissionGranted: false,
    });
    await expect(registerGeneralAlarmNotifications('de', true)).resolves.toEqual({
      availability: 'expo_go',
      permissionGranted: false,
    });
    await expect(syncGeneralAlarmReminders([])).resolves.toBeUndefined();
    await expect(cancelGeneralAlarmReminders()).resolves.toBeUndefined();

    const subscription = subscribeToGeneralAlarmNotificationResponses(jest.fn());
    expect(() => subscription.remove()).not.toThrow();
    expect(() => subscribeToGroupCheckNotificationResponses(jest.fn()).remove()).not.toThrow();
  });
});
