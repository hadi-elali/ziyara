import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Mock } from 'jest-mock';

import type { TripNavigationDestination } from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import {
  TripGuidanceProvider,
  useTripGuidance,
} from '@/features/trip-guidance/trip-guidance-context';
import type { TripNavigationCache } from '@/features/trip-guidance/trip-navigation-cache';

const session = { user: { id: 'guidance-user' } } as Session;
const mockAuthState: { isLoading: boolean; session: Session | null } = {
  isLoading: false,
  session,
};

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/features/auth/supabase', () => ({
  supabase: {
    channel: jest.fn(),
    from: jest.fn(),
    removeChannel: jest.fn(),
    rpc: jest.fn(),
  },
}));

const mockNavigationCacheState: {
  loaded: boolean;
  setValue: ReturnType<typeof jest.fn>;
  value: TripNavigationCache | null;
} = {
  loaded: true,
  setValue: jest.fn(),
  value: null,
};

jest.mock('@/features/trip-guidance/trip-navigation-cache', () => ({
  useTripNavigationCache: () => [
    mockNavigationCacheState.value,
    mockNavigationCacheState.setValue,
    mockNavigationCacheState.loaded,
  ],
}));

type QueryResult<T> = { data: T; error: unknown | null };
type MockFunction = Mock<(...args: never[]) => unknown>;
type MockChannel = { on: MockFunction; subscribe: MockFunction };
type MockSupabase = {
  channel: MockFunction;
  from: MockFunction;
  removeChannel: MockFunction;
  rpc: MockFunction;
};

const navigationDestination: TripNavigationDestination = {
  archived_at: null,
  created_at: '2026-08-27T08:10:00Z',
  created_by_profile_id: 1,
  details: 'Neben dem Haupteingang',
  id: 35,
  latitude: 32.618,
  longitude: 44.034,
  name: 'Hotel',
  sort_order: 0,
  trip_id: null,
  updated_at: '2026-08-27T08:10:00Z',
};
const mockSupabase = supabase as unknown as MockSupabase;
const responses = new Map<string, Promise<QueryResult<unknown>>[]>();
const actEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
let currentContext: ReturnType<typeof useTripGuidance> | null;
let renderer: ReactTestRenderer | null;

function enqueue<T>(table: string, result: QueryResult<T>) {
  const queue = responses.get(table) ?? [];
  queue.push(Promise.resolve(result) as Promise<QueryResult<unknown>>);
  responses.set(table, queue);
}

function dequeue(table: string) {
  const result = responses.get(table)?.shift();
  if (!result) throw new Error(`Für ${table} fehlt eine Testantwort.`);
  return result;
}

function queueSnapshot(destinations: TripNavigationDestination[] = []) {
  enqueue('trip_navigation_destinations', { data: destinations, error: null });
}

function Probe() {
  const context = useTripGuidance();
  useEffect(() => {
    currentContext = context;
  }, [context]);
  return null;
}

function context() {
  if (!currentContext) throw new Error('TripGuidanceProvider wurde noch nicht gerendert.');
  return currentContext;
}

async function flush() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (condition()) return;
    await act(flush);
  }
  throw new Error('Erwarteter Reisezielzustand wurde nicht erreicht.');
}

describe('TripGuidanceProvider', () => {
  beforeAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    currentContext = null;
    renderer = null;
    responses.clear();
    jest.clearAllMocks();
    mockAuthState.isLoading = false;
    mockAuthState.session = session;
    mockNavigationCacheState.loaded = true;
    mockNavigationCacheState.setValue.mockReset();
    mockNavigationCacheState.value = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      () => ({ remove: jest.fn() }) as NativeEventSubscription,
    );
    mockSupabase.removeChannel.mockImplementation(() => Promise.resolve('ok'));
    mockSupabase.channel.mockImplementation(() => {
      const channel: MockChannel = { on: jest.fn(), subscribe: jest.fn() };
      channel.on.mockReturnValue(channel);
      channel.subscribe.mockReturnValue(channel);
      return channel;
    });
    mockSupabase.from.mockImplementation((table: string) => {
      const query = {
        abortSignal: jest.fn(),
        is: jest.fn(),
        order: jest.fn(),
        select: jest.fn(),
      };
      query.is.mockReturnValue(query);
      query.order.mockReturnValue(query);
      query.select.mockReturnValue(query);
      query.abortSignal.mockImplementation(() => dequeue(table));
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

  it('bleibt ohne Kartenorte in einem leeren, bereiten Zustand', async () => {
    enqueue('trip_navigation_destinations', { data: [], error: null });

    await act(async () => {
      renderer = create(
        <TripGuidanceProvider>
          <Probe />
        </TripGuidanceProvider>,
      );
    });
    await waitFor(() => !context().isLoading);

    expect(context()).toMatchObject({
      hasSyncError: false,
      navigationDestinations: [],
    });
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
  });

  it('lädt und speichert Kartenorte ohne aktive Zwischenreise oder Zuordnung', async () => {
    enqueue('trip_navigation_destinations', { data: [navigationDestination], error: null });

    await act(async () => {
      renderer = create(<TripGuidanceProvider><Probe /></TripGuidanceProvider>);
    });
    await waitFor(() => !context().isLoading);

    expect(context()).toMatchObject({
      hasSyncError: false,
      navigationDestinations: [navigationDestination],
    });
    expect(mockNavigationCacheState.setValue).toHaveBeenCalledWith({
      destinations: [navigationDestination],
      userId: session.user.id,
    });
    expect(mockSupabase.from.mock.calls.map(([table]) => table)).toEqual(['trip_navigation_destinations']);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('behält Kartenorte bei einer Aktualisierung und übernimmt spätere Entfernungen', async () => {
    queueSnapshot([navigationDestination]);
    await act(async () => {
      renderer = create(<TripGuidanceProvider><Probe /></TripGuidanceProvider>);
    });
    await waitFor(() => !context().isLoading);

    enqueue('trip_navigation_destinations', { data: [navigationDestination], error: null });
    await act(async () => { await context().refresh(); });
    expect(context().navigationDestinations).toEqual([navigationDestination]);

    enqueue('trip_navigation_destinations', { data: [], error: null });
    await act(async () => { await context().refresh(); });
    expect(context().navigationDestinations).toEqual([]);
    expect(mockNavigationCacheState.setValue).toHaveBeenLastCalledWith({
      destinations: [], userId: session.user.id,
    });
  });

  it('speichert geladene Kartenorte für den nächsten App-Start', async () => {
    queueSnapshot([navigationDestination]);

    await act(async () => {
      renderer = create(
        <TripGuidanceProvider>
          <Probe />
        </TripGuidanceProvider>,
      );
    });
    await waitFor(() => !context().isLoading && context().navigationDestinations.length === 1);

    expect(mockNavigationCacheState.setValue).toHaveBeenCalledWith({
      destinations: [navigationDestination],
      userId: session.user.id,
    });
  });

  it('zeigt gespeicherte Kartenorte nach einem Neustart trotz erstem Lesefehler', async () => {
    mockNavigationCacheState.value = {
      destinations: [navigationDestination],
      userId: session.user.id,
    };
    enqueue('trip_navigation_destinations', { data: null, error: new TypeError('Failed to fetch') });

    await act(async () => {
      renderer = create(
        <TripGuidanceProvider>
          <Probe />
        </TripGuidanceProvider>,
      );
    });
    await waitFor(() => context().hasSyncError);

    expect(context().navigationDestinations).toEqual([navigationDestination]);
    expect(context().syncErrorMessage).toBe('Failed to fetch');
  });

  it('ersetzt den Cache mit einer erfolgreichen leeren Serverantwort', async () => {
    mockNavigationCacheState.value = {
      destinations: [navigationDestination],
      userId: session.user.id,
    };
    queueSnapshot();

    await act(async () => {
      renderer = create(
        <TripGuidanceProvider>
          <Probe />
        </TripGuidanceProvider>,
      );
    });
    await waitFor(() => !context().isLoading);

    expect(context().navigationDestinations).toEqual([]);
    expect(mockNavigationCacheState.setValue).toHaveBeenCalledWith({
      destinations: [],
      userId: session.user.id,
    });
  });

  it('zeigt den Cache eines anderen Kontos nicht an', async () => {
    mockNavigationCacheState.value = {
      destinations: [navigationDestination],
      userId: 'anderes-konto',
    };
    enqueue('trip_navigation_destinations', { data: null, error: new TypeError('Failed to fetch') });

    await act(async () => {
      renderer = create(
        <TripGuidanceProvider>
          <Probe />
        </TripGuidanceProvider>,
      );
    });
    await waitFor(() => context().hasSyncError);

    expect(context().navigationDestinations).toEqual([]);
  });
});
