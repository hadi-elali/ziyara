import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PostgrestError, type Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Mock } from 'jest-mock';

import { supabase } from '@/features/auth/supabase';
import {
  isEmergencyInboxRole,
  useEmergencyInboxAlert,
} from '@/features/emergency/use-emergency-inbox-alert';

const mockSession = { user: { id: 'emergency-team-user' } } as Session;
let mockAuthState: {
  isLoading: boolean;
  profile: { role: 'medical_staff' | 'organization_team' | 'user' } | null;
  session: Session | null;
};

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/features/auth/supabase', () => ({
  supabase: {
    channel: jest.fn(),
    from: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

type QueryResult = {
  data: { request_id: number }[] | null;
  error: PostgrestError | null;
};
type MockFunction = Mock<(...args: never[]) => unknown>;
type MockChannel = { on: MockFunction; subscribe: MockFunction };
type MockSupabase = {
  channel: MockFunction;
  from: MockFunction;
  removeChannel: MockFunction;
};

const unreadReceipt = { request_id: 42 };
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
let channelListeners: (() => void)[];
let currentAlert: ReturnType<typeof useEmergencyInboxAlert> | null;
let queryResponses: Promise<QueryResult>[];
let renderer: ReactTestRenderer | null;

function AlertProbe() {
  const value = useEmergencyInboxAlert();

  useEffect(() => {
    currentAlert = value;
  }, [value]);

  return null;
}

function getAlert() {
  if (!currentAlert) throw new Error('Der Notfallhinweis wurde noch nicht gerendert.');
  return currentAlert;
}

async function flushAsyncWork() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function waitForCondition(condition: () => boolean) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (condition()) return;
    await act(flushAsyncWork);
  }

  throw new Error('Der erwartete Notfallstatus wurde nicht erreicht.');
}

async function renderAlert() {
  await act(async () => {
    renderer = create(<AlertProbe />);
  });
  await act(flushAsyncWork);
}

describe('useEmergencyInboxAlert', () => {
  beforeAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    appStateListener = null;
    channelListeners = [];
    currentAlert = null;
    queryResponses = [];
    renderer = null;
    mockAuthState = {
      isLoading: false,
      profile: { role: 'medical_staff' },
      session: mockSession,
    };
    jest.clearAllMocks();

    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: jest.fn() } as NativeEventSubscription;
    });
    mockSupabase.removeChannel.mockImplementation(() => Promise.resolve('ok'));
    mockSupabase.channel.mockImplementation(() => {
      const channel: MockChannel = {
        on: jest.fn((_event, _filter, listener) => {
          channelListeners.push(listener as () => void);
          return channel;
        }),
        subscribe: jest.fn(),
      };
      channel.subscribe.mockReturnValue(channel);
      return channel;
    });
    mockSupabase.from.mockImplementation(() => {
      const response = queryResponses.shift();
      if (!response) throw new Error('Für das Notfall-Postfach fehlt eine Testantwort.');
      const query = {
        abortSignal: jest.fn(() => response),
        is: jest.fn(),
        limit: jest.fn(),
        select: jest.fn(),
      };
      query.is.mockReturnValue(query);
      query.limit.mockReturnValue(query);
      query.select.mockReturnValue(query);
      return query;
    });
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

  it('aktiviert den Hinweis für beide Notfall-Teams und Admins', () => {
    expect(isEmergencyInboxRole('medical_staff')).toBe(true);
    expect(isEmergencyInboxRole('organization_team')).toBe(true);
    expect(isEmergencyInboxRole('admin')).toBe(true);
    expect(isEmergencyInboxRole('user')).toBe(false);
    expect(isEmergencyInboxRole(null)).toBe(false);
  });

  it('aktualisiert den Hinweis für ungelesene Meldungen per Realtime und App-Rückkehr', async () => {
    queryResponses.push(Promise.resolve({ data: [unreadReceipt], error: null }));
    await renderAlert();
    await waitForCondition(() => getAlert().hasUnreadMessages);

    expect(mockSupabase.from).toHaveBeenCalledWith('emergency_request_recipients');
    expect(channelListeners).toHaveLength(2);

    queryResponses.push(Promise.resolve({ data: [], error: null }));
    await act(async () => {
      channelListeners[1]?.();
      await flushAsyncWork();
    });

    expect(getAlert()).toMatchObject({
      hasSyncError: false,
      hasUnreadMessages: false,
    });

    queryResponses.push(Promise.resolve({ data: [unreadReceipt], error: null }));
    await act(async () => {
      appStateListener?.('active');
      await flushAsyncWork();
    });
    expect(getAlert().hasUnreadMessages).toBe(true);
  });

  it('behält einen bekannten Hinweis bei einem fehlgeschlagenen Refresh', async () => {
    queryResponses.push(Promise.resolve({ data: [unreadReceipt], error: null }));
    await renderAlert();
    await waitForCondition(() => getAlert().hasUnreadMessages);

    queryResponses.push(Promise.resolve({ data: null, error: syncError }));
    await act(async () => getAlert().refresh());

    expect(getAlert()).toMatchObject({
      hasSyncError: true,
      hasUnreadMessages: true,
      syncErrorMessage: 'backend unavailable',
    });
  });

  it('fragt ohne Teamrolle weder Empfängerstatus noch Realtime ab', async () => {
    mockAuthState = {
      isLoading: false,
      profile: { role: 'user' },
      session: mockSession,
    };
    await renderAlert();

    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(mockSupabase.channel).not.toHaveBeenCalled();
    expect(getAlert().hasUnreadMessages).toBe(false);
  });
});
