import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { isAuthSessionMissingError } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js', () => ({
  ...jest.requireActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js'),
  createClient: jest.fn(() => ({ auth: { getUser: jest.fn(), signOut: jest.fn() } })),
}));

const previousUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const previousKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const storageKey = 'sb-verification-fixture-auth-token';
let verifySessionUser: typeof import('@/features/auth/supabase').verifySessionUser;
let sharedClient: typeof import('@/features/auth/supabase').supabase;

beforeAll(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://verification-fixture.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'fixture-publishable-key';
  const module = jest.requireActual<typeof import('@/features/auth/supabase')>('@/features/auth/supabase');
  verifySessionUser = module.verifySessionUser;
  sharedClient = module.supabase;
});

afterEach(() => { jest.restoreAllMocks(); });

afterAll(() => {
  if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
});

describe('authoritative session verification', () => {
  it('verifies the captured token with Auth and forwards the read abort signal', async () => {
    const controller = new AbortController();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'verified-user' }), { status: 200 }),
    );

    const result = await verifySessionUser('captured-access-token', controller.signal);

    expect(result.error).toBeNull();
    expect(result.data.user?.id).toBe('verified-user');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://verification-fixture.supabase.co/auth/v1/user');
    expect(init?.signal).toBe(controller.signal);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer captured-access-token');
    expect(new Headers(init?.headers).get('apikey')).toBe('fixture-publishable-key');
  });

  it('keeps the main SDK and stored credentials untouched when an obsolete session is rejected', async () => {
    const storedNewSession = JSON.stringify({ access_token: 'newer-token', user: { id: 'new-user' } });
    await AsyncStorage.setItem(storageKey, storedNewSession);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'session_not_found', msg: 'Old session no longer exists' }), {
        status: 403,
        headers: { 'X-Supabase-Api-Version': '2024-01-01' },
      }),
    );

    const result = await verifySessionUser('obsolete-token', new AbortController().signal);

    expect(isAuthSessionMissingError(result.error)).toBe(true);
    expect(await AsyncStorage.getItem(storageKey)).toBe(storedNewSession);
    expect(sharedClient.auth.getUser).not.toHaveBeenCalled();
    expect(sharedClient.auth.signOut).not.toHaveBeenCalled();
  });

  it('aborts the actual Auth request when the timeout controller is aborted', async () => {
    const controller = new AbortController();
    let requestStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { requestStarted = resolve; });
    jest.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      requestStarted?.();
    }));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const verification = verifySessionUser('captured-token', controller.signal);
    await started;
    controller.abort();
    const result = await verification;

    expect(controller.signal.aborted).toBe(true);
    expect(result.data.user).toBeNull();
    expect(result.error).not.toBeNull();
    consoleError.mockRestore();
  });

  it('keeps concurrent token checks and their abort controllers independent', async () => {
    const first = new AbortController();
    const second = new AbortController();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const userId = new Headers(init?.headers).get('Authorization') === 'Bearer first-token' ? 'first-user' : 'second-user';
      return new Response(JSON.stringify({ id: userId }), { status: 200 });
    });

    const [firstResult, secondResult] = await Promise.all([
      verifySessionUser('first-token', first.signal),
      verifySessionUser('second-token', second.signal),
    ]);

    expect(firstResult.data.user?.id).toBe('first-user');
    expect(secondResult.data.user?.id).toBe('second-user');
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(first.signal);
    expect(fetchMock.mock.calls[1][1]?.signal).toBe(second.signal);
  });
});
