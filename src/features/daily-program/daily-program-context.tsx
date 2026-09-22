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

import type { DailyProgram } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import { useDailyProgramCache } from '@/features/daily-program/daily-program-cache';
import {
  getOriginalErrorMessage,
  getSupabaseReadFailureKind,
  type SupabaseReadFailureKind,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';

type SyncState = 'error' | 'loading' | 'ready' | 'refreshing';

type DailyProgramContextValue = {
  hasProgramSnapshot: boolean;
  hasSyncError: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  programs: DailyProgram[];
  refresh: () => Promise<void>;
  syncErrorMessage: string | null;
  syncErrorKind: SupabaseReadFailureKind | null;
};

const DailyProgramContext = createContext<DailyProgramContextValue | null>(null);
const fallbackRefreshIntervalMs = 120_000;
const fallbackRefreshJitterMs = 30_000;

export function DailyProgramProvider({ children }: PropsWithChildren) {
  const { isLoading: isAuthLoading, session } = useAuth();
  const userId = session?.user.id ?? null;
  const previousUserIdRef = useRef(userId);
  const syncedUserIdRef = useRef<string | null>(null);
  const stateVersionRef = useRef(0);
  const [programCache, setProgramCache] = useDailyProgramCache();
  const [programs, setPrograms] = useState<DailyProgram[]>([]);
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [syncErrorKind, setSyncErrorKind] = useState<SupabaseReadFailureKind | null>(null);

  useEffect(() => {
    if (previousUserIdRef.current === userId) return;
    previousUserIdRef.current = userId;
    stateVersionRef.current += 1;
    syncedUserIdRef.current = null;
    setPrograms([]);
    setSyncedUserId(null);
    setSyncErrorMessage(null);
    setSyncErrorKind(null);
    setSyncState(userId ? 'loading' : 'ready');
  }, [userId]);

  const refresh = useCallback(async () => {
    const requestVersion = ++stateVersionRef.current;

    if (!userId) {
      setPrograms([]);
      syncedUserIdRef.current = null;
      setSyncedUserId(null);
      setSyncErrorMessage(null);
      setSyncErrorKind(null);
      setSyncState('ready');
      return;
    }

    setSyncState((current) =>
      syncedUserIdRef.current === userId && current !== 'loading' ? 'refreshing' : 'loading',
    );

    try {
      const { data, error } = await withSupabaseReadTimeout((signal) =>
        supabase
          .from('daily_programs')
          .select(
            'id, program_date, title, details, published_by_profile_id, created_at, updated_at',
          )
          .order('program_date')
          .abortSignal(signal),
      );
      if (error) throw error;

      if (requestVersion === stateVersionRef.current) {
        const nextPrograms = data ?? [];
        setPrograms(nextPrograms);
        setProgramCache({ programs: nextPrograms, userId });
        syncedUserIdRef.current = userId;
        setSyncedUserId(userId);
        setSyncErrorMessage(null);
        setSyncErrorKind(null);
        setSyncState('ready');
      }
    } catch (error) {
      if (requestVersion === stateVersionRef.current) {
        setSyncErrorMessage(getOriginalErrorMessage(error));
        setSyncErrorKind(getSupabaseReadFailureKind(error));
        setSyncState('error');
      }
    }
  }, [setProgramCache, userId]);

  useEffect(() => {
    if (isAuthLoading) return;
    const initialRefreshTimeout = setTimeout(() => void refresh(), 0);

    if (!userId) {
      return () => {
        clearTimeout(initialRefreshTimeout);
        stateVersionRef.current += 1;
      };
    }

    const channel = supabase
      .channel(`daily-program-state:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_programs' },
        () => void refresh(),
      )
      .subscribe();

    let pollingTimeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const scheduleFallbackRefresh = () => {
      if (stopped) return;
      const delay = fallbackRefreshIntervalMs + Math.random() * fallbackRefreshJitterMs;
      pollingTimeout = setTimeout(() => void refresh().finally(scheduleFallbackRefresh), delay);
    };
    scheduleFallbackRefresh();

    const appStateSubscription =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') void refresh();
          });

    return () => {
      stopped = true;
      clearTimeout(initialRefreshTimeout);
      if (pollingTimeout) clearTimeout(pollingTimeout);
      appStateSubscription?.remove();
      stateVersionRef.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [isAuthLoading, refresh, userId]);

  const cachedPrograms =
    userId && programCache?.userId === userId ? programCache.programs : null;
  const hasProgramSnapshot =
    Boolean(userId) && (syncedUserId === userId || cachedPrograms !== null);

  const value = useMemo<DailyProgramContextValue>(
    () => {
      const visiblePrograms =
        syncedUserId === userId ? programs : (cachedPrograms ?? []);

      return {
        hasProgramSnapshot,
        hasSyncError: syncState === 'error',
        isLoading: syncState === 'loading' && !hasProgramSnapshot,
        isRefreshing:
          syncState === 'refreshing' ||
          (syncState === 'loading' && hasProgramSnapshot),
        programs: visiblePrograms,
        refresh,
        syncErrorMessage,
        syncErrorKind,
      };
    },
    [
      cachedPrograms,
      hasProgramSnapshot,
      programs,
      refresh,
      syncedUserId,
      syncErrorMessage,
      syncErrorKind,
      syncState,
      userId,
    ],
  );

  return <DailyProgramContext.Provider value={value}>{children}</DailyProgramContext.Provider>;
}

export function useDailyProgram() {
  const value = useContext(DailyProgramContext);
  if (!value) {
    throw new Error('useDailyProgram must be used inside DailyProgramProvider.');
  }
  return value;
}
