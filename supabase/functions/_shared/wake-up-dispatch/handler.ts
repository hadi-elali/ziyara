export type WakeUpNotificationClaim = {
  attempt_id: number;
  call_id: number;
  expo_push_token: string;
  locale: string;
  message: string;
};

type WakeUpPushNotification = {
  to: string;
  title: string;
  body: string;
  sound: 'weckruf.wav';
  priority: 'high';
  channelId: 'wake-up-calls-v1';
  data: { kind: 'wake_up_call'; callId: number; route: '/alarm' };
};

export type WakeUpNotificationCompletion = {
  attemptId: number;
  accepted: boolean;
  errorCode: string | null;
  expoHttpStatus: number | null;
  expoTicketId: string | null;
};

export type WakeUpDispatchDependencies = {
  claimNotifications: (callId: number | null) => Promise<WakeUpNotificationClaim[]>;
  completeAttempt: (result: WakeUpNotificationCompletion) => Promise<void>;
  sendNotifications: (
    notifications: WakeUpPushNotification[],
  ) => Promise<Pick<Response, 'json' | 'ok' | 'status'>>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeErrorCode(value: unknown): string | null {
  // Expo messages/details can include tokens. Persist only structured identifiers.
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value)
    ? value
    : null;
}

function ticketId(value: unknown): string | null {
  return typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function dispatchWakeUpNotifications(
  dependencies: WakeUpDispatchDependencies,
  callId: number | null = null,
) {
  const claims = await dependencies.claimNotifications(callId);
  let accepted = 0;

  for (let offset = 0; offset < claims.length; offset += 100) {
    const batch = claims.slice(offset, offset + 100);
    let tickets: unknown[] = [];
    let batchError: string | null = null;
    let expoHttpStatus: number | null = null;

    try {
      const response = await dependencies.sendNotifications(batch.map((claim) => ({
        to: claim.expo_push_token,
        title: claim.locale === 'ar'
          ? 'نداء إيقاظ'
          : claim.locale === 'en'
          ? 'Wake-up call'
          : 'Weckruf',
        body: claim.message,
        sound: 'weckruf.wav',
        priority: 'high',
        channelId: 'wake-up-calls-v1',
        data: { kind: 'wake_up_call', callId: claim.call_id, route: '/alarm' },
      })));
      expoHttpStatus = response.status;
      let payload: Record<string, unknown> | null = null;
      try {
        payload = asRecord(await response.json());
      } catch {
        // Keep the HTTP status even when Expo returns a non-JSON error page.
      }
      const errors = Array.isArray(payload?.errors) ? payload.errors : [];
      const requestError = safeErrorCode(asRecord(errors[0])?.code);

      if (!response.ok) {
        batchError = requestError ?? `expo_http_${response.status}`;
      } else if (errors.length > 0) {
        batchError = requestError ?? 'expo_request_error';
      } else if (!Array.isArray(payload?.data)) {
        batchError = 'expo_invalid_response';
      } else {
        tickets = payload.data;
      }
    } catch (error) {
      const errorName = asRecord(error)?.name ?? (error instanceof Error ? error.name : null);
      batchError = errorName === 'TimeoutError' || errorName === 'AbortError'
        ? 'expo_timeout'
        : 'expo_network_error';
    }

    for (let index = 0; index < batch.length; index += 1) {
      const ticket = asRecord(tickets[index]);
      const ok = batchError === null && ticket?.status === 'ok';
      const errorCode = ok
        ? null
        : batchError ?? safeErrorCode(asRecord(ticket?.details)?.error) ??
          (ticket ? 'expo_ticket_error' : 'expo_missing_ticket');

      await dependencies.completeAttempt({
        attemptId: batch[index].attempt_id,
        accepted: ok,
        errorCode,
        expoHttpStatus,
        expoTicketId: ok ? ticketId(ticket?.id) : null,
      });
      if (ok) accepted += 1;
    }
  }

  return { accepted, claimed: claims.length, failed: claims.length - accepted };
}
