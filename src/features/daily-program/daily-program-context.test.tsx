import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PostgrestError, type Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Mock } from 'jest-mock';

import type { DailyProgram } from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import type { DailyProgramCache } from '@/features/daily-program/daily-program-cache';
import {
  DailyProgramProvider,
  useDailyProgram,
} from '@/features/daily-program/daily-program-context';

const mockSession = { user: { id: 'daily-program-user' } } as Session;

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ isLoading: false, session: mockSession }),
}));

jest.mock('@/features/auth/supabase', () => ({
  supabase: {
    channel: jest.fn(),
    from: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

const mockDailyProgramCacheState: {
  loaded: boolean;
  setValue: ReturnType<typeof jest.fn>;
  value: DailyProgramCache | null;
} = {
  loaded: true,
  setValue: jest.fn(),
  value: null,
};

jest.mock('@/features/daily-program/daily-program-cache', () => ({
  useDailyProgramCache: () => [
    mockDailyProgramCacheState.value,
    mockDailyProgramCacheState.setValue,
    mockDailyProgramCacheState.loaded,
  ],
}));

type QueryResult = { data: DailyProgram[] | null; error: PostgrestError | null };
type MockFunction = Mock<(...args: never[]) => unknown>;
type MockChannel = { on: MockFunction; subscribe: MockFunction };
type MockSupabase = {
  channel: MockFunction;
  from: MockFunction;
  removeChannel: MockFunction;
};

const savedProgram: DailyProgram = {
  created_at: '2026-08-28T08:00:00.000Z',
  details: '08:00 Frühstück\n09:00 Abfahrt',
  id: 1,
  program_date: '2026-08-28',
  published_by_profile_id: 1,
  title: 'Karbala',
  updated_at: '2026-08-28T08:00:00.000Z',
};
const syncError = new PostgrestError({
  code: 'PGRST001',
  details: '',
  hint: '',
  message: 'backend unavailable',
});
const mockSupabase = supabase as unknown as MockSupabase;
const actEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;

let appStateListener: ((state: string) => void) | null;
let channelListener: (() => void) | null;
let currentContext: ReturnType<typeof useDailyProgram> | null;
let queryResponses: Promise<QueryResult>[];
let renderer: ReactTestRenderer | null;

function DailyProgramProbe() {
  const value = useDailyProgram();
  useEffect(() => {
    currentContext = value;
  }, [value]);
  return null;
}

function getContext() {
  if (!currentContext) throw new Error('DailyProgramProvider wurde noch nicht gerendert.');
  return currentContext;
}

async function flushAsyncWork() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function waitForReady() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!getContext().isLoading) return;
    await act(flushAsyncWork);
  }
  throw new Error('Der Tagesprogramm-Zustand wurde nicht rechtzeitig geladen.');
}

async function renderProvider(initialResult: QueryResult) {
  queryResponses.push(Promise.resolve(initialResult));
  await act(async () => {
    renderer = create(
      <DailyProgramProvider>
        <DailyProgramProbe />
      </DailyProgramProvider>,
    );
  });
  await waitForReady();
}

describe('DailyProgramProvider', () => {
  beforeAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    appStateListener = null;
    channelListener = null;
    currentContext = null;
    queryResponses = [];
    renderer = null;
    jest.clearAllMocks();
    mockDailyProgramCacheState.loaded = true;
    mockDailyProgramCacheState.setValue.mockReset();
    mockDailyProgramCacheState.value = null;

    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: jest.fn() } as NativeEventSubscription;
    });
    mockSupabase.removeChannel.mockImplementation(() => Promise.resolve('ok'));
    mockSupabase.channel.mockImplementation(() => {
      const channel: MockChannel = {
        on: jest.fn((_event, _filter, listener) => {
          channelListener = listener as () => void;
          return channel;
        }),
        subscribe: jest.fn(),
      };
      channel.subscribe.mockReturnValue(channel);
      return channel;
    });
    mockSupabase.from.mockImplementation(() => {
      const query = {
        abortSignal: jest.fn(),
        order: jest.fn(),
        select: jest.fn(),
      };
      query.abortSignal.mockImplementation(() => {
        const response = queryResponses.shift();
        if (!response) throw new Error('Für daily_programs fehlt eine Testantwort.');
        return response;
      });
      query.order.mockReturnValue(query);
      query.select.mockReturnValue(query);
      return query;
    });
  });

  afterEach(async () => {
    if (renderer) await act(async () => renderer?.unmount());
    jest.restoreAllMocks();
  });

  afterAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  it('lädt Programme und aktualisiert sie über Realtime und App-Resume', async () => {
    await renderProvider({ data: [savedProgram], error: null });
    expect(getContext()).toMatchObject({
      hasProgramSnapshot: true,
      hasSyncError: false,
      isLoading: false,
      programs: [savedProgram],
      syncErrorKind: null,
    });
    expect(mockDailyProgramCacheState.setValue).toHaveBeenCalledWith({
      programs: [savedProgram],
      userId: mockSession.user.id,
    });

    queryResponses.push(Promise.resolve({ data: [], error: null }));
    await act(async () => {
      channelListener?.();
      await flushAsyncWork();
    });
    expect(getContext().programs).toEqual([]);

    queryResponses.push(Promise.resolve({ data: [savedProgram], error: null }));
    await act(async () => {
      appStateListener?.('active');
      await flushAsyncWork();
    });
    expect(getContext().programs).toEqual([savedProgram]);
  });

  it('behält Programme bei einem fehlgeschlagenen Hintergrundrefresh sichtbar', async () => {
    await renderProvider({ data: [savedProgram], error: null });
    queryResponses.push(Promise.resolve({ data: null, error: syncError }));

    await act(async () => getContext().refresh());

    expect(getContext()).toMatchObject({
      hasProgramSnapshot: true,
      hasSyncError: true,
      isLoading: false,
      programs: [savedProgram],
      syncErrorKind: 'server',
      syncErrorMessage: 'backend unavailable',
    });
  });

  it('zeigt den lokalen Stand sofort und aktualisiert ihn im Hintergrund', async () => {
    mockDailyProgramCacheState.value = {
      programs: [savedProgram],
      userId: mockSession.user.id,
    };
    queryResponses.push(new Promise<QueryResult>(() => undefined));

    await act(async () => {
      renderer = create(
        <DailyProgramProvider>
          <DailyProgramProbe />
        </DailyProgramProvider>,
      );
      await flushAsyncWork();
    });

    expect(getContext()).toMatchObject({
      hasProgramSnapshot: true,
      hasSyncError: false,
      isLoading: false,
      isRefreshing: true,
      programs: [savedProgram],
    });
  });
});
