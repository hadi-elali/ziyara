import { describe, expect, it, jest } from '@jest/globals';
import { handleGroupCheckPushRequest, type GroupCheckDispatchDependencies } from './handler';

const request = { method: 'POST', authorization: 'Bearer valid', body: { checkId: 12 } };
function dependencies(overrides: Partial<GroupCheckDispatchDependencies> = {}): GroupCheckDispatchDependencies {
  return {
    getUserId: jest.fn(async () => 'admin-id'),
    isAdmin: jest.fn(async () => true),
    dispatch: jest.fn(async () => ({ pushFailed: false })),
    ...overrides,
  };
}
describe('status check push authorization and dispatch', () => {
  it.each([
    [{ ...request, method: 'GET' }, 405],
    [{ ...request, authorization: null }, 401],
    [{ ...request, authorization: 'Bearer' }, 401],
    [{ ...request, body: { checkId: -1 } }, 400],
    [{ ...request, body: { checkId: '12' } }, 400],
    [{ ...request, body: { checkId: 1.5 } }, 400],
    [{ ...request, body: { checkId: Number.MAX_SAFE_INTEGER + 1 } }, 400],
    [{ ...request, body: null }, 400],
  ])('rejects invalid input before dispatch: %j', async (input, status) => {
    const deps = dependencies();
    expect((await handleGroupCheckPushRequest(input, deps)).status).toBe(status);
    expect(deps.dispatch).not.toHaveBeenCalled();
  });
  it('rejects invalid sessions', async () => {
    const deps = dependencies({ getUserId: jest.fn(async () => null) });
    expect((await handleGroupCheckPushRequest(request, deps)).status).toBe(401);
    expect(deps.dispatch).not.toHaveBeenCalled();
  });
  it('requires a verified administrator', async () => {
    const deps = dependencies({ isAdmin: jest.fn(async () => false) });
    expect((await handleGroupCheckPushRequest(request, deps)).status).toBe(403);
    expect(deps.getUserId).toHaveBeenCalledWith('valid');
    expect(deps.dispatch).not.toHaveBeenCalled();
  });
  it.each([false, true])('reports saved attempt failures: %s', async (pushFailed) => {
    const deps = dependencies({ dispatch: jest.fn(async () => ({ pushFailed })) });
    expect(await handleGroupCheckPushRequest(request, deps)).toEqual({
      status: 200, body: { code: 'processed', pushFailed },
    });
    expect(deps.dispatch).toHaveBeenCalledWith(12, 'admin-id');
  });
  it('returns a private error when the claim or Expo completion fails', async () => {
    const deps = dependencies({ dispatch: jest.fn(async () => { throw new Error('private token'); }) });
    expect(await handleGroupCheckPushRequest(request, deps)).toEqual({
      status: 500, body: { code: 'dispatch_failed' },
    });
  });
});
