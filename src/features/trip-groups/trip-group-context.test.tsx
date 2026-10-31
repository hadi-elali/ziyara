import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TripGroupProvider, useTripGroups } from './trip-group-context';

const mockRpc = jest.fn<(name: string, args?: unknown) => Promise<{
  data: unknown; error: unknown;
}>>();
const mockInvoke = jest.fn<(name: string, options: unknown) => Promise<{
  data: unknown; error: unknown;
}>>();
const mockAuth = { isLoading: true, isAdmin: true, session: { user: { id: 'admin-1' } } };
const mockRefreshSession = jest.fn();
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => mockAuth }));
jest.mock('@/features/auth/supabase', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: () => ({ select: () => ({ order: () => ({ data: [], error: null }), data: [], error: null }) }),
    functions: { invoke: (name: string, options: unknown) => mockInvoke(name, options) },
    auth: { refreshSession: () => mockRefreshSession() },
  },
}));
jest.mock('@/features/network/supabase-read', () => ({
  ...jest.requireActual<object>('@/features/network/supabase-read'),
  withSupabaseReadTimeout: (read: (signal: AbortSignal) => unknown) => read(new AbortController().signal),
}));

let renderer: ReactTestRenderer | null;
let currentContext: ReturnType<typeof useTripGroups>;
const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
function Probe() {
  const context = useTripGroups();
  useEffect(() => { currentContext = context; }, [context]);
  return null;
}

describe('group location request push', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(async () => {
    jest.clearAllMocks();
    mockRpc.mockImplementation(async (name) => ({
      data: name === 'admin_request_organization_group_location' ? { id: 42 } : [], error: null,
    }));
    mockInvoke.mockResolvedValue({ data: { code: 'processed', pushFailed: false }, error: null });
    await act(async () => { renderer = create(<TripGroupProvider><Probe /></TripGroupProvider>); });
  });
  afterEach(async () => { await act(async () => renderer?.unmount()); renderer = null; });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment; });

  async function request() {
    let result: Awaited<ReturnType<typeof currentContext.requestLeaderLocation>> | undefined;
    await act(async () => { result = await currentContext.requestLeaderLocation(7, 'leader-2'); });
    return result;
  }

  it('dispatches the saved request ID to the selected leader', async () => {
    expect(await request()).toEqual({ error: null, pushFailed: false });
    expect(mockRpc).toHaveBeenCalledWith('admin_request_organization_group_location', {
      p_group_id: 7, p_leader_user_id: 'leader-2',
    });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('dispatch-group-location', { body: { requestId: 42 } });
  });

  it('does not dispatch when saving the request is denied', async () => {
    const error = { code: 'P0002', message: 'Group leader not found.' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    expect(await request()).toEqual({ error });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: new Error('Function unavailable') },
    { data: { code: 'processed', pushFailed: true }, error: null },
    { data: {}, error: null },
  ])('keeps the saved request and reports unsuccessful push dispatch: %j', async (push) => {
    mockInvoke.mockResolvedValueOnce(push);
    expect(await request()).toEqual({ error: null, pushFailed: true });
    expect(mockRpc.mock.calls.filter(([name]) => name === 'admin_request_organization_group_location')).toHaveLength(1);
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('keeps the saved request when the push call throws', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Network unavailable'));
    expect(await request()).toEqual({ error: null, pushFailed: true });
    expect(mockRpc.mock.calls.filter(([name]) => name === 'admin_request_organization_group_location')).toHaveLength(1);
  });
});
