import {
  FunctionsHttpError,
  type AuthError,
  type PostgrestError,
  type Session,
  type User,
} from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

import type { MemberType, UserProfile } from '@/domain/database';
import {
  parsePasswordRecoveryLink,
  passwordRecoveryRedirectUrl,
} from '@/features/auth/password-recovery-link';
import { supabase } from '@/features/auth/supabase';
import {
  getSupabaseReadFailureKind,
  type SupabaseReadFailureKind,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';

type AuthResult = {
  error: AuthError | null;
};

type SignUpResult = AuthResult & {
  requiresEmailConfirmation: boolean;
};

type ProfileUpdateResult = {
  error: PostgrestError | null;
};

export type DeleteAccountErrorCode =
  | 'deletion_failed'
  | 'last_admin'
  | 'unauthorized';

type DeleteAccountResult = {
  code: DeleteAccountErrorCode | null;
  error: Error | null;
};

type PasswordRecoveryStatus = 'error' | 'idle' | 'processing' | 'ready';

type AuthContextValue = {
  changeEmail: (currentPassword: string, newEmail: string) => Promise<AuthResult>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthResult>;
  completePasswordRecovery: (newPassword: string) => Promise<AuthResult>;
  continueWithoutAccount: () => Promise<AuthResult>;
  deleteAccount: () => Promise<DeleteAccountResult>;
  handlePasswordRecoveryUrl: (url: string) => Promise<boolean>;
  hasCheckedPasswordRecoveryLink: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  hasProfileError: boolean;
  profile: UserProfile | null;
  profileRefreshError: Error | null;
  profileSyncErrorKind: SupabaseReadFailureKind | null;
  passwordRecoveryError: Error | null;
  passwordRecoveryStatus: PasswordRecoveryStatus;
  refreshProfile: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  signUp: (
    displayName: string,
    email: string,
    password: string,
    memberType: MemberType,
    partySize: number,
    luggageCount: number,
    simCardCount: number,
  ) => Promise<SignUpResult>;
  updateLuggageCount: (luggageCount: number) => Promise<ProfileUpdateResult>;
  updatePartySize: (partySize: number) => Promise<ProfileUpdateResult>;
  updateSimCardCount: (simCardCount: number) => Promise<ProfileUpdateResult>;
  user: User | null;
};

type ProfileSyncState = {
  error: Error | null;
  profile: UserProfile | null;
  status: 'error' | 'idle' | 'loading' | 'ready' | 'refreshing';
  userId: string | null;
};

type PasswordRecoveryState = {
  error: Error | null;
  hasCheckedLink: boolean;
  status: PasswordRecoveryStatus;
};

const initialProfileSyncState: ProfileSyncState = {
  error: null,
  profile: null,
  status: 'idle',
  userId: null,
};

const initialPasswordRecoveryState: PasswordRecoveryState = {
  error: null,
  hasCheckedLink: false,
  status: 'idle',
};

function getProfileRefreshError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return new Error(error.message);
  }

  return new Error('Das Profil konnte nicht geladen werden.');
}

async function getDeleteAccountErrorCode(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { code?: unknown };

      if (body.code === 'last_admin' || body.code === 'unauthorized') {
        return body.code;
      }
    } catch {
      // Fall through to the non-specific error shown by the account screen.
    }
  }

  return 'deletion_failed' as const;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [passwordRecoveryState, setPasswordRecoveryState] = useState(
    initialPasswordRecoveryState,
  );
  const [profileSyncState, setProfileSyncState] = useState(initialProfileSyncState);
  const [session, setSession] = useState<Session | null>(null);
  const profileSyncStateRef = useRef(initialProfileSyncState);
  const profileRequestSequence = useRef(0);
  const sessionUserIdRef = useRef<string | null>(null);

  const updateProfileSyncState = useCallback(
    (update: (current: ProfileSyncState) => ProfileSyncState) => {
      const nextState = update(profileSyncStateRef.current);
      profileSyncStateRef.current = nextState;
      setProfileSyncState(nextState);
    },
    [],
  );

  const applySession = useCallback(
    (nextSession: Session | null) => {
      const nextUserId = nextSession?.user.id ?? null;

      if (sessionUserIdRef.current !== nextUserId) {
        sessionUserIdRef.current = nextUserId;
        profileRequestSequence.current += 1;
        updateProfileSyncState(() => ({
          error: null,
          profile: null,
          status: nextUserId ? 'loading' : 'idle',
          userId: nextUserId,
        }));
      }

      setSession(nextSession);
    },
    [updateProfileSyncState],
  );

  const handlePasswordRecoveryUrl = useCallback(
    async (url: string) => {
      const recoveryLink = parsePasswordRecoveryLink(url);

      if (!recoveryLink) {
        return false;
      }

      setPasswordRecoveryState({
        error: null,
        hasCheckedLink: true,
        status: 'processing',
      });

      if (recoveryLink.kind === 'error') {
        setPasswordRecoveryState({
          error: new Error(recoveryLink.errorDescription),
          hasCheckedLink: true,
          status: 'error',
        });
        return true;
      }

      const result =
        recoveryLink.kind === 'implicit'
          ? await supabase.auth.setSession({
              access_token: recoveryLink.accessToken,
              refresh_token: recoveryLink.refreshToken,
            })
          : recoveryLink.kind === 'pkce'
            ? await supabase.auth.exchangeCodeForSession(
                recoveryLink.code,
                recoveryLink.flowId ? { flowId: recoveryLink.flowId } : undefined,
              )
            : await supabase.auth.verifyOtp({
                token_hash: recoveryLink.tokenHash,
                type: 'recovery',
              });

      if (result.error || !result.data.session) {
        setPasswordRecoveryState({
          error: result.error ?? new Error('Die Recovery-Session fehlt.'),
          hasCheckedLink: true,
          status: 'error',
        });
        return true;
      }

      applySession(result.data.session);
      setPasswordRecoveryState({
        error: null,
        hasCheckedLink: true,
        status: 'ready',
      });
      return true;
    },
    [applySession],
  );

  useEffect(() => {
    let isMounted = true;
    let hasReceivedAuthEvent = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (isMounted) {
        hasReceivedAuthEvent = true;
        applySession(nextSession);

        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecoveryState({
            error: nextSession ? null : new Error('Die Recovery-Session fehlt.'),
            hasCheckedLink: true,
            status: nextSession ? 'ready' : 'error',
          });
        } else if (event === 'SIGNED_OUT') {
          setPasswordRecoveryState({
            ...initialPasswordRecoveryState,
            hasCheckedLink: true,
          });
        }

        setIsSessionLoading(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }

        if (!hasReceivedAuthEvent) {
          applySession(error ? null : data.session);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsSessionLoading(false);
        }
      });

    const appStateSubscription =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') {
              supabase.auth.startAutoRefresh();
            } else {
              supabase.auth.stopAutoRefresh();
            }
          });

    if (Platform.OS !== 'web' && AppState.currentState === 'active') {
      supabase.auth.startAutoRefresh();
    }

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      appStateSubscription?.remove();

      if (Platform.OS !== 'web') {
        supabase.auth.stopAutoRefresh();
      }
    };
  }, [applySession]);

  useEffect(() => {
    let isMounted = true;
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handlePasswordRecoveryUrl(url);
    });

    Linking.getInitialURL()
      .then(async (url) => {
        if (!isMounted) {
          return;
        }

        const handled = url ? await handlePasswordRecoveryUrl(url) : false;

        if (isMounted && !handled) {
          setPasswordRecoveryState((current) => ({
            ...current,
            hasCheckedLink: true,
          }));
        }
      })
      .catch(() => {
        if (isMounted) {
          setPasswordRecoveryState({
            error: new Error('Der Recovery-Link konnte nicht gelesen werden.'),
            hasCheckedLink: true,
            status: 'error',
          });
        }
      });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [handlePasswordRecoveryUrl]);

  const refreshProfile = useCallback(async () => {
    const userId = sessionUserIdRef.current;
    const requestSequence = ++profileRequestSequence.current;

    if (!userId) {
      return;
    }

    const hasCurrentProfile =
      profileSyncStateRef.current.userId === userId &&
      profileSyncStateRef.current.profile?.user_id === userId;

    updateProfileSyncState((current) => {
      if (current.userId !== userId) {
        return current;
      }

      return {
        ...current,
        error: null,
        profile: hasCurrentProfile ? current.profile : null,
        status: hasCurrentProfile ? 'refreshing' : 'loading',
      };
    });

    try {
      const { data, error } = await withSupabaseReadTimeout((signal) =>
        supabase
          .from('profiles')
          .select('id, user_id, display_name, member_type, party_size, luggage_count, sim_card_count, family_id, role, created_at, updated_at')
          .eq('user_id', userId)
          .abortSignal(signal)
          .maybeSingle(),
      );

      if (error) {
        throw error;
      }

      if (
        requestSequence === profileRequestSequence.current &&
        sessionUserIdRef.current === userId
      ) {
        updateProfileSyncState((current) => {
          if (current.userId !== userId) {
            return current;
          }

          if (!data) {
            return {
              error: new Error('Das Profil wurde nicht gefunden.'),
              profile: null,
              status: 'error',
              userId,
            };
          }

          return { error: null, profile: data, status: 'ready', userId };
        });
      }
    } catch (error) {
      if (
        requestSequence === profileRequestSequence.current &&
        sessionUserIdRef.current === userId
      ) {
        const profileRefreshError = getProfileRefreshError(error);

        updateProfileSyncState((current) => {
          if (current.userId !== userId) {
            return current;
          }

          const canKeepProfile = current.profile?.user_id === userId;

          return {
            ...current,
            error: profileRefreshError,
            profile: canKeepProfile ? current.profile : null,
            status: canKeepProfile ? 'ready' : 'error',
          };
        });
      }
    }
  }, [updateProfileSyncState]);

  useEffect(() => {
    if (!session?.user.id || isSessionLoading) {
      return;
    }

    const profileLoadTimeout = setTimeout(() => void refreshProfile(), 0);

    return () => {
      clearTimeout(profileLoadTimeout);
      profileRequestSequence.current += 1;
    };
  }, [isSessionLoading, refreshProfile, session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;

    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`own-profile:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          filter: `user_id=eq.${userId}`,
          schema: 'public',
          table: 'profiles',
        },
        () => void refreshProfile(),
      )
      .subscribe();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshProfile();
      }
    });

    return () => {
      appStateSubscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [refreshProfile, session?.user.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(
    async (
      displayName: string,
      email: string,
      password: string,
      memberType: MemberType,
      partySize: number,
      luggageCount: number,
      simCardCount: number,
    ) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            luggage_count: luggageCount,
            member_type: memberType,
            party_size: partySize,
            sim_card_count: simCardCount,
          },
        },
      });

      return {
        error,
        requiresEmailConfirmation: !error && !data.session,
      };
    },
    [],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (!error) {
      applySession(null);
    }

    return { error };
  }, [applySession]);

  const continueWithoutAccount = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (!error) {
      applySession(null);
      setPasswordRecoveryState({
        ...initialPasswordRecoveryState,
        hasCheckedLink: true,
      });
    }

    return { error };
  }, [applySession]);

  const verifyCurrentPassword = useCallback(
    async (currentPassword: string) => {
      if (!session?.user.email) {
        return { error: null, verified: false };
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      });

      return { error, verified: !error };
    },
    [session],
  );

  const changeEmail = useCallback(
    async (currentPassword: string, newEmail: string) => {
      const verification = await verifyCurrentPassword(currentPassword);

      if (!verification.verified) {
        if (!verification.error) {
          throw new Error('Das Konto hat keine E-Mail-Adresse.');
        }

        return { error: verification.error };
      }

      const { error } = await supabase.auth.updateUser({ email: newEmail });
      return { error };
    },
    [verifyCurrentPassword],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const verification = await verifyCurrentPassword(currentPassword);

      if (!verification.verified) {
        if (!verification.error) {
          throw new Error('Das Konto hat keine E-Mail-Adresse.');
        }

        return { error: verification.error };
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return { error };
    },
    [verifyCurrentPassword],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: passwordRecoveryRedirectUrl(),
    });
    return { error };
  }, []);

  const completePasswordRecovery = useCallback(
    async (newPassword: string) => {
      if (passwordRecoveryState.status !== 'ready' || !session) {
        throw new Error('Es ist keine gültige Recovery-Session aktiv.');
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        return { error };
      }

      // Global logout revokes remaining refresh tokens after a password reset.
      // The installed SDK removes the current local session even when Auth
      // reports that the already-invalidated server session no longer exists.
      await supabase.auth.signOut({ scope: 'global' });
      applySession(null);
      setPasswordRecoveryState({
        ...initialPasswordRecoveryState,
        hasCheckedLink: true,
      });
      return { error: null };
    },
    [applySession, passwordRecoveryState.status, session],
  );

  const deleteAccount = useCallback(async (): Promise<DeleteAccountResult> => {
    if (!session) {
      return {
        code: 'unauthorized',
        error: new Error('Für die Kontolöschung ist eine Anmeldung erforderlich.'),
      };
    }

    const { data, error } = await supabase.functions.invoke<{
      code?: string;
      message?: string;
    }>('delete-account', {
      body: {},
      method: 'POST',
    });

    if (error) {
      return {
        code: await getDeleteAccountErrorCode(error),
        error,
      };
    }

    if (data?.code !== 'account_deleted') {
      return {
        code: 'deletion_failed',
        error: new Error('Die Löschfunktion hat den Erfolg nicht bestätigt.'),
      };
    }

    await supabase.auth.signOut({ scope: 'local' });
    applySession(null);
    setPasswordRecoveryState({
      ...initialPasswordRecoveryState,
      hasCheckedLink: true,
    });
    return { code: null, error: null };
  }, [applySession, session]);

  const updatePartySize = useCallback(
    async (partySize: number) => {
      const userId = session?.user.id;

      if (!userId) {
        throw new Error('Für die Änderung ist eine Anmeldung erforderlich.');
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({ party_size: partySize })
        .eq('user_id', userId)
        .select('id, user_id, display_name, member_type, party_size, luggage_count, sim_card_count, family_id, role, created_at, updated_at')
        .single();

      if (!error && sessionUserIdRef.current === userId) {
        profileRequestSequence.current += 1;
        updateProfileSyncState((current) =>
          current.userId === userId
            ? { error: null, profile: data, status: 'ready', userId }
            : current,
        );
      }

      return { error };
    },
    [session, updateProfileSyncState],
  );

  const updateLuggageCount = useCallback(
    async (luggageCount: number) => {
      const userId = session?.user.id;

      if (!userId) {
        throw new Error('Für die Änderung ist eine Anmeldung erforderlich.');
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({ luggage_count: luggageCount })
        .eq('user_id', userId)
        .select('id, user_id, display_name, member_type, party_size, luggage_count, sim_card_count, family_id, role, created_at, updated_at')
        .single();

      if (!error && sessionUserIdRef.current === userId) {
        profileRequestSequence.current += 1;
        updateProfileSyncState((current) =>
          current.userId === userId
            ? { error: null, profile: data, status: 'ready', userId }
            : current,
        );
      }

      return { error };
    },
    [session, updateProfileSyncState],
  );

  const updateSimCardCount = useCallback(
    async (simCardCount: number) => {
      const userId = session?.user.id;

      if (!userId) {
        throw new Error('Für die Änderung ist eine Anmeldung erforderlich.');
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({ sim_card_count: simCardCount })
        .eq('user_id', userId)
        .select('id, user_id, display_name, member_type, party_size, luggage_count, sim_card_count, family_id, role, created_at, updated_at')
        .single();

      if (!error && sessionUserIdRef.current === userId) {
        profileRequestSequence.current += 1;
        updateProfileSyncState((current) =>
          current.userId === userId
            ? { error: null, profile: data, status: 'ready', userId }
            : current,
        );
      }

      return { error };
    },
    [session, updateProfileSyncState],
  );

  const currentProfile =
    profileSyncState.userId === session?.user.id &&
    profileSyncState.profile?.user_id === session?.user.id
      ? profileSyncState.profile
      : null;
  const isLoading =
    isSessionLoading ||
    Boolean(
      session &&
        (profileSyncState.userId !== session.user.id || profileSyncState.status === 'loading'),
    );
  const isRefreshing = Boolean(currentProfile && profileSyncState.status === 'refreshing');
  const hasProfileError = Boolean(session && !isLoading && currentProfile === null);
  const profileRefreshError = currentProfile ? profileSyncState.error : null;
  const profileSyncErrorKind =
    session && profileSyncState.error
      ? getSupabaseReadFailureKind(profileSyncState.error)
      : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      changeEmail,
      changePassword,
      completePasswordRecovery,
      continueWithoutAccount,
      deleteAccount,
      handlePasswordRecoveryUrl,
      hasProfileError,
      hasCheckedPasswordRecoveryLink: passwordRecoveryState.hasCheckedLink,
      isAdmin: currentProfile?.role === 'admin',
      isLoading,
      isRefreshing,
      profile: currentProfile,
      profileRefreshError,
      profileSyncErrorKind,
      passwordRecoveryError: passwordRecoveryState.error,
      passwordRecoveryStatus: passwordRecoveryState.status,
      refreshProfile,
      requestPasswordReset,
      session,
      signIn,
      signOut,
      signUp,
      updateLuggageCount,
      updateSimCardCount,
      user: session?.user ?? null,
      updatePartySize,
    }),
    [
      changeEmail,
      changePassword,
      completePasswordRecovery,
      continueWithoutAccount,
      currentProfile,
      deleteAccount,
      handlePasswordRecoveryUrl,
      hasProfileError,
      isLoading,
      isRefreshing,
      profileRefreshError,
      profileSyncErrorKind,
      passwordRecoveryState,
      refreshProfile,
      requestPasswordReset,
      session,
      signIn,
      signOut,
      signUp,
      updateLuggageCount,
      updateSimCardCount,
      updatePartySize,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden.');
  }

  return value;
}

export function getAuthErrorTranslationKey(error: AuthError) {
  switch (error.code) {
    case 'email_not_confirmed':
      return 'auth.error.emailNotConfirmed';
    case 'invalid_credentials':
      return 'auth.error.invalidCredentials';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'auth.error.rateLimit';
    case 'signup_disabled':
      return 'auth.error.signupDisabled';
    case 'user_already_exists':
    case 'email_exists':
      return 'auth.error.userExists';
    case 'weak_password':
      return 'auth.error.weakPassword';
    default:
      return 'auth.error.generic';
  }
}
