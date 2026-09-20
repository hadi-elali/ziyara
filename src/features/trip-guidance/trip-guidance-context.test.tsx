import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Mock } from 'jest-mock';

import type {
  Trip,
  TripGuidanceResponse,
  TripGuidanceUpdate,
  TripNavigationDestination,
  TripParticipant,
} from '@/domain/database';
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
    auth: { refreshSession: jest.fn() },
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
  auth: { refreshSession: MockFunction };
  channel: MockFunction;
  from: MockFunction;
  removeChannel: MockFunction;
  rpc: MockFunction;
};

const activeTrip: Trip = {
  archived_at: null,
  created_at: '2026-08-27T08:00:00Z',
  created_by_profile_id: 1,
  id: 10,
  name: 'Ziyara 2026',
};
const participant: TripParticipant = {
  assignment_family_id: null,
  bus_id: 20,
  created_at: '2026-08-27T08:02:00Z',
  display_name: 'Testteilnehmer',
  id: 30,
  participant_code: 'BER01',
  profile_id: 7,
  trip_id: activeTrip.id,
  updated_at: '2026-08-27T08:02:00Z',
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
  trip_id: activeTrip.id,
  updated_at: '2026-08-27T08:10:00Z',
};
const guidance: TripGuidanceUpdate = {
  acts: null,
  closed_at: null,
  current_latitude: 32.616,
  current_longitude: 44.032,
  current_place_name: 'Karbala',
  current_place_slug: null,
  departure_at: '2026-08-27T09:00:00Z',
  description: 'Treffpunkt-Test',
  distance_hint: '300 m',
  id: 40,
  meeting_latitude: 32.617,
  meeting_longitude: 44.033,
  meeting_point: 'Tor 3',
  next_program_name: 'Najaf',
  published_at: '2026-08-27T08:30:00Z',
  published_by_profile_id: 1,
  relevant_gate: 'Tür 3',
  trip_id: activeTrip.id,
  updated_at: '2026-08-27T08:30:00Z',
};
const transmittedResponse: TripGuidanceResponse = {
  acknowledged_at: null,
  acknowledged_by_display_name: null,
  acknowledged_by_profile_id: null,
  created_at: '2026-08-27T08:31:00Z',
  guidance_id: guidance.id,
  id: 50,
  participant_id: participant.id,
  status: 'almost_there',
  trip_id: activeTrip.id,
  updated_at: '2026-08-27T08:31:00Z',
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

function queueSnapshot(
  serverResponses: TripGuidanceResponse[] = [],
  destinations: TripNavigationDestination[] = [],
) {
  enqueue('trips', { data: activeTrip, error: null });
  enqueue('trip_participants', { data: [participant], error: null });
  enqueue('trip_guidance_updates', { data: guidance, error: null });
  enqueue('trip_navigation_destinations', { data: destinations, error: null });
  enqueue('trip_guidance_responses', { data: serverResponses, error: null });
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
  throw new Error('Erwarteter Reiseführungszustand wurde nicht erreicht.');
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
    mockSupabase.auth.refreshSession.mockImplementation(() =>
      Promise.resolve({ data: { session }, error: null }),
    );
    mockSupabase.channel.mockImplementation(() => {
      const channel: MockChannel = { on: jest.fn(), subscribe: jest.fn() };
      channel.on.mockReturnValue(channel);
      channel.subscribe.mockReturnValue(channel);
      return channel;
    });
    mockSupabase.from.mockImplementation((table: string) => {
      const query = {
        abortSignal: jest.fn(),
        eq: jest.fn(),
        is: jest.fn(),
        maybeSingle: jest.fn(),
        order: jest.fn(),
        select: jest.fn(),
      };
      query.eq.mockReturnValue(query);
      query.is.mockReturnValue(query);
      query.order.mockReturnValue(query);
      query.select.mockReturnValue(query);
      query.abortSignal.mockImplementation(() =>
        table === 'trips' || table === 'trip_guidance_updates' ? query : dequeue(table),
      );
      query.maybeSingle.mockImplementation(() => dequeue(table));
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

  it('markiert einen Offline-Status lokal und überträgt ihn beim Retry', async () => {
    queueSnapshot();
    mockSupabase.rpc.mockImplementation(() =>
      Promise.resolve({
        data: null,
        error: { code: '', details: '', hint: '', message: 'TypeError: Failed to fetch' },
      }),
    );

    await act(async () => {
      renderer = create(
        <TripGuidanceProvider>
          <Probe />
        </TripGuidanceProvider>,
      );
    });
    await waitFor(() => !context().isLoading && context().activeGuidance?.id === guidance.id);

    await act(async () => {
      const result = await context().setStatus(guidance.id, participant.id, 'almost_there');
      expect(result).toEqual({ error: null, queued: true });
    });
    await waitFor(() => context().participants[0]?.isPending === true);
    expect(context().participants[0]?.status).toBe('almost_there');
    expect(context().pendingCount).toBe(1);

    mockSupabase.rpc.mockImplementation(() =>
      Promise.resolve({ data: transmittedResponse, error: null }),
    );
    queueSnapshot([transmittedResponse]);
    await act(async () => {
      await context().retryPending();
    });
    await waitFor(
      () =>
        context().pendingCount === 0 &&
        context().participants[0]?.response?.status === 'almost_there',
    );
    expect(context().participants[0]?.isPending).toBe(false);
  });

  it('speichert einen Problemstatus und übernimmt ihn mit dem Leiternamen', async () => {
    const problemResponse: TripGuidanceResponse = {
      ...transmittedResponse,
      status: 'problem',
    };
    const acknowledgedResponse: TripGuidanceResponse = {
      ...problemResponse,
      acknowledged_at: '2026-08-27T08:35:00Z',
      acknowledged_by_display_name: 'Leiter 2',
      acknowledged_by_profile_id: 1,
    };
    queueSnapshot();
    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === 'respond_to_trip_guidance') {
        return Promise.resolve({ data: problemResponse, error: null });
      }
      if (name === 'admin_acknowledge_trip_guidance_problem') {
        return Promise.resolve({ data: acknowledgedResponse, error: null });
      }
      throw new Error(`Unerwartete RPC: ${name}`);
    });

    await act(async () => {
      renderer = create(
        <TripGuidanceProvider>
          <Probe />
        </TripGuidanceProvider>,
      );
    });
    await waitFor(() => !context().isLoading && context().activeGuidance?.id === guidance.id);

    queueSnapshot([problemResponse]);
    await act(async () => {
      const result = await context().setStatus(guidance.id, participant.id, 'problem');
      expect(result).toEqual({ error: null, queued: false });
    });
    expect(context().participants[0]?.status).toBe('problem');

    queueSnapshot([acknowledgedResponse]);
    await act(async () => {
      const result = await context().acknowledgeProblem(problemResponse.id);
      expect(result.error).toBeNull();
    });
    expect(context().participants[0]?.response?.acknowledged_by_display_name).toBe('Leiter 2');
  });

  it('bleibt ohne aktive Reise in einem leeren, bereiten Zustand', async () => {
    enqueue('trips', { data: null, error: null });

    await act(async () => {
      renderer = create(
        <TripGuidanceProvider>
          <Probe />
        </TripGuidanceProvider>,
      );
    });
    await waitFor(() => !context().isLoading);

    expect(context()).toMatchObject({
      activeGuidance: null,
      activeTrip: null,
      hasSyncError: false,
      participants: [],
    });
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
  });

  it('speichert geladene Kartenorte für den nächsten App-Start', async () => {
    queueSnapshot([], [navigationDestination]);

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
      tripId: activeTrip.id,
      userId: session.user.id,
    });
  });

  it('zeigt gespeicherte Kartenorte nach einem Neustart trotz erstem Lesefehler', async () => {
    mockNavigationCacheState.value = {
      destinations: [navigationDestination],
      tripId: activeTrip.id,
      userId: session.user.id,
    };
    enqueue('trips', { data: null, error: new TypeError('Failed to fetch') });

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
      tripId: activeTrip.id,
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
      tripId: activeTrip.id,
      userId: session.user.id,
    });
  });

  it('zeigt den Cache eines anderen Kontos nicht an', async () => {
    mockNavigationCacheState.value = {
      destinations: [navigationDestination],
      tripId: activeTrip.id,
      userId: 'anderes-konto',
    };
    enqueue('trips', { data: null, error: new TypeError('Failed to fetch') });

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
