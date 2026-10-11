import {
  dispatchWakeUpNotifications,
  type WakeUpDispatchDependencies,
  type WakeUpNotificationClaim,
  type WakeUpNotificationCompletion,
} from './handler';

const claim: WakeUpNotificationClaim = {
  attempt_id: 10,
  call_id: 20,
  expo_push_token: 'ExpoPushToken[private-device-token]',
  locale: 'de',
  message: 'Private Nachricht',
};
const receiptId = 'b853d128-3048-4c52-9d49-b81b4144bca5';

function response(payload: unknown, status = 200): Pick<Response, 'json' | 'ok' | 'status'> {
  return { json: async () => payload, ok: status >= 200 && status < 300, status };
}

function dependencies(
  overrides: Partial<WakeUpDispatchDependencies> = {},
): WakeUpDispatchDependencies {
  return {
    claimNotifications: jest.fn(async () => [claim]),
    completeAttempt: jest.fn<(result: WakeUpNotificationCompletion) => Promise<void>>(async () => undefined),
    sendNotifications: jest.fn(async () => response({ data: [{ status: 'ok', id: receiptId }] })),
    ...overrides,
  };
}

describe('Weckruf-Push-Diagnose', () => {
  it('speichert ein erfolgreiches Ticket für die spätere Receipt-Prüfung', async () => {
    const deps = dependencies();
    const result = await dispatchWakeUpNotifications(deps, claim.call_id);

    expect(deps.claimNotifications).toHaveBeenCalledWith(claim.call_id);
    expect(result).toEqual({ accepted: 1, claimed: 1, failed: 0 });
    expect(deps.completeAttempt).toHaveBeenCalledWith({
      accepted: true,
      attemptId: claim.attempt_id,
      errorCode: null,
      expoHttpStatus: 200,
      expoTicketId: receiptId,
    });
    expect(deps.sendNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        channelId: 'general-alarm',
        data: { kind: 'wake_up_call', callId: claim.call_id, route: '/alarm' },
        priority: 'high',
        sound: 'default',
        title: 'Weckruf',
      }),
    ]);
  });

  it('ordnet gemischte Expo-Tickets den richtigen Versuchen zu und verwirft Freitext', async () => {
    const deps = dependencies({
      claimNotifications: async () => [claim, { ...claim, attempt_id: 11 }],
      sendNotifications: async () => response({ data: [
        { status: 'error', details: { error: 'InvalidCredentials' }, message: claim.expo_push_token },
        { status: 'ok', id: receiptId },
      ] }),
    });

    expect(await dispatchWakeUpNotifications(deps)).toEqual({ accepted: 1, claimed: 2, failed: 1 });
    expect(deps.completeAttempt).toHaveBeenNthCalledWith(1, {
      accepted: false,
      attemptId: 10,
      errorCode: 'InvalidCredentials',
      expoHttpStatus: 200,
      expoTicketId: null,
    });
    expect(deps.completeAttempt).toHaveBeenNthCalledWith(2, expect.objectContaining({
      accepted: true,
      attemptId: 11,
      expoTicketId: receiptId,
    }));
    expect(JSON.stringify(jest.mocked(deps.completeAttempt).mock.calls))
      .not.toContain(claim.expo_push_token);
  });

  it('speichert den Expo-Requestfehler bei HTTP 400 für den gesamten Batch', async () => {
    const deps = dependencies({
      sendNotifications: async () => response({ errors: [{
        code: 'PUSH_TOO_MANY_EXPERIENCE_IDS',
        message: claim.message,
        details: { tokens: [claim.expo_push_token] },
      }] }, 400),
    });

    expect(await dispatchWakeUpNotifications(deps)).toEqual({ accepted: 0, claimed: 1, failed: 1 });
    expect(deps.completeAttempt).toHaveBeenCalledWith({
      accepted: false,
      attemptId: 10,
      errorCode: 'PUSH_TOO_MANY_EXPERIENCE_IDS',
      expoHttpStatus: 400,
      expoTicketId: null,
    });
  });

  it('behält den HTTP-Status auch bei einer nicht lesbaren Fehlerantwort', async () => {
    const deps = dependencies({ sendNotifications: async () => ({
      json: async () => { throw new SyntaxError('HTML error page'); },
      ok: false,
      status: 503,
    }) });

    await dispatchWakeUpNotifications(deps);
    expect(deps.completeAttempt).toHaveBeenCalledWith(expect.objectContaining({
      accepted: false, errorCode: 'expo_http_503', expoHttpStatus: 503,
    }));
  });

  it.each([
    ['TimeoutError', 'expo_timeout'],
    ['AbortError', 'expo_timeout'],
    ['TypeError', 'expo_network_error'],
  ])('klassifiziert %s ohne Speicherung der Netzwerkfehlermeldung', async (name, errorCode) => {
    const error = new Error(claim.expo_push_token);
    error.name = name;
    const deps = dependencies({ sendNotifications: async () => { throw error; } });

    await dispatchWakeUpNotifications(deps);
    expect(deps.completeAttempt).toHaveBeenCalledWith({
      accepted: false,
      attemptId: 10,
      errorCode,
      expoHttpStatus: null,
      expoTicketId: null,
    });
  });

  it.each([null, { data: {} }, { data: 'invalid' }])(
    'behandelt eine ungültige HTTP-200-Antwort als diagnostizierbaren Fehler: %j',
    async (payload) => {
      const deps = dependencies({ sendNotifications: async () => response(payload) });
      await dispatchWakeUpNotifications(deps);
      expect(deps.completeAttempt).toHaveBeenCalledWith(expect.objectContaining({
        accepted: false, errorCode: 'expo_invalid_response', expoHttpStatus: 200,
      }));
    },
  );

  it('erkennt fehlende Tickets, ohne die bereits akzeptierten Tickets zu verwerfen', async () => {
    const deps = dependencies({
      claimNotifications: async () => [claim, { ...claim, attempt_id: 11 }],
    });
    expect(await dispatchWakeUpNotifications(deps)).toEqual({ accepted: 1, claimed: 2, failed: 1 });
    expect(deps.completeAttempt).toHaveBeenNthCalledWith(2, expect.objectContaining({
      accepted: false, attemptId: 11, errorCode: 'expo_missing_ticket',
    }));
  });

  it('speichert keine Tokens oder Freitextwerte als vermeintlichen Fehlercode', async () => {
    const deps = dependencies({ sendNotifications: async () => response({ data: [{
      status: 'error',
      details: { error: claim.expo_push_token },
      message: claim.message,
    }] }) });

    await dispatchWakeUpNotifications(deps);
    expect(deps.completeAttempt).toHaveBeenCalledWith(expect.objectContaining({
      accepted: false, errorCode: 'expo_ticket_error', expoTicketId: null,
    }));
  });

  it('verwirft ungültige Ticket-IDs, ohne die Expo-Annahme umzudeuten', async () => {
    const deps = dependencies({ sendNotifications: async () => response({ data: [{
      status: 'ok', id: claim.expo_push_token,
    }] }) });

    expect(await dispatchWakeUpNotifications(deps)).toEqual({ accepted: 1, claimed: 1, failed: 0 });
    expect(deps.completeAttempt).toHaveBeenCalledWith(expect.objectContaining({
      accepted: true, errorCode: null, expoTicketId: null,
    }));
  });

  it('protokolliert auch Requestfehler mit HTTP 200', async () => {
    const deps = dependencies({ sendNotifications: async () => response({
      errors: [{ code: 'UNAUTHORIZED' }],
    }) });

    await dispatchWakeUpNotifications(deps);
    expect(deps.completeAttempt).toHaveBeenCalledWith(expect.objectContaining({
      accepted: false, errorCode: 'UNAUTHORIZED', expoHttpStatus: 200,
    }));
  });

  it('begrenzt Batches auf 100 und fährt nach einem Batchfehler ohne erneuten Versand fort', async () => {
    const claims = Array.from({ length: 101 }, (_, index) => ({ ...claim, attempt_id: index + 1 }));
    const sendNotifications = jest.fn<WakeUpDispatchDependencies['sendNotifications']>()
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({ data: [{ status: 'ok', id: receiptId }] }));
    const deps = dependencies({ claimNotifications: async () => claims, sendNotifications });

    expect(await dispatchWakeUpNotifications(deps)).toEqual({ accepted: 1, claimed: 101, failed: 100 });
    expect(sendNotifications).toHaveBeenCalledTimes(2);
    expect(sendNotifications.mock.calls.map(([batch]) => batch.length)).toEqual([100, 1]);
    expect(deps.completeAttempt).toHaveBeenCalledTimes(101);
  });

  it('gibt einen Persistenzfehler weiter und sendet den Batch nicht erneut', async () => {
    const deps = dependencies({ completeAttempt: async () => { throw new Error('Database unavailable'); } });
    await expect(dispatchWakeUpNotifications(deps)).rejects.toThrow('Database unavailable');
    expect(deps.sendNotifications).toHaveBeenCalledTimes(1);
  });

  it('sendet nichts, wenn die idempotente Claim-RPC keine Geräte mehr liefert', async () => {
    const deps = dependencies({ claimNotifications: async () => [] });
    expect(await dispatchWakeUpNotifications(deps)).toEqual({ accepted: 0, claimed: 0, failed: 0 });
    expect(deps.sendNotifications).not.toHaveBeenCalled();
    expect(deps.completeAttempt).not.toHaveBeenCalled();
  });
});
import { describe, expect, it, jest } from '@jest/globals';

