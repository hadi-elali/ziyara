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
const mockAuthState: { isLoading: boolean; profile: { role: string }; session: Session | null } = {
  isLoading: false,
  profile: { role: 'user' },
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
  bus_setup_deleted_at: null,
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
  is_on_bus: null,
  bus_id: bus.id,
  created_at: '2026-08-27T08:02:00Z',
  display_name: 'Testteilnehmer',
  id: 30,
  participant_code: 'BER01',
  profile_id: 7,
  trip_id: activeTrip.id,
  updated_at: '2026-08-27T08:02:00Z',
};
const mockSupabase = supabase as unknown as MockSupabase;
const responses = new Map<string, Promise<QueryResult<unknown>>[]>();
const actEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
let currentContext: ReturnType<typeof useBusManagement> | null;
let renderer: ReactTestRenderer | null;

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

function queueSnapshot() {
  enqueue('trips', { data: [activeTrip], error: null });
  enqueue('trip_buses', { data: [bus], error: null });
  enqueue('trip_participants', { data: [participant], error: null });

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
  await waitFor(() => !context().isLoading && context().participants[0]?.id === participant.id);
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
    mockAuthState.profile = { role: 'user' };
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
    mockSupabase.rpc.mockImplementation((name: string) => name === 'admin_trip_bus_roster'
      ? { abortSignal: () => dequeue(name) }
      : dequeue(name));

  });

  afterEach(async () => {
    if (renderer) await act(async () => renderer?.unmount());
    jest.restoreAllMocks();
  });

  afterAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  it('lädt Fahrt und Buszuordnung ohne Boarding-Abfragen', async () => {
    await renderLoadedProvider();

    expect(context()).toMatchObject({
      activeTrip,
      hasSyncError: false,
      isLoading: false,
    });
    expect(context().participants).toEqual([
      expect.objectContaining({ bus_name: 'Bus 1', participant_code: 'BER01' }),
    ]);
    expect(mockSupabase.from.mock.calls.map(([table]) => table)).toEqual(['trips', 'trip_buses', 'trip_participants']);
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
      activeTrip,
      hasSyncError: true,
      syncErrorMessage: 'backend unavailable',
    });
    expect(context().participants[0]).toMatchObject({ bus_name: 'Bus 1' });
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

    expect(context()).toMatchObject({ activeTrip: null, participants: [] });
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

    expect(context()).toMatchObject({ activeTrip: null, participants: [] });
  });

  it('speichert die eigene Wahl ohne eine fremde Profil-ID zu übergeben', async () => {
    await renderLoadedProvider();
    enqueue('select_trip_bus', { data: participant, error: null });
    queueSnapshot();
    await act(async () => context().selectBus(bus.id));
    expect(mockSupabase.rpc).toHaveBeenCalledWith('select_trip_bus', { p_trip_id: activeTrip.id, p_bus_id: bus.id });
    expect(context().participants[0].bus_id).toBe(bus.id);
  });

  it('behält die bestätigte Buswahl, wenn der anschließende Refresh offline ist', async () => {
    await renderLoadedProvider();
    enqueue('select_trip_bus', { data: { ...participant, bus_id: 21 }, error: null });
    enqueue('trips', { data: null, error: new PostgrestError({ code: '', details: '', hint: '', message: 'Failed to fetch' }) });
    await act(async () => context().selectBus(21));
    expect(context().participants[0]).toMatchObject({ bus_id: 21 });
    expect(context().buses[0].leader_participant_id).toBeNull();
    expect(context().hasSyncError).toBe(true);
  });

  it('erneuert eine abgelaufene Sitzung genau einmal vor dem erneuten Speichern', async () => {
    await renderLoadedProvider();
    enqueue('select_trip_bus', { data: null, error: new PostgrestError({ code: 'PGRST301', details: '', hint: '', message: 'JWT expired' }) });
    enqueue('select_trip_bus', { data: participant, error: null });
    queueSnapshot();
    await act(async () => context().selectBus(bus.id));
    expect(mockSupabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('verwirft eine verspätete Mutation nach Logout und wiederholt sie nicht', async () => {
    await renderLoadedProvider();
    let resolveMutation: (value: QueryResult<null>) => void = () => {};
    enqueue('select_trip_bus', new Promise<QueryResult<null>>((resolve) => { resolveMutation = resolve; }));
    const saving = context().selectBus(bus.id);
    mockAuthState.session = null;
    await act(async () => { renderer?.update(<BusManagementProvider><Probe /></BusManagementProvider>); await flush(); });
    await act(async () => {
      resolveMutation({ data: null, error: new PostgrestError({ code: 'PGRST301', details: '', hint: '', message: 'JWT expired' }) });
      await saving;
    });
    expect(context().participants).toEqual([]);
    expect(mockSupabase.auth.refreshSession).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('lädt die vollständige Übersicht nur für Admins und entfernt sie beim Rollenwechsel', async () => {
    mockAuthState.profile = { role: 'admin' };
    enqueue('admin_trip_bus_roster', { data: [{ user_id: 'unassigned-user', display_name: 'Ohne Bus', participant_id: null, bus_id: null }], error: null });
    await renderLoadedProvider();
    expect(context().roster).toHaveLength(1);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('admin_trip_bus_roster', { p_trip_id: activeTrip.id });
    mockAuthState.profile = { role: 'user' };
    queueSnapshot();
    await act(async () => { renderer?.update(<BusManagementProvider><Probe /></BusManagementProvider>); });
    expect(context().roster).toEqual([]);
    await waitFor(() => !context().isLoading);
    expect(context().roster).toEqual([]);
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
  });
});
