export type AdminPushNotificationClaim = {
  attempt_id: number;
  expo_push_token: string;
  title: string;
  body: string;
};

type AdminPushNotification = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: 'general-alarm';
  data: { kind: 'admin_broadcast'; messageId: number };
};

export type AdminPushNotificationCompletion = {
  attemptId: number;
  accepted: boolean;
  errorCode: string | null;
  expoHttpStatus: number | null;
  expoTicketId: string | null;
};

export type AdminPushDispatchDependencies = {
  getAuthenticatedAdminId: (token: string) => Promise<string | null>;
  claimNotifications: (messageId: number, userId: string) => Promise<AdminPushNotificationClaim[]>;
  completeAttempt: (result: AdminPushNotificationCompletion) => Promise<void>;
  sendNotifications: (
    notifications: AdminPushNotification[],
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

export async function dispatchAdminPushNotifications(
  dependencies: AdminPushDispatchDependencies,
  messageId: number,
  userId: string,
) {
  let accepted = 0;
  let claimed = 0;
  // Each RPC claims at most 100 previously unsent devices. Resume uses the same
  // message ID and never reclaims attempts with an uncertain Expo outcome.
  for (;;) {
    const batch = await dependencies.claimNotifications(messageId, userId);
    if (!batch.length) break;
    claimed += batch.length;
    let tickets: unknown[] = [];
    let batchError: string | null = null;
    let expoHttpStatus: number | null = null;

    try {
      const response = await dependencies.sendNotifications(batch.map((claim) => ({
        to: claim.expo_push_token,
        title: claim.title,
        body: claim.body,
        sound: 'default',
        priority: 'high',
        channelId: 'general-alarm',
        data: { kind: 'admin_broadcast', messageId },
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

  return { accepted, claimed, failed: claimed - accepted };
}


export async function handleAdminPushRequest(
  request: { method: string; authorization: string | null; body: unknown },
  dependencies: AdminPushDispatchDependencies,
) {
  const reply = (status: number, code: string) => ({ status, body: { code } });
  if (request.method !== 'POST') return reply(405, 'method_not_allowed');
  const token = request.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return reply(401, 'unauthorized');
  try {
    const userId = await dependencies.getAuthenticatedAdminId(token);
    if (!userId) return reply(403, 'admin_required');
    const messageId = asRecord(request.body)?.messageId;
    if (typeof messageId !== 'number' || !Number.isSafeInteger(messageId) || messageId <= 0) {
      return reply(400, 'invalid_message');
    }
    await dispatchAdminPushNotifications(dependencies, messageId, userId);
    return reply(200, 'processed');
  } catch {
    return reply(500, 'dispatch_failed');
  }
}
