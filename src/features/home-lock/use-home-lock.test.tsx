import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import * as ReactNative from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createPersistentState } from '@/features/storage/persistentState';

const mockSupabase = {
  channel: jest.fn(),
  from: jest.fn(),
  removeChannel: jest.fn<(channel: unknown) => Promise<string>>(),
};
jest.mock('@/features/auth/supabase', () => ({ supabase: mockSupabase }));

type QueryResult = { data: { lock: boolean | null } | null; error: { message: string } | null };
const result = (lock: boolean | null): QueryResult => ({ data: { lock }, error: null });
const failure: QueryResult = { data: null, error: { message: 'backend unavailable' } };
const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let useTestHomeLock: () => boolean;
let locked: boolean;
let responses: Promise<QueryResult>[];
let onChange: () => void;
let onSubscribe: (status: string) => void;
let onAppState: (state: ReactNative.AppStateStatus) => void;
let renderer: ReactTestRenderer | null;
let removedAppStateListener: ReturnType<typeof jest.fn>;
let lastQuery: {
  select: ReturnType<typeof jest.fn>;
  eq: ReturnType<typeof jest.fn>;
  abortSignal: ReturnType<typeof jest.fn>;
};

function Probe() {
  const value = useTestHomeLock();
  React.useEffect(() => { locked = value; }, [value]);
  return null;
}

async function flush() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

async function mount() {
  await act(async () => {
    renderer = create(<Probe />);
    await flush();
  });
}

describe('useHomeLock', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    renderer = null;
    responses = [];
    locked = false;
    (AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>).mockResolvedValue(undefined);
    removedAppStateListener = jest.fn();
    jest.spyOn(ReactNative.AppState, 'addEventListener').mockImplementation((_event, listener) => {
      onAppState = listener;
      return { remove: removedAppStateListener };
    });
    mockSupabase.removeChannel.mockResolvedValue('ok');
    mockSupabase.channel.mockImplementation(() => {
      const channel = {
        on: jest.fn((_event: unknown, _filter: unknown, callback: () => void) => {
          onChange = callback;
          return channel;
        }),
        subscribe: jest.fn((callback: (status: string) => void) => {
          onSubscribe = callback;
          return channel;
        }),
      };
      return channel;
    });
    mockSupabase.from.mockImplementation(() => {
      const response = responses.shift();
      if (!response) throw new Error('Für lock_app fehlt eine Testantwort.');
      const query = {
        select: jest.fn(), eq: jest.fn(), abortSignal: jest.fn(),
        maybeSingle: jest.fn(() => response),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.abortSignal.mockReturnValue(query);
      lastQuery = query;
      return query;
    });

    // Reload only the hook/store, retaining the renderer's React instance.
    // This models a fresh process reading actual AsyncStorage data.
    jest.isolateModules(() => {
      jest.doMock('react', () => React);
      jest.doMock('react-native', () => ReactNative);
      jest.doMock('@/features/storage/persistentState', () => ({ createPersistentState }));
      useTestHomeLock = jest.requireActual<typeof import('./use-home-lock')>('./use-home-lock').useHomeLock;
    });
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment; });

  it('startet ohne gespeicherten Wert und ohne Verbindung standardmäßig mit false', async () => {
    responses.push(Promise.resolve(failure));
    await mount();
    expect(locked).toBe(false);
    expect(mockSupabase.from).toHaveBeenCalledWith('lock_app');
    expect(lastQuery.select).toHaveBeenCalledWith('lock');
    expect(lastQuery.eq).toHaveBeenCalledWith('id', 1);
  });

  it('übernimmt true und false live, ohne Anmeldung vorauszusetzen', async () => {
    responses.push(Promise.resolve(result(false)));
    await mount();
    responses.push(Promise.resolve(result(true)));
    await act(async () => { onChange(); await flush(); });
    expect(locked).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('ziyara.home-lock.v1', 'true');

    responses.push(Promise.resolve(result(false)));
    await act(async () => { onChange(); await flush(); });
    expect(locked).toBe(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('ziyara.home-lock.v1', 'false');
  });

  it('lädt eine bekannte Sperre nach einem Neustart und behält sie bei Lesefehlern', async () => {
    (AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>).mockResolvedValue('true');
    responses.push(Promise.resolve(failure));
    await mount();
    expect(locked).toBe(true);

    responses.push(Promise.resolve(result(false)));
    await act(async () => { onAppState('active'); await flush(); });
    expect(locked).toBe(false);
  });

  it('prüft nach Realtime-Wiederverbindung und per Fallback erneut', async () => {
    responses.push(Promise.resolve(result(false)));
    await mount();
    responses.push(Promise.resolve(result(true)));
    await act(async () => { onSubscribe('SUBSCRIBED'); await flush(); });
    expect(locked).toBe(true);

    responses.push(Promise.resolve(result(false)));
    await act(async () => { jest.advanceTimersByTime(40_000); await flush(); });
    expect(locked).toBe(false);
  });

  it.each([null, '"true"', '{'])('verwirft einen unbrauchbaren Speicherwert %s', async (stored) => {
    (AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>).mockResolvedValue(stored);
    responses.push(Promise.resolve(failure));
    await mount();
    expect(locked).toBe(false);
  });

  it('behandelt eine fehlende Zeile und einen alten NULL-Wert als false', async () => {
    responses.push(Promise.resolve(result(true)));
    await mount();
    responses.push(Promise.resolve({ data: null, error: null }));
    await act(async () => { onChange(); await flush(); });
    expect(locked).toBe(false);

    responses.push(Promise.resolve(result(true)));
    await act(async () => { onChange(); await flush(); });
    responses.push(Promise.resolve(result(null)));
    await act(async () => { onChange(); await flush(); });
    expect(locked).toBe(false);
  });

  it('lässt einen älteren Read eine neuere Sperre nicht überschreiben', async () => {
    let resolveOldRead: ((value: QueryResult) => void) | undefined;
    responses.push(new Promise((resolve) => { resolveOldRead = resolve; }));
    await mount();
    responses.push(Promise.resolve(result(true)));
    await act(async () => { onChange(); await flush(); });
    expect(locked).toBe(true);

    await act(async () => { resolveOldRead?.(result(false)); await flush(); });
    expect(locked).toBe(true);
  });

  it('löst einen Read-Timeout auf und entfernt Timer und Listener beim Unmount', async () => {
    responses.push(new Promise(() => undefined));
    await mount();
    await act(async () => { jest.advanceTimersByTime(10_000); await flush(); });
    expect(locked).toBe(false);
    expect((lastQuery.abortSignal.mock.calls[0]?.[0] as AbortSignal).aborted).toBe(true);
    await act(async () => { renderer?.unmount(); renderer = null; });
    expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(removedAppStateListener).toHaveBeenCalledTimes(1);
    const readCount = mockSupabase.from.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(120_000); await flush(); });
    expect(mockSupabase.from).toHaveBeenCalledTimes(readCount);
  });
});
