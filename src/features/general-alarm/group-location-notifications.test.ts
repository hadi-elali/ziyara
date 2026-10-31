import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NotificationResponse } from 'expo-notifications';
import * as Notifications from 'expo-notifications';

import { subscribeToGroupLocationNotificationResponses } from './general-alarm-notifications';

jest.mock('expo', () => ({ isRunningInExpoGo: () => false }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getLastNotificationResponse: jest.fn(),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('@/features/auth/supabase', () => ({ supabase: { rpc: jest.fn() } }));

function response(route: string): NotificationResponse {
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: {
      date: 0,
      request: {
        identifier: 'location-request-42',
        trigger: null,
        content: {
          data: { route, kind: 'group_location_requested', requestId: 42 },
          title: 'Standort angefragt', body: null, subtitle: null, sound: 'default',
          categoryIdentifier: null,
        },
      },
    },
  };
}

describe('location request notification responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(null);
  });

  it('handles a group notification saved before a cold start exactly once', async () => {
    jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(response('/group'));
    const listener = jest.fn();
    subscribeToGroupLocationNotificationResponses(listener);
    await Promise.resolve();
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('handles group taps and ignores other routes', () => {
    const listener = jest.fn();
    const subscription = subscribeToGroupLocationNotificationResponses(listener);
    const onResponse = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
    onResponse(response('/bus'));
    expect(listener).not.toHaveBeenCalled();
    onResponse(response('/group'));
    expect(listener).toHaveBeenCalledTimes(1);
    subscription.remove();
    expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
  });

  it('preserves a saved response for a different feature', () => {
    jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(response('/alarm'));
    subscribeToGroupLocationNotificationResponses(jest.fn());
    expect(Notifications.clearLastNotificationResponse).not.toHaveBeenCalled();
  });
});
