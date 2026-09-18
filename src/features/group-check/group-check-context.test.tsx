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

import type { GroupCheck, GroupCheckResponse, UserProfile } from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import { GroupCheckProvider, useGroupCheck } from '@/features/group-check/group-check-context';

const mockProfile: UserProfile = {
  created_at: '2026-08-26T00:00:00.000Z',
  display_name: 'Testprofil',
  family_id: null,
  id: 7,
  luggage_count: 0,
  member_type: 'brother',
  party_size: 2,
  role: 'user',
  sim_card_count: 0,
  updated_at: '2026-08-26T00:00:00.000Z',
  user_id: 'user-a',
};
const mockSession = {
  user: { id: mockProfile.user_id },
} as Session;
const mockAuthState: {
  hasProfileError: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  profile: UserProfile | null;
  session: Session | null;
} = {
  hasProfileError: false,
  isAdmin: false,
  isLoading: false,
  profile: mockProfile,
  session: mockSession,
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

type QueryResult<T> = { data: T; error: PostgrestError | null };
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
type MockFunction = Mock<(...args: never[]) => unknown>;
type MockChannel = { on: MockFunction; subscribe: MockFunction };
type MockSupabase = {
  channel: MockFunction;
  from: MockFunction;
  removeChannel: MockFunction;
  rpc: MockFunction;
};

const activeCheck: GroupCheck = {
  closed_at: null,
  created_at: '2026-08-26T10:00:00.000Z',
  created_by_profile_id: 1,
  id: 12,
  question: 'Sind alle da?',
};
const initialResponse: GroupCheckResponse = {
  answer: false,
  check_id: activeCheck.id,
  created_at: '2026-08-26T10:01:00.000Z',
  id: 31,
  profile_id: mockProfile.id,
  updated_at: '2026-08-26T10:01:00.000Z',
};
const mockSupabase = supabase as unknown as MockSupabase;
const actEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;

let checkResponses: Promise<QueryResult<GroupCheck | null>>[];
let currentContext: ReturnType<typeof useGroupCheck> | null;
let renderer: ReactTestRenderer | null;
let responseResponses: Promise<QueryResult<{ answer: boolean } | null>>[];

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value) => {
      if (!resolvePromise) {
        throw new Error('Deferred Promise wurde nicht initialisiert.');
      }

      resolvePromise(value);
    },
  };
}

function GroupCheckProbe() {
  const value = useGroupCheck();

  useEffect(() => {
    currentContext = value;
  }, [value]);

  return null;
}

function getContext() {
  if (!currentContext) {
    throw new Error('Der GroupCheckProvider wurde noch nicht gerendert.');
  }

  return currentContext;
}

async function flushAsyncWork() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function waitForCondition(condition: () => boolean) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (condition()) {
      return;
    }

    await act(flushAsyncWork);
  }

  throw new Error('Der erwartete Gruppencheck-Zustand wurde nicht erreicht.');
}

async function renderProvider() {
  checkResponses.push(Promise.resolve({ data: activeCheck, error: null }));
  responseResponses.push(Promise.resolve({ data: { answer: false }, error: null }));

  await act(async () => {
    renderer = create(
      <GroupCheckProvider>
        <GroupCheckProbe />
      </GroupCheckProvider>,
    );
  });
  await waitForCondition(() => !getContext().isLoading && getContext().currentResponse === false);
}

describe('GroupCheckProvider request versioning', () => {
  beforeAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    checkResponses = [];
    currentContext = null;
    renderer = null;
    responseResponses = [];
    jest.clearAllMocks();
    mockAuthState.hasProfileError = false;
    mockAuthState.isAdmin = false;
    mockAuthState.isLoading = false;
    mockAuthState.profile = mockProfile;
    mockAuthState.session = mockSession;

    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      () => ({ remove: jest.fn() }) as NativeEventSubscription,
    );
    mockSupabase.removeChannel.mockImplementation(() => Promise.resolve('ok'));
    mockSupabase.channel.mockImplementation(() => {
      const channel: MockChannel = {
        on: jest.fn(),
        subscribe: jest.fn(),
      };
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
        select: jest.fn(),
      };
      query.abortSignal.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.is.mockReturnValue(query);
      query.select.mockReturnValue(query);
      query.maybeSingle.mockImplementation(() => {
        const nextResponse =
          table === 'group_checks' ? checkResponses.shift() : responseResponses.shift();

        if (!nextResponse) {
          throw new Error(`Für ${table} fehlt eine Testantwort.`);
        }

        return nextResponse;
      });
      return query;
    });
    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === 'respond_to_group_check') {
        return Promise.resolve({ data: { ...initialResponse, answer: true }, error: null });
      }

      if (name === 'close_group_check') {
        return Promise.resolve({
          data: { ...activeCheck, closed_at: '2026-08-26T10:02:00.000Z' },
          error: null,
        });
      }

      if (name === 'start_group_check') {
        return Promise.resolve({ data: activeCheck, error: null });
      }

      throw new Error(`Unerwartete RPC im Gruppencheck-Test: ${name}`);
    });
  });

  it('entfernt Admin-Routen nicht, solange das Rollenprofil noch geladen wird', async () => {
    mockAuthState.isAdmin = false;
    mockAuthState.isLoading = true;
    mockAuthState.profile = null;

    await act(async () => {
      renderer = create(
        <GroupCheckProvider>
          <GroupCheckProbe />
        </GroupCheckProvider>,
      );
    });

    expect(getContext().isLoading).toBe(true);
    expect(getContext().isBlocking).toBe(false);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('startet bei einem initialen Profilfehler keine zweite Serverabfrage', async () => {
    mockAuthState.hasProfileError = true;
    mockAuthState.profile = null;

    await act(async () => {
      renderer = create(
        <GroupCheckProvider>
          <GroupCheckProbe />
        </GroupCheckProvider>,
      );
      await flushAsyncWork();
    });

    expect(getContext()).toMatchObject({
      activeCheck: null,
      currentResponse: null,
      hasSyncError: false,
      isBlocking: true,
      isLoading: true,
    });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer?.unmount());
    }

    jest.restoreAllMocks();
  });

  afterAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  it('lässt einen älteren Refresh eine gespeicherte Antwort nicht zurücksetzen', async () => {
    await renderProvider();
    const staleCheck = createDeferred<QueryResult<GroupCheck | null>>();
    checkResponses.push(staleCheck.promise);

    await act(async () => {
      void getContext().refresh();
      await Promise.resolve();
    });

    checkResponses.push(Promise.resolve({ data: activeCheck, error: null }));
    responseResponses.push(Promise.resolve({ data: { answer: true }, error: null }));

    await act(async () => {
      const result = await getContext().respond(activeCheck.id, true);
      expect(result.error).toBeNull();
    });
    expect(getContext().currentResponse).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledTimes(5);

    responseResponses.push(Promise.resolve({ data: { answer: false }, error: null }));
    await act(async () => {
      staleCheck.resolve({ data: activeCheck, error: null });
      await flushAsyncWork();
    });

    expect(getContext().currentResponse).toBe(true);
  });

  it('behält die bestätigte Antwort während des autoritativen Refreshs sichtbar', async () => {
    await renderProvider();
    const authoritativeCheck = createDeferred<QueryResult<GroupCheck | null>>();
    checkResponses.push(authoritativeCheck.promise);

    let responseMutation: Promise<{ error: PostgrestError | null }> | null = null;
    await act(async () => {
      responseMutation = getContext().respond(activeCheck.id, true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getContext().currentResponse).toBe(true);

    responseResponses.push(Promise.resolve({ data: { answer: true }, error: null }));
    await act(async () => {
      authoritativeCheck.resolve({ data: activeCheck, error: null });
      await responseMutation;
    });

    expect(getContext().currentResponse).toBe(true);
  });

  it('bleibt bei paralleler Antwort und anschließender Schließung konsistent', async () => {
    await renderProvider();
    const responseRefresh = createDeferred<QueryResult<GroupCheck | null>>();
    checkResponses.push(responseRefresh.promise);

    let responseMutation: Promise<{ error: PostgrestError | null }> | null = null;
    await act(async () => {
      responseMutation = getContext().respond(activeCheck.id, true);
      await Promise.resolve();
      await Promise.resolve();
    });

    checkResponses.push(Promise.resolve({ data: null, error: null }));
    await act(async () => {
      const result = await getContext().closeCheck(activeCheck.id);
      expect(result.error).toBeNull();
    });

    responseResponses.push(Promise.resolve({ data: { answer: true }, error: null }));
    await act(async () => {
      responseRefresh.resolve({ data: activeCheck, error: null });
      await responseMutation;
    });

    expect(getContext()).toMatchObject({
      activeCheck: null,
      currentResponse: null,
      hasSyncError: false,
    });
  });

  it('behält den letzten Stand bei einem fehlgeschlagenen Hintergrundrefresh', async () => {
    await renderProvider();
    const syncError = new PostgrestError({
      code: 'PGRST001',
      details: '',
      hint: '',
      message: 'backend unavailable',
    });
    checkResponses.push(Promise.resolve({ data: null, error: syncError }));

    await act(async () => getContext().refresh());

    expect(getContext()).toMatchObject({
      activeCheck,
      currentResponse: false,
      hasSyncError: true,
      isBlocking: false,
      isLoading: false,
      syncErrorKind: 'server',
    });
  });

  it('erfasst auch Fehler beim Laden der eigenen Antwort, ohne den Check zu verlieren', async () => {
    await renderProvider();
    const responseError = new PostgrestError({
      code: 'PGRST001',
      details: '',
      hint: '',
      message: 'response unavailable',
    });
    checkResponses.push(Promise.resolve({ data: activeCheck, error: null }));
    responseResponses.push(Promise.resolve({ data: null, error: responseError }));

    await act(async () => getContext().refresh());

    expect(getContext()).toMatchObject({
      activeCheck,
      currentResponse: false,
      hasSyncError: true,
      syncErrorKind: 'server',
    });
  });

  it('zeigt einen gestarteten Check sofort und gleicht ihn anschließend autoritativ ab', async () => {
    await renderProvider();
    checkResponses.push(Promise.resolve({ data: activeCheck, error: null }));
    responseResponses.push(Promise.resolve({ data: null, error: null }));

    await act(async () => {
      const result = await getContext().startCheck(activeCheck.question);
      expect(result.error).toBeNull();
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith('start_group_check', {
      p_question: activeCheck.question,
    });
    expect(getContext()).toMatchObject({
      activeCheck,
      currentResponse: null,
      hasSyncError: false,
    });
  });

  it('bleibt ohne Sitzung offline-bereit und startet keine Supabase-Abfrage', async () => {
    mockAuthState.profile = null;
    mockAuthState.session = null;

    await act(async () => {
      renderer = create(
        <GroupCheckProvider>
          <GroupCheckProbe />
        </GroupCheckProvider>,
      );
    });
    await waitForCondition(() => !getContext().isLoading);

    expect(getContext()).toMatchObject({
      activeCheck: null,
      currentResponse: null,
      hasSyncError: false,
      isBlocking: false,
    });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});
