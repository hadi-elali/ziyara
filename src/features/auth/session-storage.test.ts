import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createClient, isAuthRetryableFetchError, processLock } from '@supabase/supabase-js';

import { getAuthStorageKey, readStoredSession } from '@/features/auth/session-storage';

const storageKey = getAuthStorageKey('https://test-project.supabase.co');
const storedSession = {
  access_token: 'test-access',
  expires_at: 1,
  expires_in: 3600,
  refresh_token: 'test-refresh',
  token_type: 'bearer',
  user: {
    id: 'test-user',
    aud: 'authenticated',
    created_at: '2026-10-23T00:00:00Z',
    app_metadata: {},
    user_metadata: {},
  },
};

describe('stored auth session recovery', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('liest eine abgelaufene Session unter dem bisherigen SDK-Schlüssel nach einem Neustart', async () => {
    expect(storageKey).toBe('sb-test-project-auth-token');
    await AsyncStorage.setItem(storageKey, JSON.stringify(storedSession));
    expect(await readStoredSession(AsyncStorage, storageKey)).toEqual(storedSession);
    expect(await AsyncStorage.getItem(storageKey)).toBe(JSON.stringify(storedSession));
  });

  it.each([
    null,
    '{broken',
    'null',
    '[]',
    '{}',
    JSON.stringify({ ...storedSession, refresh_token: '' }),
    JSON.stringify({ ...storedSession, access_token: 123 }),
    JSON.stringify({ ...storedSession, expires_at: 'yesterday' }),
    JSON.stringify({ ...storedSession, user: { id: 'test-user' } }),
  ])('verwirft fehlende oder beschädigte Daten (%s)', async (serialized) => {
    if (serialized !== null) {
      await AsyncStorage.setItem(storageKey, serialized);
    }
    expect(await readStoredSession(AsyncStorage, storageKey)).toBeNull();
    expect(await AsyncStorage.getItem(storageKey)).toBe(serialized);
  });

  it('verwirft Speicherfehler', async () => {
    const storage = { getItem: async () => { throw new Error('Unavailable'); } };
    expect(await readStoredSession(storage, storageKey)).toBeNull();
  });

  it('findet eine ausdrücklich entfernte Session nicht wieder', async () => {
    await AsyncStorage.setItem(storageKey, JSON.stringify(storedSession));
    await AsyncStorage.removeItem(storageKey);
    expect(await readStoredSession(AsyncStorage, storageKey)).toBeNull();
  });

  it('bestätigt mit dem installierten SDK: ein Refresh-Ausfall liefert null und erhält die gespeicherten Tokens', async () => {
    jest.useFakeTimers();
    await AsyncStorage.setItem(storageKey, JSON.stringify(storedSession));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createClient('https://test-project.supabase.co', 'test-publishable-key', {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        lock: processLock,
        persistSession: true,
        storage: AsyncStorage,
      },
      global: { fetch: async () => new Response('{}', { status: 503 }) },
    });
    const initialSessions: unknown[] = [];
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        initialSessions.push(session);
      }
    });

    try {
      const resultPromise = client.auth.getSession();
      await jest.advanceTimersByTimeAsync(30_000);
      const result = await resultPromise;

      expect(initialSessions).toEqual([null]);
      expect(result.data.session).toBeNull();
      expect(isAuthRetryableFetchError(result.error)).toBe(true);
      expect(await readStoredSession(AsyncStorage, storageKey)).toEqual(storedSession);
    } finally {
      subscription.unsubscribe();
      await client.auth.stopAutoRefresh();
      warn.mockRestore();
      jest.useRealTimers();
    }
  });
});
