import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PostgrestError, type Session } from '@supabase/supabase-js';
import { Component, type PropsWithChildren, useEffect } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Mock } from 'jest-mock';

import type { QuestionRound } from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import {
  QuestionRoundProvider,
  useQuestionRound,
} from '@/features/question-round/question-round-context';

const mockSession = { user: { id: 'question-user' } } as Session;

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ isLoading: false, session: mockSession }),
}));

jest.mock('@/features/auth/supabase', () => ({
  supabase: {
    channel: jest.fn(),
    from: jest.fn(),
    removeChannel: jest.fn(),
    rpc: jest.fn(),
  },
}));

type QueryResult = { data: QuestionRound | null; error: PostgrestError | null };
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
type MockFunction = Mock<(...args: never[]) => unknown>;
type MockChannel = { on: MockFunction; subscribe: MockFunction };
type MockSupabase = {
  channel: MockFunction;
  from: MockFunction;
  removeChannel: MockFunction;
  rpc: MockFunction;
};

const activeRound: QuestionRound = {
  closed_at: null,
  created_at: '2026-08-26T10:00:00.000Z',
  id: 42,
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
let currentContext: ReturnType<typeof useQuestionRound> | null;
let queryResponses: Promise<QueryResult>[];
let renderer: ReactTestRenderer | null;

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

function QuestionRoundProbe() {
  const value = useQuestionRound();

  useEffect(() => {
    currentContext = value;
  }, [value]);

  return null;
}

function InvalidProbe() {
  useQuestionRound();
  return null;
}

class TestErrorBoundary extends Component<PropsWithChildren, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error ? null : this.props.children;
  }
}

function getContext() {
  if (!currentContext) {
    throw new Error('Der QuestionRoundProvider wurde noch nicht gerendert.');
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

  throw new Error('Der erwartete Fragerunden-Zustand wurde nicht erreicht.');
}

async function renderProvider(initialResult: QueryResult = { data: activeRound, error: null }) {
  queryResponses.push(Promise.resolve(initialResult));

  await act(async () => {
    renderer = create(
      <QuestionRoundProvider>
        <QuestionRoundProbe />
      </QuestionRoundProvider>,
    );
  });
  await waitForCondition(() => !getContext().isLoading);
}

describe('QuestionRoundProvider', () => {
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
        is: jest.fn(),
        maybeSingle: jest.fn(),
        select: jest.fn(),
      };
      query.abortSignal.mockReturnValue(query);
      query.is.mockReturnValue(query);
      query.select.mockReturnValue(query);
      query.maybeSingle.mockImplementation(() => {
        const response = queryResponses.shift();

        if (!response) {
          throw new Error('Für question_rounds fehlt eine Testantwort.');
        }

        return response;
      });
      return query;
    });
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null } as never);
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

  it('lädt die aktive Runde initial und aktualisiert über Realtime und App-Resume', async () => {
    await renderProvider();

    expect(getContext()).toMatchObject({
      activeRound,
      hasSyncError: false,
      isLoading: false,
      syncErrorKind: null,
    });

    queryResponses.push(Promise.resolve({ data: null, error: null }));
    await act(async () => {
      channelListener?.();
      await flushAsyncWork();
    });
    expect(getContext().activeRound).toBeNull();

    queryResponses.push(Promise.resolve({ data: activeRound, error: null }));
    await act(async () => {
      appStateListener?.('active');
      await flushAsyncWork();
    });
    expect(getContext().activeRound).toEqual(activeRound);
  });

  it('behält die aktive Runde bei einem fehlgeschlagenen Hintergrundrefresh', async () => {
    await renderProvider();
    queryResponses.push(Promise.resolve({ data: null, error: syncError }));

    await act(async () => getContext().refresh());

    expect(getContext()).toMatchObject({
      activeRound,
      hasSyncError: true,
      isLoading: false,
      syncErrorKind: 'server',
      syncErrorMessage: 'backend unavailable',
    });
  });

  it('ignoriert ein verspätetes Ergebnis eines älteren Refreshs', async () => {
    await renderProvider();
    const staleResult = createDeferred<QueryResult>();
    queryResponses.push(staleResult.promise);

    await act(async () => {
      void getContext().refresh();
      await Promise.resolve();
    });

    queryResponses.push(Promise.resolve({ data: null, error: null }));
    await act(async () => getContext().refresh());
    expect(getContext().activeRound).toBeNull();

    await act(async () => {
      staleResult.resolve({ data: activeRound, error: null });
      await flushAsyncWork();
    });
    expect(getContext().activeRound).toBeNull();
  });

  it('reicht anonyme Fragen ausschließlich über die RPC ein', async () => {
    const rpcError = { ...syncError, message: 'round closed' };
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: rpcError } as never);
    await renderProvider();

    await expect(getContext().submitQuestion(activeRound.id, 'Testfrage')).resolves.toEqual({
      error: rpcError,
    });
    expect(mockSupabase.rpc).toHaveBeenCalledWith('submit_anonymous_question', {
      p_question: 'Testfrage',
      p_round_id: activeRound.id,
    });
  });

  it('weist die Verwendung des Hooks außerhalb des Providers zurück', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warningSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    let boundary = null as unknown as ReactTestRenderer;

    await act(async () => {
      boundary = create(
        <TestErrorBoundary>
          <InvalidProbe />
        </TestErrorBoundary>,
      );
    });

    expect(boundary.root.findByType(TestErrorBoundary).instance.state.error?.message).toBe(
      'useQuestionRound muss innerhalb von QuestionRoundProvider verwendet werden.',
    );

    errorSpy.mockRestore();
    warningSpy.mockRestore();
  });
});
