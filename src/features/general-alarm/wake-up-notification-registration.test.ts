import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerGeneralAlarmNotifications } from './general-alarm-notifications';

const mockRegister = jest.fn<(
  name: string, args: Record<string, unknown>,
) => Promise<{ error: { code: string; message: string } | null }>>();

jest.mock('expo', () => ({ isRunningInExpoGo: () => false }));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { eas: { projectId: 'test-project' } } } }));
jest.mock('@/features/auth/supabase', () => ({
  supabase: { rpc: (name: string, args: Record<string, unknown>) => mockRegister(name, args) },
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { HIGH: 6, MAX: 7 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));

const legacyChannel: Notifications.NotificationChannel = {
  id: 'wake-up-calls-v1', name: 'Weckrufe', description: null,
  importance: Notifications.AndroidImportance.HIGH,
  lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  bypassDnd: false, showBadge: true, sound: 'custom',
  audioAttributes: {
    usage: 5, contentType: 4,
    flags: { enforceAudibility: false, requestHardwareAudioVideoSynchronization: false },
  },
  lightColor: '#00000000', enableLights: false, enableVibrate: true,
  vibrationPattern: [0, 300, 180, 300],
};

describe('wake-up notification channel rollout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(Platform, 'OS', 'android');
    mockRegister.mockReset().mockResolvedValue({ error: null });
    jest.mocked(Notifications.getNotificationChannelAsync).mockResolvedValue(legacyChannel);
    jest.mocked(Notifications.setNotificationChannelAsync).mockImplementation(async (id) => ({
      ...legacyChannel, id,
    }));
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: true, canAskAgain: true, expires: 'never',
      status: 'granted' as Notifications.PermissionStatus,
    });
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      data: 'ExpoPushToken[registration-fixture]', type: 'expo',
    });
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('keeps v1 and registers v2 only after creating its longer vibration pattern', async () => {
    expect(await registerGeneralAlarmNotifications('de', false))
      .toEqual({ availability: 'registered', permissionGranted: true });
    const calls = jest.mocked(Notifications.setNotificationChannelAsync).mock.calls;
    expect(calls.some(([id]) => id === 'wake-up-calls-v1')).toBe(true);
    const upgradedIndex = calls.findIndex(([id]) => id === 'wake-up-calls-v2');
    const pattern = calls[upgradedIndex][1].vibrationPattern ?? [];
    const impulses = pattern.filter((_, index) => index % 2 === 1);
    expect(impulses).toHaveLength(4);
    expect(impulses.every((duration) => duration >= 800)).toBe(true);
    expect(jest.mocked(Notifications.setNotificationChannelAsync).mock.invocationCallOrder[upgradedIndex])
      .toBeLessThan(mockRegister.mock.invocationCallOrder[0]);
    expect(mockRegister).toHaveBeenCalledWith('register_push_notification_device', {
      p_expo_push_token: 'ExpoPushToken[registration-fixture]',
      p_locale: 'de', p_platform: 'android', p_wake_up_channel_id: 'wake-up-calls-v2',
    });
  });

  it('preserves disabled vibration, channel silence and lock-screen privacy', async () => {
    jest.mocked(Notifications.getNotificationChannelAsync).mockResolvedValue({
      ...legacyChannel, enableVibrate: false, sound: null, importance: 2,
      showBadge: false, lockscreenVisibility: 3,
    });
    await registerGeneralAlarmNotifications('de', false);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('wake-up-calls-v2',
      expect.objectContaining({
        enableVibrate: false, sound: null, importance: 2,
        showBadge: false, lockscreenVisibility: 3,
      }));
  });

  it('falls back to legacy registration when the migration is not installed yet', async () => {
    mockRegister.mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'Missing overload' } });
    expect(await registerGeneralAlarmNotifications('en', false))
      .toEqual({ availability: 'registered', permissionGranted: true });
    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(mockRegister.mock.calls[1][1]).not.toHaveProperty('p_wake_up_channel_id');
  });

  it('does not hide other registration failures behind a legacy retry', async () => {
    mockRegister.mockResolvedValueOnce({ error: { code: '42501', message: 'Authentication required.' } });
    expect(await registerGeneralAlarmNotifications('de', false))
      .toEqual(expect.objectContaining({ availability: 'error', permissionGranted: true }));
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it('does not advertise a channel the native API did not create', async () => {
    jest.mocked(Notifications.setNotificationChannelAsync).mockResolvedValue(null);
    await registerGeneralAlarmNotifications('de', false);
    expect(mockRegister.mock.calls[0][1]).not.toHaveProperty('p_wake_up_channel_id');
  });

  it('leaves iOS registration and system-controlled vibration unchanged', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await registerGeneralAlarmNotifications('ar', false);
    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(mockRegister).toHaveBeenCalledWith('register_push_notification_device', {
      p_expo_push_token: 'ExpoPushToken[registration-fixture]', p_locale: 'ar', p_platform: 'ios',
    });
  });
});
