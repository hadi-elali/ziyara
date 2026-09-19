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
import * as Linking from 'expo-linking';
import {
  type AuthError,
  FunctionsHttpError,
  PostgrestError,
  type AuthChangeEvent,
  type Session,
  type User,
} from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Mock } from 'jest-mock';

import type { UserProfile } from '@/domain/database';
import {
  AuthProvider,
  getAuthErrorTranslationKey,
  useAuth,
} from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';

jest.mock('expo-linking', () => ({
  addEventListener: jest.fn(),
  createURL: jest.fn(),
  getInitialURL: jest.fn(),
}));

jest.mock('@/features/auth/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: jest.fn(),
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      setSession: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      signUp: jest.fn(),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
      updateUser: jest.fn(),
      verifyOtp: jest.fn(),
    },
    channel: jest.fn(),
    from: jest.fn(),
    functions: {
      invoke: jest.fn(),
    },
    removeChannel: jest.fn(),
  },
}));

type AuthValue = ReturnType<typeof useAuth>;
type AuthStateChangeCallback = (event: AuthChangeEvent, session: Session | null) => void;
type ProfileQueryResponse = {
  data: UserProfile | null;
  error: PostgrestError | null;
};
type MockFunction = Mock<(...args: never[]) => unknown>;
type MockChannel = {
  on: MockFunction;
  subscribe: MockFunction;
};
type MockSupabase = {
  auth: {
    exchangeCodeForSession: MockFunction;
    getSession: MockFunction;
    onAuthStateChange: MockFunction;
    resetPasswordForEmail: MockFunction;
    setSession: MockFunction;
    signInWithPassword: MockFunction;
    signOut: MockFunction;
    signUp: MockFunction;
    startAutoRefresh: MockFunction;
    stopAutoRefresh: MockFunction;
    updateUser: MockFunction;
    verifyOtp: MockFunction;
  };
  channel: MockFunction;
  from: MockFunction;
  functions: {
    invoke: MockFunction;
  };
  removeChannel: MockFunction;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const mockSupabase = supabase as unknown as MockSupabase;
const mockLinking = Linking as unknown as {
  addEventListener: MockFunction;
  createURL: MockFunction;
  getInitialURL: MockFunction;
};
const actEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;

let appStateListeners: Set<(state: AppStateStatus) => void>;
let authStateChangeCallback: AuthStateChangeCallback | null;
let currentAuthValue: AuthValue | null;
let profileChangeCallback: (() => void) | null;
let profileResponses: Promise<ProfileQueryResponse>[];
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

function createSession(userId: string): Session {
  return {
    access_token: `access-${userId}`,
    expires_at: 2_000_000_000,
    expires_in: 3_600,
    refresh_token: `refresh-${userId}`,
    token_type: 'bearer',
    user: {
      app_metadata: {},
      aud: 'authenticated',
      created_at: '2026-08-26T00:00:00.000Z',
      email: `${userId}@example.com`,
      id: userId,
      user_metadata: {},
    } as User,
  };
}

function createProfile(
  userId: string,
  overrides: Partial<UserProfile> = {},
): UserProfile {
  return {
    created_at: '2026-08-26T00:00:00.000Z',
    display_name: `Profil ${userId}`,
    family_id: null,
    id: userId === 'user-a' ? 1 : 2,
    luggage_count: 0,
    member_type: 'brother',
    party_size: 1,
    role: 'user',
    sim_card_count: 0,
    updated_at: '2026-08-26T00:00:00.000Z',
    user_id: userId,
    ...overrides,
  };
}

function createPostgrestError(message: string): PostgrestError {
  return new PostgrestError({
    code: 'PGRST000',
    details: 'Testfehler',
    hint: '',
    message,
  });
}

function AuthProbe() {
  const authValue = useAuth();

  useEffect(() => {
    currentAuthValue = authValue;
  }, [authValue]);

  return null;
}

function getAuthValue() {
  if (!currentAuthValue) {
    throw new Error('AuthProvider wurde noch nicht gerendert.');
  }

  return currentAuthValue;
}

async function flushAsyncWork() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function waitForCondition(condition: () => boolean) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (condition()) {
      return;
    }

    await act(async () => {
      await flushAsyncWork();
    });
  }

  throw new Error('Der erwartete Auth-Testzustand wurde nicht erreicht.');
}

async function renderAuthProvider() {
  await act(async () => {
    renderer = create(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await flushAsyncWork();
  });
}

async function emitAuthState(session: Session | null, event: AuthChangeEvent = 'SIGNED_IN') {
  if (!authStateChangeCallback) {
    throw new Error('Auth-State-Callback wurde nicht registriert.');
  }

  await act(async () => {
    authStateChangeCallback?.(event, session);
    await flushAsyncWork();
  });
}

async function loadInitialProfile(profile: UserProfile) {
  const previousRequestCount = mockSupabase.from.mock.calls.length;
  profileResponses.push(Promise.resolve({ data: profile, error: null }));
  await emitAuthState(createSession(profile.user_id));
  await waitForCondition(
    () =>
      mockSupabase.from.mock.calls.length === previousRequestCount + 1 &&
      getAuthValue().profile?.user_id === profile.user_id,
  );
}

function emitAppResume() {
  for (const listener of appStateListeners) {
    listener('active');
  }
}

describe('AuthProvider profile synchronization', () => {
  beforeAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    appStateListeners = new Set();
    authStateChangeCallback = null;
    currentAuthValue = null;
    profileChangeCallback = null;
    profileResponses = [];
    renderer = null;

    jest.clearAllMocks();
    mockLinking.addEventListener.mockImplementation(() => ({ remove: jest.fn() }));
    mockLinking.createURL.mockImplementation(() => 'ziyara:///reset-password');
    mockLinking.getInitialURL.mockImplementation(() => Promise.resolve(null));
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateListeners.add(listener);

        return {
          remove: () => appStateListeners.delete(listener),
        } as NativeEventSubscription;
      });

    mockSupabase.auth.getSession.mockImplementation(() =>
      Promise.resolve({
        data: { session: null },
        error: null,
      }),
    );
    mockSupabase.auth.onAuthStateChange.mockImplementation(
      (callback: AuthStateChangeCallback) => {
        authStateChangeCallback = callback;

        return {
          data: { subscription: { unsubscribe: jest.fn() } },
        };
      },
    );
    mockSupabase.auth.signInWithPassword.mockImplementation(() => Promise.resolve({ error: null }));
    mockSupabase.auth.signOut.mockImplementation(() => Promise.resolve({ error: null }));
    mockSupabase.auth.signUp.mockImplementation(() =>
      Promise.resolve({ data: { session: null, user: null }, error: null }),
    );
    mockSupabase.auth.resetPasswordForEmail.mockImplementation(() =>
      Promise.resolve({ data: {}, error: null }),
    );
    mockSupabase.auth.updateUser.mockImplementation(() =>
      Promise.resolve({ data: { user: null }, error: null }),
    );
    mockSupabase.functions.invoke.mockImplementation(() =>
      Promise.resolve({ data: { code: 'account_deleted' }, error: null }),
    );
    mockSupabase.removeChannel.mockImplementation(() => Promise.resolve('ok'));

    mockSupabase.from.mockImplementation((table: string) => {
      if (table !== 'profiles') {
        throw new Error(`Unerwartete Tabelle im Auth-Test: ${table}`);
      }

      const query = {
        abortSignal: jest.fn(),
        eq: jest.fn(),
        maybeSingle: jest.fn(),
        select: jest.fn(),
        single: jest.fn(),
        update: jest.fn(),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.abortSignal.mockReturnValue(query);
      query.update.mockImplementation((value: unknown) => {
        const profileUpdate = value as Partial<
          Pick<UserProfile, 'luggage_count' | 'party_size' | 'sim_card_count'>
        >;
        query.single.mockResolvedValue({
          data: createProfile('user-a', {
            ...(currentAuthValue?.profile ?? {}),
            ...profileUpdate,
          }),
          error: null,
        } as never);
        return query;
      });
      query.maybeSingle.mockImplementation(() => {
        const nextResponse = profileResponses.shift();

        if (!nextResponse) {
          throw new Error('Für den Profilabruf fehlt eine Testantwort.');
        }

        return nextResponse;
      });

      return query;
    });

    mockSupabase.channel.mockImplementation(() => {
      const channel: MockChannel = {
        on: jest.fn(),
        subscribe: jest.fn(),
      };
      channel.on.mockImplementation(
        (_type: string, _filter: object, callback: () => void) => {
          profileChangeCallback = callback;
          return channel;
        },
      );
      channel.subscribe.mockReturnValue(channel);
      return channel;
    });
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
    }

    jest.restoreAllMocks();
  });

  afterAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  it('blockiert beim initialen Login bis das Profil geladen ist', async () => {
    const session = createSession('user-a');
    const profile = createProfile('user-a');
    const initialProfile = createDeferred<ProfileQueryResponse>();
    profileResponses.push(initialProfile.promise);
    mockSupabase.auth.signInWithPassword.mockImplementation(async () => {
      authStateChangeCallback?.('SIGNED_IN', session);
      return { error: null };
    });

    await renderAuthProvider();

    await act(async () => {
      await getAuthValue().signIn('user-a@example.com', 'Passwort123');
      await flushAsyncWork();
    });

    expect(getAuthValue()).toMatchObject({
      hasProfileError: false,
      isLoading: true,
      isRefreshing: false,
      profile: null,
      session,
    });

    await act(async () => {
      initialProfile.resolve({ data: profile, error: null });
      await flushAsyncWork();
    });

    expect(getAuthValue()).toMatchObject({
      hasProfileError: false,
      isAdmin: false,
      isLoading: false,
      isRefreshing: false,
      profile,
      profileRefreshError: null,
    });
  });

  it('startet ohne Session ohne Profilabfrage', async () => {
    await renderAuthProvider();

    expect(getAuthValue()).toMatchObject({
      isLoading: false,
      profile: null,
      session: null,
    });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('behält Profil und Navigation während App-Resume erhalten', async () => {
    const profile = createProfile('user-a');
    const refresh = createDeferred<ProfileQueryResponse>();

    await renderAuthProvider();
    await loadInitialProfile(profile);
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    expect(profileChangeCallback).not.toBeNull();
    profileResponses.push(refresh.promise);

    await act(async () => {
      emitAppResume();
      await Promise.resolve();
    });

    expect(mockSupabase.from).toHaveBeenCalledTimes(2);

    expect(getAuthValue()).toMatchObject({
      isLoading: false,
      isRefreshing: true,
      profile,
      profileRefreshError: null,
    });

    await act(async () => {
      refresh.resolve({ data: profile, error: null });
      await flushAsyncWork();
    });

    expect(getAuthValue()).toMatchObject({
      isLoading: false,
      isRefreshing: false,
      profile,
      profileRefreshError: null,
    });
  });

  it('übernimmt einen erfolgreichen Profilrefresh ohne blockierendes Laden', async () => {
    const profile = createProfile('user-a');
    const refreshedProfile = createProfile('user-a', { display_name: 'Aktualisiertes Profil' });
    const refresh = createDeferred<ProfileQueryResponse>();

    await renderAuthProvider();
    await loadInitialProfile(profile);
    profileResponses.push(refresh.promise);

    await act(async () => {
      void getAuthValue().refreshProfile();
      await Promise.resolve();
    });

    expect(getAuthValue()).toMatchObject({
      isLoading: false,
      isRefreshing: true,
      profile,
      profileRefreshError: null,
    });

    await act(async () => {
      refresh.resolve({ data: refreshedProfile, error: null });
      await flushAsyncWork();
    });

    expect(getAuthValue()).toMatchObject({
      isLoading: false,
      isRefreshing: false,
      profile: refreshedProfile,
      profileRefreshError: null,
    });
  });

  it('behält das Profil bei einem fehlgeschlagenen Hintergrundrefresh', async () => {
    const profile = createProfile('user-a');
    const refresh = createDeferred<ProfileQueryResponse>();

    await renderAuthProvider();
    await loadInitialProfile(profile);
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    profileResponses.push(refresh.promise);

    await act(async () => {
      emitAppResume();
      await Promise.resolve();
    });
    await act(async () => {
      refresh.resolve({ data: null, error: createPostgrestError('Netzwerkfehler') });
      await flushAsyncWork();
    });

    expect(getAuthValue()).toMatchObject({
      hasProfileError: false,
      isLoading: false,
      isRefreshing: false,
      profile,
    });
    expect(getAuthValue().profileRefreshError?.message).toBe('Netzwerkfehler');
  });

  it('übernimmt Rollenänderungen aus Realtime ohne das bestehende Profil zu löschen', async () => {
    const profile = createProfile('user-a');
    const adminProfile = createProfile('user-a', { role: 'admin' });
    const refresh = createDeferred<ProfileQueryResponse>();

    await renderAuthProvider();
    await loadInitialProfile(profile);
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    expect(profileChangeCallback).not.toBeNull();
    profileResponses.push(refresh.promise);

    await act(async () => {
      profileChangeCallback?.();
      await Promise.resolve();
    });

    expect(mockSupabase.from).toHaveBeenCalledTimes(2);

    expect(getAuthValue()).toMatchObject({
      isAdmin: false,
      isLoading: false,
      isRefreshing: true,
      profile,
    });

    await act(async () => {
      refresh.resolve({ data: adminProfile, error: null });
      await flushAsyncWork();
    });

    expect(getAuthValue()).toMatchObject({
      isAdmin: true,
      isLoading: false,
      isRefreshing: false,
      profile: adminProfile,
    });
  });

  it('entfernt alte Profildaten bei Benutzerwechsel und Logout sofort', async () => {
    const firstProfile = createProfile('user-a', { role: 'admin' });
    const secondSession = createSession('user-b');
    const secondProfile = createProfile('user-b');
    const switchedProfile = createDeferred<ProfileQueryResponse>();

    await renderAuthProvider();
    await loadInitialProfile(firstProfile);
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    profileResponses.push(switchedProfile.promise);

    await emitAuthState(secondSession);
    await waitForCondition(() => mockSupabase.from.mock.calls.length === 2);

    expect(getAuthValue()).toMatchObject({
      isAdmin: false,
      isLoading: true,
      profile: null,
      session: secondSession,
    });

    await act(async () => {
      switchedProfile.resolve({ data: secondProfile, error: null });
      await flushAsyncWork();
    });

    expect(getAuthValue()).toMatchObject({
      isLoading: false,
      profile: secondProfile,
    });

    await act(async () => {
      await getAuthValue().signOut();
    });

    expect(getAuthValue()).toMatchObject({
      hasProfileError: false,
      isAdmin: false,
      isLoading: false,
      isRefreshing: false,
      profile: null,
      profileRefreshError: null,
      session: null,
    });
  });

  it('entfernt bei einem initialen Profilfehler nur die lokale Session für den öffentlichen Guide', async () => {
    profileResponses.push(
      Promise.resolve({ data: null, error: createPostgrestError('JWT abgelehnt') }),
    );

    await renderAuthProvider();
    await emitAuthState(createSession('user-a'));
    await waitForCondition(() => getAuthValue().hasProfileError);

    await act(async () => {
      await expect(getAuthValue().continueWithoutAccount()).resolves.toEqual({ error: null });
      await flushAsyncWork();
    });

    expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(getAuthValue()).toMatchObject({
      hasProfileError: false,
      isLoading: false,
      profile: null,
      session: null,
    });
  });

  it('fordert einen Recovery-Link mit der dedizierten Deep-Link-Route an', async () => {
    await renderAuthProvider();

    await act(async () => {
      await getAuthValue().requestPasswordReset('user-a@example.com');
    });

    expect(mockLinking.createURL).toHaveBeenCalledWith('/reset-password');
    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'user-a@example.com',
      { redirectTo: 'ziyara:///reset-password' },
    );
  });

  it('ignoriert normale Login-Links und aktiviert nur eine Recovery-Session', async () => {
    const recoverySession = createSession('user-a');
    const profile = createProfile('user-a');
    mockSupabase.auth.setSession.mockImplementation(() =>
      Promise.resolve({
        data: { session: recoverySession, user: recoverySession.user },
        error: null,
      }),
    );

    await renderAuthProvider();

    await act(async () => {
      expect(
        await getAuthValue().handlePasswordRecoveryUrl(
          'ziyara:///login#access_token=login&refresh_token=refresh&type=recovery',
        ),
      ).toBe(false);
    });
    expect(mockSupabase.auth.setSession).not.toHaveBeenCalled();

    profileResponses.push(Promise.resolve({ data: profile, error: null }));
    await act(async () => {
      expect(
        await getAuthValue().handlePasswordRecoveryUrl(
          'ziyara:///reset-password#access_token=recovery-access&refresh_token=recovery-refresh&type=recovery',
        ),
      ).toBe(true);
      await flushAsyncWork();
    });
    await waitForCondition(() => getAuthValue().profile?.user_id === 'user-a');

    expect(mockSupabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'recovery-access',
      refresh_token: 'recovery-refresh',
    });
    expect(getAuthValue()).toMatchObject({
      passwordRecoveryError: null,
      passwordRecoveryStatus: 'ready',
      session: recoverySession,
    });
  });

  it('setzt das Recovery-Passwort und entfernt anschließend die lokale Session', async () => {
    const recoverySession = createSession('user-a');
    mockSupabase.auth.setSession.mockImplementation(() =>
      Promise.resolve({
        data: { session: recoverySession, user: recoverySession.user },
        error: null,
      }),
    );

    await renderAuthProvider();
    profileResponses.push(
      Promise.resolve({ data: createProfile('user-a'), error: null }),
    );
    await act(async () => {
      await getAuthValue().handlePasswordRecoveryUrl(
        'ziyara:///reset-password#access_token=access&refresh_token=refresh&type=recovery',
      );
      await flushAsyncWork();
    });
    await waitForCondition(() => getAuthValue().passwordRecoveryStatus === 'ready');

    await act(async () => {
      expect(await getAuthValue().completePasswordRecovery('NeuesPasswort123')).toEqual({
        error: null,
      });
      await flushAsyncWork();
    });

    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
      password: 'NeuesPasswort123',
    });
    expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(getAuthValue()).toMatchObject({
      passwordRecoveryStatus: 'idle',
      profile: null,
      session: null,
    });
  });

  it('löscht nur über die serverseitig authentifizierte Funktion und räumt lokal auf', async () => {
    await renderAuthProvider();
    await loadInitialProfile(createProfile('user-a'));

    await act(async () => {
      expect(await getAuthValue().deleteAccount()).toEqual({
        code: null,
        error: null,
      });
      await flushAsyncWork();
    });

    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('delete-account', {
      body: {},
      method: 'POST',
    });
    expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(getAuthValue()).toMatchObject({ profile: null, session: null });
  });

  it('behält die Session bei und meldet die Last-Admin-Ablehnung gezielt', async () => {
    const session = createSession('user-a');
    mockSupabase.functions.invoke.mockImplementation(() =>
      Promise.resolve({
        data: null,
        error: new FunctionsHttpError({
          json: async () => ({ code: 'last_admin' }),
        }),
      }),
    );

    await renderAuthProvider();
    await loadInitialProfile(createProfile('user-a', { role: 'admin' }));

    await act(async () => {
      const result = await getAuthValue().deleteAccount();
      expect(result.code).toBe('last_admin');
      expect(result.error).toBeInstanceOf(FunctionsHttpError);
    });

    expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
    expect(getAuthValue()).toMatchObject({
      isAdmin: true,
      session,
    });
  });

  it('führt Registrierung sowie verifizierte Kontoänderungen über Supabase Auth aus', async () => {
    await renderAuthProvider();

    await act(async () => {
      await expect(
        getAuthValue().signUp(
          'Testprofil',
          'new@example.com',
          'Passwort123',
          'sister',
          3,
          4,
          2,
        ),
      ).resolves.toEqual({ error: null, requiresEmailConfirmation: true });
    });
    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      options: {
        data: {
          display_name: 'Testprofil',
          luggage_count: 4,
          member_type: 'sister',
          party_size: 3,
          sim_card_count: 2,
        },
      },
      password: 'Passwort123',
    });

    await loadInitialProfile(createProfile('user-a'));
    await act(async () => {
      await expect(getAuthValue().changeEmail('Alt12345', 'neu@example.com')).resolves.toEqual({
        error: null,
      });
      await expect(getAuthValue().changePassword('Alt12345', 'Neu12345')).resolves.toEqual({
        error: null,
      });
      await expect(getAuthValue().updatePartySize(4)).resolves.toEqual({ error: null });
    });

    expect(getAuthValue().profile?.party_size).toBe(4);

    await act(async () => {
      await expect(getAuthValue().updateLuggageCount(5)).resolves.toEqual({ error: null });
    });

    await act(async () => {
      await expect(getAuthValue().updateSimCardCount(3)).resolves.toEqual({ error: null });
    });

    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user-a@example.com',
      password: 'Alt12345',
    });
    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ email: 'neu@example.com' });
    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'Neu12345' });
    expect(getAuthValue().profile?.party_size).toBe(4);
    expect(getAuthValue().profile?.luggage_count).toBe(5);
    expect(getAuthValue().profile?.sim_card_count).toBe(3);
  });

  it('lehnt kontoabhängige Aktionen ohne Session lokal ab', async () => {
    await renderAuthProvider();

    await expect(getAuthValue().changeEmail('Alt12345', 'neu@example.com')).rejects.toThrow(
      'Das Konto hat keine E-Mail-Adresse.',
    );
    await expect(getAuthValue().changePassword('Alt12345', 'Neu12345')).rejects.toThrow(
      'Das Konto hat keine E-Mail-Adresse.',
    );
    await expect(getAuthValue().completePasswordRecovery('Neu12345')).rejects.toThrow(
      'Es ist keine gültige Recovery-Session aktiv.',
    );
    await expect(getAuthValue().updatePartySize(2)).rejects.toThrow(
      'Für die Änderung ist eine Anmeldung erforderlich.',
    );
    await expect(getAuthValue().updateLuggageCount(2)).rejects.toThrow(
      'Für die Änderung ist eine Anmeldung erforderlich.',
    );
    await expect(getAuthValue().updateSimCardCount(2)).rejects.toThrow(
      'Für die Änderung ist eine Anmeldung erforderlich.',
    );
    await expect(getAuthValue().deleteAccount()).resolves.toMatchObject({
      code: 'unauthorized',
      error: expect.any(Error),
    });
    expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('meldet abgelaufene und unvollständige Recovery-Links als nicht blockierenden Fehler', async () => {
    await renderAuthProvider();

    await act(async () => {
      await expect(
        getAuthValue().handlePasswordRecoveryUrl(
          'ziyara:///reset-password#error_code=otp_expired&error_description=Abgelaufen',
        ),
      ).resolves.toBe(true);
    });
    expect(getAuthValue()).toMatchObject({
      passwordRecoveryStatus: 'error',
    });
    expect(getAuthValue().passwordRecoveryError?.message).toBe('Abgelaufen');

    mockSupabase.auth.setSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: null,
    } as never);
    await act(async () => {
      await getAuthValue().handlePasswordRecoveryUrl(
        'ziyara:///reset-password#access_token=access&refresh_token=refresh&type=recovery',
      );
    });
    expect(getAuthValue().passwordRecoveryError?.message).toBe('Die Recovery-Session fehlt.');
  });

  it('behandelt nicht bestätigte Löschantworten als Fehler und behält die Session', async () => {
    mockSupabase.functions.invoke.mockResolvedValueOnce({
      data: { code: 'unexpected' },
      error: null,
    } as never);
    await renderAuthProvider();
    await loadInitialProfile(createProfile('user-a'));

    await expect(getAuthValue().deleteAccount()).resolves.toMatchObject({
      code: 'deletion_failed',
      error: expect.any(Error),
    });
    expect(getAuthValue().session?.user.id).toBe('user-a');
    expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
  });
});

describe('getAuthErrorTranslationKey', () => {
  it.each([
    ['email_not_confirmed', 'auth.error.emailNotConfirmed'],
    ['invalid_credentials', 'auth.error.invalidCredentials'],
    ['over_email_send_rate_limit', 'auth.error.rateLimit'],
    ['over_request_rate_limit', 'auth.error.rateLimit'],
    ['signup_disabled', 'auth.error.signupDisabled'],
    ['user_already_exists', 'auth.error.userExists'],
    ['email_exists', 'auth.error.userExists'],
    ['weak_password', 'auth.error.weakPassword'],
    ['unknown_error', 'auth.error.generic'],
  ])('ordnet %s dem erwarteten UI-Text zu', (code, expectedKey) => {
    expect(getAuthErrorTranslationKey({ code } as AuthError)).toBe(expectedKey);
  });
});
