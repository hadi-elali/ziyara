import { describe, expect, it, jest } from '@jest/globals';

import {
  handleDispatchGeneralAlarmRequest,
  type DispatchGeneralAlarmDependencies,
  type GeneralAlarmNotificationClaim,
} from './handler';

const claim: GeneralAlarmNotificationClaim = {
  attempt_id: 1,
  boarding_id: 2,
  departure_at: '2026-08-27T10:00:00Z',
  expected_status: 'read',
  expo_push_token: 'ExponentPushToken[test-token-value]',
  is_urgent: false,
  locale: 'de',
  participant_code: 'BER01',
  participant_id: 3,
  platform: 'ios',
  title: 'Abfahrt',
};

function dependencies(
  overrides: Partial<DispatchGeneralAlarmDependencies> = {},
): DispatchGeneralAlarmDependencies {
  return {
    claimDueNotifications: jest.fn(async () => []),
    completeAttempts: jest.fn(async () => undefined),
    getAuthenticatedUserId: jest.fn(async () => null),
    isAdminUser: jest.fn(async () => false),
    sendNotifications: jest.fn(async () => []),
    ...overrides,
  };
}

describe('dispatch general alarm handler', () => {
  it('weist Aufrufe ohne Admin- oder Scheduler-Berechtigung ab', async () => {
    const dispatchWakeUpCalls = jest.fn(async () => undefined);
    const result = await handleDispatchGeneralAlarmRequest(
      {
        authorization: null,
        configuredCronSecret: 'secret',
        cronSecret: null,
        method: 'POST',
      },
      dependencies({ dispatchWakeUpCalls }),
    );

    expect(result).toMatchObject({ body: { code: 'unauthorized' }, status: 401 });
    expect(dispatchWakeUpCalls).not.toHaveBeenCalled();
  });

  it('führt geplante Weckrufe auch ohne aktives Boarding aus', async () => {
    const dispatchWakeUpCalls = jest.fn(async () => undefined);
    const sendNotifications = jest.fn(async () => []);
    const result = await handleDispatchGeneralAlarmRequest(
      {
        authorization: null,
        configuredCronSecret: 'secret',
        cronSecret: 'secret',
        method: 'POST',
      },
      dependencies({ sendNotifications, dispatchWakeUpCalls }),
    );

    expect(result).toMatchObject({
      body: { accepted: 0, claimed: 0, code: 'dispatched', failed: 0 },
      status: 200,
    });
    expect(sendNotifications).not.toHaveBeenCalled();
    expect(dispatchWakeUpCalls).toHaveBeenCalledTimes(1);
  });

  it('prüft einen Nutzer-Token serverseitig und protokolliert das Expo-Ergebnis', async () => {
    const completeAttempts = jest.fn(async () => undefined);
    const result = await handleDispatchGeneralAlarmRequest(
      {
        authorization: 'Bearer valid-token',
        configuredCronSecret: null,
        cronSecret: null,
        method: 'POST',
      },
      dependencies({
        claimDueNotifications: jest.fn(async () => [claim]),
        completeAttempts,
        getAuthenticatedUserId: jest.fn(async () => 'admin-user'),
        isAdminUser: jest.fn(async () => true),
        sendNotifications: jest.fn(async () => [
          { accepted: true, attemptIds: [claim.attempt_id], errorCode: null },
        ]),
      }),
    );

    expect(result).toMatchObject({
      body: { accepted: 1, claimed: 1, code: 'dispatched', failed: 0 },
      status: 200,
    });
    expect(completeAttempts).toHaveBeenCalledWith({
      accepted: true,
      attemptIds: [claim.attempt_id],
      errorCode: null,
    });
  });

  it('gibt interne Versandfehler ohne Token- oder Teilnehmerdaten zurück', async () => {
    const result = await handleDispatchGeneralAlarmRequest(
      {
        authorization: null,
        configuredCronSecret: 'secret',
        cronSecret: 'secret',
        method: 'POST',
      },
      dependencies({
        claimDueNotifications: jest.fn(async () => [claim]),
        sendNotifications: jest.fn(async () => {
          throw new Error('Expo unavailable');
        }),
      }),
    );

    expect(result).toEqual({
      body: {
        code: 'dispatch_failed',
        message: 'General-alarm notifications could not be dispatched.',
      },
      status: 500,
    });
  });
});
