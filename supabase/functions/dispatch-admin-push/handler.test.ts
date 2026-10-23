import { describe, expect, it, jest } from '@jest/globals';
import { handleAdminPushRequest, type AdminPushDispatchDependencies } from './handler';

const claim = { attempt_id: 1, expo_push_token: 'ExpoPushToken[private-token]', title: 'Treffpunkt', body: 'Bitte zur Rezeption kommen.' };
const request = { method: 'POST', authorization: 'Bearer valid', body: { messageId: 7 } };
const response = (data: unknown, status = 200) => ({ json: async () => data, ok: status === 200, status });
function dependencies(overrides: Partial<AdminPushDispatchDependencies> = {}): AdminPushDispatchDependencies {
  return {
    getAuthenticatedAdminId: jest.fn(async () => 'admin-id'),
    claimNotifications: jest.fn<AdminPushDispatchDependencies['claimNotifications']>()
      .mockResolvedValueOnce([claim]).mockResolvedValue([]),
    completeAttempt: jest.fn(async () => undefined),
    sendNotifications: jest.fn(async () => response({ data: [{ status: 'ok', id: 'b853d128-3048-4c52-9d49-b81b4144bca5' }] })),
    ...overrides,
  };
}

describe('admin push broadcast', () => {
  it.each([
    [{ ...request, method: 'GET' }, 405],
    [{ ...request, authorization: null }, 401],
    [{ ...request, authorization: 'Bearer' }, 401],
    [{ ...request, body: { messageId: -1 } }, 400],
    [{ ...request, body: { messageId: '7', title: 'ignored' } }, 400],
    [{ ...request, body: null }, 400],
  ])('rejects invalid requests before claiming or sending: %j', async (input, status) => {
    const deps = dependencies();
    expect((await handleAdminPushRequest(input, deps)).status).toBe(status);
    expect(deps.claimNotifications).not.toHaveBeenCalled();
    expect(deps.sendNotifications).not.toHaveBeenCalled();
  });

  it('requires a server-verified admin and accepts no scheduler bypass', async () => {
    const deps = dependencies({ getAuthenticatedAdminId: jest.fn(async () => null) });
    expect((await handleAdminPushRequest(request, deps)).status).toBe(403);
    expect(deps.getAuthenticatedAdminId).toHaveBeenCalledWith('valid');
    expect(deps.claimNotifications).not.toHaveBeenCalled();
  });

  it('sends stored content with the standard sound and persists the ticket', async () => {
    const deps = dependencies();
    expect(await handleAdminPushRequest(request, deps)).toEqual({ status: 200, body: { code: 'processed' } });
    expect(deps.claimNotifications).toHaveBeenCalledWith(7, 'admin-id');
    expect(deps.sendNotifications).toHaveBeenCalledWith([{
      to: claim.expo_push_token, title: claim.title, body: claim.body,
      channelId: 'general-alarm', sound: 'default', priority: 'high',
      data: { kind: 'admin_broadcast', messageId: 7 },
    }]);
    expect(deps.completeAttempt).toHaveBeenCalledWith({
      attemptId: 1, accepted: true, errorCode: null, expoHttpStatus: 200,
      expoTicketId: 'b853d128-3048-4c52-9d49-b81b4144bca5',
    });
  });

  it('handles no devices and repeated dispatch without sending again', async () => {
    const deps = dependencies({ claimNotifications: jest.fn(async () => []) });
    await handleAdminPushRequest(request, deps);
    await handleAdminPushRequest(request, deps);
    expect(deps.sendNotifications).not.toHaveBeenCalled();
  });

  it('continues through batches of 100 and associates partial errors with the right device', async () => {
    const deps = dependencies({
      claimNotifications: jest.fn<AdminPushDispatchDependencies['claimNotifications']>()
        .mockResolvedValueOnce(Array.from({ length: 100 }, (_, id) => ({ ...claim, attempt_id: id + 1 })))
        .mockResolvedValueOnce([{ ...claim, attempt_id: 101 }]).mockResolvedValue([]),
      sendNotifications: jest.fn<AdminPushDispatchDependencies['sendNotifications']>()
        .mockResolvedValueOnce(response({ data: Array.from({ length: 100 }, () => ({ status: 'ok' })) }))
        .mockResolvedValueOnce(response({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' }, message: claim.expo_push_token }] })),
    });
    await handleAdminPushRequest(request, deps);
    expect(jest.mocked(deps.sendNotifications).mock.calls.map(([batch]) => batch.length)).toEqual([100, 1]);
    expect(deps.completeAttempt).toHaveBeenLastCalledWith(expect.objectContaining({ attemptId: 101, accepted: false, errorCode: 'DeviceNotRegistered' }));
    expect(JSON.stringify(jest.mocked(deps.completeAttempt).mock.calls)).not.toContain(claim.expo_push_token);
  });

  it.each([
    [response({ errors: [{ code: 'UNAUTHORIZED' }] }, 403), 'UNAUTHORIZED'],
    [response({}), 'expo_invalid_response'],
    [response({ data: [] }), 'expo_missing_ticket'],
    [response({ data: [{ status: 'error', details: { error: claim.expo_push_token } }] }), 'expo_ticket_error'],
  ])('records request and ticket errors without token disclosure', async (reply, errorCode) => {
    const deps = dependencies({ sendNotifications: jest.fn(async () => reply) });
    expect((await handleAdminPushRequest(request, deps)).status).toBe(200);
    expect(deps.completeAttempt).toHaveBeenCalledWith(expect.objectContaining({ accepted: false, errorCode }));
  });

  it('records an ambiguous timeout without retrying the claimed device', async () => {
    const deps = dependencies({ sendNotifications: jest.fn(async () => { const error = new Error('private'); error.name = 'TimeoutError'; throw error; }) });
    await handleAdminPushRequest(request, deps);
    expect(deps.sendNotifications).toHaveBeenCalledTimes(1);
    expect(deps.completeAttempt).toHaveBeenCalledWith(expect.objectContaining({ accepted: false, errorCode: 'expo_timeout' }));
  });

  it('does not send when the protected claim fails', async () => {
    const deps = dependencies({ claimNotifications: jest.fn(async () => { throw new Error('Admin role revoked'); }) });
    expect((await handleAdminPushRequest(request, deps)).status).toBe(500);
    expect(deps.sendNotifications).not.toHaveBeenCalled();
  });

  it('reports uncertain completion and never resends the batch', async () => {
    const deps = dependencies({ completeAttempt: jest.fn(async () => { throw new Error('Database unavailable'); }) });
    expect((await handleAdminPushRequest(request, deps)).status).toBe(500);
    expect(deps.sendNotifications).toHaveBeenCalledTimes(1);
  });
});
