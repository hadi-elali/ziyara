import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { PostgrestError, type Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Mock } from 'jest-mock';

import type {
  BusBoarding,
  BusBoardingResponse,
  Trip,
  TripBus,
  TripParticipant,
} from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import {
  BusManagementProvider,
  useBusManagement,
} from '@/features/bus-management/bus-management-context';

const session = { user: { id: 'bus-user' } } as Session;
const mockAuthState: { isLoading: boolean; session: Session | null } = {
  isLoading: false,
  session,
};

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/features/auth/supabase', () => ({
  supabase: {
    auth: {
      refreshSession: jest.fn(),
    },
    channel: jest.fn(),
    from: jest.fn(),
    removeChannel: jest.fn(),
    rpc: jest.fn(),
  },
}));

type QueryResult<T> = { data: T; error: PostgrestError | null };
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
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
const bus: TripBus = {
  created_at: '2026-08-27T08:01:00Z',
  id: 20,
  leader_participant_id: 30,
  name: 'Bus 1',
  sort_order: 0,
  trip_id: activeTrip.id,
};
const participant: TripParticipant = {
  assignment_family_id: null,
  bus_id: bus.id,
  created_at: '2026-08-27T08:02:00Z',
  display_name: 'Testteilnehmer',
  id: 30,
  participant_code: 'BER01',
  profile_id: 7,
  trip_id: activeTrip.id,
  updated_at: '2026-08-27T08:02:00Z',
};
const activeBoarding: BusBoarding = {
  closed_at: null,
  created_by_profile_id: 1,
  departure_at: '2026-08-27T09:00:00Z',
  id: 40,
  opened_at: '2026-08-27T08:30:00Z',
  reminder_interval_minutes: 5,
  title: 'Abfahrt Karbala',
  trip_id: activeTrip.id,
  urgent_before_minutes: 5,
};
const onWayResponse: BusBoardingResponse = {
  boarding_id: activeBoarding.id,
  created_at: '2026-08-27T08:31:00Z',
  id: 50,
  participant_id: participant.id,
  status: 'on_way',
  trip_id: activeTrip.id,
  updated_at: '2026-08-27T08:31:00Z',
  updated_by_profile_id: 7,
};
const boardedResponse: BusBoardingResponse = { ...onWayResponse, status: 'boarded' };
const mockSupabase = supabase as unknown as MockSupabase;
const responses = new Map<string, Promise<QueryResult<unknown>>[]>();
const actEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
let currentContext: ReturnType<typeof useBusManagement> | null;
let renderer: ReactTestRenderer | null;

function deferred<T>(): Deferred<T> {
  let resolver: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (!resolver) throw new Error('Deferred Promise fehlt.');
      resolver(value);
    },
  };
}

function enqueue<T>(table: string, result: Promise<QueryResult<T>> | QueryResult<T>) {
  const queue = responses.get(table) ?? [];
  queue.push(Promise.resolve(result) as Promise<QueryResult<unknown>>);
  responses.set(table, queue);
}

function dequeue(table: string) {
  const result = responses.get(table)?.shift();
  if (!result) throw new Error(`Für ${table} fehlt eine Testantwort.`);
  return result;
}

function queueSnapshot(response: BusBoardingResponse[] = [onWayResponse]) {
  enqueue('trips', { data: [activeTrip], error: null });
  enqueue('trip_buses', { data: [bus], error: null });
  enqueue('trip_participants', { data: [participant], error: null });
  enqueue('bus_boardings', { data: activeBoarding, error: null });
  enqueue('bus_boarding_responses', { data: response, error: null });
  enqueue('bus_boarding_escalations', { data: [], error: null });
}

function Probe() {
  const context = useBusManagement();
  useEffect(() => {
    currentContext = context;
  }, [context]);
  return null;
}

function context() {
  if (!currentContext) throw new Error('BusManagementProvider wurde noch nicht gerendert.');
  return currentContext;
}

async function flush() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (condition()) return;
    await act(flush);
  }
  throw new Error('Erwarteter Busmanagement-Zustand wurde nicht erreicht.');
}

async function renderLoadedProvider() {
  queueSnapshot();
  await act(async () => {
    renderer = create(
      <BusManagementProvider>
        <Probe />
      </BusManagementProvider>,
    );
  });
  await waitFor(() => !context().isLoading && context().participants[0]?.status === 'on_way');
}

describe('BusManagementProvider', () => {
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
    mockSupabase.auth.refreshSession.mockImplementation(() =>
      Promise.resolve({ data: { session }, error: null }),
    );
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
        table === 'bus_boardings' ? query : dequeue(table),
      );
      query.maybeSingle.mockImplementation(() => dequeue(table));
      return query;
    });
    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name !== 'respond_to_bus_boarding') {
        throw new Error(`Unerwartete RPC im Busmanagement-Test: ${name}`);
      }
      return Promise.resolve({ data: boardedResponse, error: null });
    });
  });

  afterEach(async () => {
    if (renderer) await act(async () => renderer?.unmount());
    jest.restoreAllMocks();
  });

  afterAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  it('lädt Fahrt, Zuordnung und aktuellen Boarding-Status', async () => {
    await renderLoadedProvider();

    expect(context()).toMatchObject({
      activeBoarding,
      activeTrip,
      hasSyncError: false,
      isLoading: false,
    });
    expect(context().participants).toEqual([
      expect.objectContaining({ bus_name: 'Bus 1', participant_code: 'BER01', status: 'on_way' }),
    ]);
  });

  it('behält den letzten Stand bei einem fehlgeschlagenen Hintergrundrefresh', async () => {
    await renderLoadedProvider();
    const error = new PostgrestError({
      code: 'PGRST001',
      details: '',
      hint: '',
      message: 'backend unavailable',
    });
    enqueue('trips', { data: null, error });

    await act(async () => context().refresh());

    expect(context()).toMatchObject({
      activeBoarding,
      activeTrip,
      hasSyncError: true,
      syncErrorMessage: 'backend unavailable',
    });
    expect(context().participants[0]).toMatchObject({ status: 'on_way' });
  });

  it('behält bei einer fehlgeschlagenen Statusmutation den bestätigten Serverstand', async () => {
    await renderLoadedProvider();
    const error = new PostgrestError({
      code: 'XX000',
      details: '',
      hint: '',
      message: 'mutation failed',
    });
    queueSnapshot();
    mockSupabase.rpc.mockImplementationOnce(() =>
      Promise.resolve({ data: null, error }),
    );

    await act(async () => {
      const result = await context().setStatus(activeBoarding.id, participant.id, 'boarded');
      expect(result.error).toBe(error);
    });

    expect(context()).toMatchObject({ hasSyncError: false, isRefreshing: false });
    expect(context().participants[0]).toMatchObject({ status: 'on_way' });
  });

  it('erneuert eine abgelaufene Sitzung und speichert den Busstatus beim zweiten Versuch', async () => {
    await renderLoadedProvider();
    const permissionError = new PostgrestError({
      code: '42501',
      details: '',
      hint: '',
      message: 'permission denied for function respond_to_bus_boarding',
    });
    queueSnapshot([boardedResponse]);
    mockSupabase.rpc.mockImplementationOnce(() =>
      Promise.resolve({ data: null, error: permissionError }),
    );

    await act(async () => {
      const result = await context().setStatus(activeBoarding.id, participant.id, 'boarded');
      expect(result.error).toBeNull();
    });

    expect(mockSupabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);
    expect(context().participants[0]).toMatchObject({ status: 'boarded' });
  });

  it('zeigt die gespeicherte Antwort optimistisch bis zum autoritativen Refresh', async () => {
    await renderLoadedProvider();
    const tripRefresh = deferred<QueryResult<Trip[]>>();
    enqueue('trips', tripRefresh.promise);

    let mutation: Promise<{ error: PostgrestError | null }> | null = null;
    await act(async () => {
      mutation = context().setStatus(activeBoarding.id, participant.id, 'boarded');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(context().participants[0]).toMatchObject({ status: 'boarded' });
    enqueue('trip_buses', { data: [bus], error: null });
    enqueue('trip_participants', { data: [participant], error: null });
    enqueue('bus_boardings', { data: activeBoarding, error: null });
    enqueue('bus_boarding_responses', { data: [boardedResponse], error: null });
    enqueue('bus_boarding_escalations', { data: [], error: null });

    await act(async () => {
      tripRefresh.resolve({ data: [activeTrip], error: null });
      await mutation;
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith('respond_to_bus_boarding', {
      p_boarding_id: activeBoarding.id,
      p_participant_id: participant.id,
      p_status: 'boarded',
    });
    expect(context().participants[0]).toMatchObject({ status: 'boarded' });
  });

  it('ignoriert einen älteren Refresh nach einer bestätigten Mutation', async () => {
    await renderLoadedProvider();
    const staleTrip = deferred<QueryResult<Trip[]>>();
    enqueue('trips', staleTrip.promise);
    await act(async () => {
      void context().refresh();
      await Promise.resolve();
    });

    queueSnapshot([boardedResponse]);
    await act(async () => {
      await context().setStatus(activeBoarding.id, participant.id, 'boarded');
    });
    expect(context().participants[0]).toMatchObject({ status: 'boarded' });

    enqueue('trip_buses', { data: [bus], error: null });
    enqueue('trip_participants', { data: [participant], error: null });
    enqueue('bus_boardings', { data: activeBoarding, error: null });
    enqueue('bus_boarding_responses', { data: [onWayResponse], error: null });
    enqueue('bus_boarding_escalations', { data: [], error: null });
    await act(async () => {
      staleTrip.resolve({ data: [activeTrip], error: null });
      await flush();
    });

    expect(context().participants[0]).toMatchObject({ status: 'boarded' });
  });

  it('bleibt ohne Sitzung offline-bereit und fragt Supabase nicht ab', async () => {
    mockAuthState.session = null;
    await act(async () => {
      renderer = create(
        <BusManagementProvider>
          <Probe />
        </BusManagementProvider>,
      );
    });
    await waitFor(() => !context().isLoading);

    expect(context()).toMatchObject({ activeBoarding: null, activeTrip: null, participants: [] });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('entfernt alte Fahrtdaten bei Logout sofort aus dem Context', async () => {
    await renderLoadedProvider();
    mockAuthState.session = null;

    await act(async () => {
      renderer?.update(
        <BusManagementProvider>
          <Probe />
        </BusManagementProvider>,
      );
      await flush();
    });

    expect(context()).toMatchObject({ activeBoarding: null, activeTrip: null, participants: [] });
  });
});
