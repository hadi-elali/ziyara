import type { PostgrestError } from '@supabase/supabase-js';
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

import type { GroupCheck } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import {
  getSupabaseReadFailureKind,
  type SupabaseReadFailureKind,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';

type GroupCheckActionResult = {
  error: PostgrestError | null;
};

type SyncState = 'error' | 'loading' | 'ready';

type GroupCheckContextValue = {
  activeCheck: GroupCheck | null;
  closeCheck: (checkId: number) => Promise<GroupCheckActionResult>;
  currentResponse: boolean | null;
  hasSyncError: boolean;
  isBlocking: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  respond: (checkId: number, answer: boolean) => Promise<GroupCheckActionResult>;
  startCheck: (question: string) => Promise<GroupCheckActionResult>;
  syncErrorKind: SupabaseReadFailureKind | null;
};

const GroupCheckContext = createContext<GroupCheckContextValue | null>(null);
const fallbackRefreshIntervalMs = 60_000;
const fallbackRefreshJitterMs = 30_000;

export function GroupCheckProvider({ children }: PropsWithChildren) {
  const {
    hasProfileError,
    isAdmin,
    isLoading: isAuthLoading,
    profile,
    session,
  } = useAuth();
  const [activeCheck, setActiveCheck] = useState<GroupCheck | null>(null);
  const [currentResponse, setCurrentResponse] = useState<boolean | null>(null);
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [syncErrorKind, setSyncErrorKind] = useState<SupabaseReadFailureKind | null>(null);
  const latestMutationVersion = useRef(0);
  const stateVersion = useRef(0);
  const profileId = profile?.id ?? null;
  const userId = session?.user.id ?? null;
  const userIdRef = useRef(userId);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const refresh = useCallback(async () => {
    const requestVersion = ++stateVersion.current;

    if (!userId) {
      setActiveCheck(null);
      setCurrentResponse(null);
      setSyncedUserId(null);
      setSyncErrorKind(null);
      setSyncState('ready');
      return;
    }

    try {
      const { data: check, error: checkError } = await withSupabaseReadTimeout((signal) =>
        supabase
          .from('group_checks')
          .select('id, question, created_by_profile_id, created_at, closed_at')
          .is('closed_at', null)
          .abortSignal(signal)
          .maybeSingle(),
      );

      if (checkError) {
        throw checkError;
      }

      let response: boolean | null = null;

      if (check && profileId !== null) {
        const { data: savedResponse, error: responseError } = await withSupabaseReadTimeout(
          (signal) =>
            supabase
              .from('group_check_responses')
              .select('answer')
              .eq('check_id', check.id)
              .eq('profile_id', profileId)
              .abortSignal(signal)
              .maybeSingle(),
        );

        if (responseError) {
          throw responseError;
        }

        response = savedResponse?.answer ?? null;
      }

      if (requestVersion === stateVersion.current) {
        setActiveCheck(check);
        setCurrentResponse(response);
        setSyncedUserId(userId);
        setSyncErrorKind(null);
        setSyncState('ready');
      }
    } catch (error) {
      if (requestVersion === stateVersion.current) {
        setSyncedUserId(userId);
        setSyncErrorKind(getSupabaseReadFailureKind(error));
        setSyncState('error');
      }
    }
  }, [profileId, userId]);

  useEffect(() => {
    if (isAuthLoading || (userId !== null && hasProfileError)) {
      return;
    }

    const initialRefreshTimeout = setTimeout(() => void refresh(), 0);

    if (!userId) {
      return () => {
        clearTimeout(initialRefreshTimeout);
        latestMutationVersion.current = ++stateVersion.current;
      };
    }

    const channel = supabase
      .channel(`group-check-state:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_checks' },
        () => void refresh(),
      )
      .subscribe();

    let pollingTimeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const scheduleFallbackRefresh = () => {
      if (stopped) {
        return;
      }

      const delay = fallbackRefreshIntervalMs + Math.random() * fallbackRefreshJitterMs;
      pollingTimeout = setTimeout(() => {
        void refresh().finally(scheduleFallbackRefresh);
      }, delay);
    };
    scheduleFallbackRefresh();
    const appStateSubscription =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') {
              void refresh();
            }
          });

    return () => {
      stopped = true;
      clearTimeout(initialRefreshTimeout);
      latestMutationVersion.current = ++stateVersion.current;
      if (pollingTimeout) {
        clearTimeout(pollingTimeout);
      }
      appStateSubscription?.remove();
      void supabase.removeChannel(channel);
    };
  }, [hasProfileError, isAuthLoading, refresh, userId]);

  const startCheck = useCallback(
    async (question: string) => {
      const mutationVersion = ++stateVersion.current;
      latestMutationVersion.current = mutationVersion;
      const { data, error } = await supabase.rpc('start_group_check', { p_question: question });

      if (!error && userIdRef.current === userId) {
        if (mutationVersion === latestMutationVersion.current) {
          stateVersion.current += 1;
          setActiveCheck(data);
          setCurrentResponse(null);
          setSyncedUserId(userId);
          setSyncErrorKind(null);
          setSyncState('ready');
        }

        await refresh();
      }

      return { error };
    },
    [refresh, userId],
  );

  const closeCheck = useCallback(
    async (checkId: number) => {
      const mutationVersion = ++stateVersion.current;
      latestMutationVersion.current = mutationVersion;
      const { error } = await supabase.rpc('close_group_check', { p_check_id: checkId });

      if (!error && userIdRef.current === userId) {
        if (mutationVersion === latestMutationVersion.current) {
          stateVersion.current += 1;
          setActiveCheck((current) => (current?.id === checkId ? null : current));
          setCurrentResponse(null);
          setSyncedUserId(userId);
          setSyncErrorKind(null);
          setSyncState('ready');
        }

        await refresh();
      }

      return { error };
    },
    [refresh, userId],
  );

  const respond = useCallback(
    async (checkId: number, answer: boolean) => {
      const mutationVersion = ++stateVersion.current;
      latestMutationVersion.current = mutationVersion;
      const { data, error } = await supabase.rpc('respond_to_group_check', {
        p_answer: answer,
        p_check_id: checkId,
      });

      if (!error && userIdRef.current === userId) {
        if (mutationVersion === latestMutationVersion.current) {
          stateVersion.current += 1;
          setCurrentResponse(data?.answer ?? answer);
          setSyncedUserId(userId);
          setSyncErrorKind(null);
          setSyncState('ready');
        }

        await refresh();
      }

      return { error };
    },
    [refresh, userId],
  );

  const hasSyncError = syncState === 'error';
  const isLoading = isAuthLoading || syncedUserId !== userId || syncState === 'loading';
  const needsResponse =
    currentResponse === null && Boolean(activeCheck || isLoading || hasSyncError);
  const isBlocking = Boolean(
    session && !isAuthLoading && !isAdmin && needsResponse,
  );

  const value = useMemo<GroupCheckContextValue>(
    () => ({
      activeCheck,
      closeCheck,
      currentResponse,
      hasSyncError,
      isBlocking,
      isLoading,
      refresh,
      respond,
      startCheck,
      syncErrorKind,
    }),
    [
      activeCheck,
      closeCheck,
      currentResponse,
      hasSyncError,
      isBlocking,
      isLoading,
      refresh,
      respond,
      startCheck,
      syncErrorKind,
    ],
  );

  return <GroupCheckContext.Provider value={value}>{children}</GroupCheckContext.Provider>;
}

export function useGroupCheck() {
  const value = useContext(GroupCheckContext);

  if (!value) {
    throw new Error('useGroupCheck muss innerhalb von GroupCheckProvider verwendet werden.');
  }

  return value;
}
