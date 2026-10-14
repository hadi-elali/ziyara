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

import type { TripNavigationDestination } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import {
  getOriginalErrorMessage,
  getSupabaseReadFailureKind,
  type SupabaseReadFailureKind,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';
import { useTripNavigationCache } from '@/features/trip-guidance/trip-navigation-cache';

type TripGuidanceContextValue = {
  hasSyncError: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  navigationDestinations: TripNavigationDestination[];
  refresh: () => Promise<void>;
  syncErrorMessage: string | null;
  syncErrorKind: SupabaseReadFailureKind | null;
};

type SyncState = 'error' | 'loading' | 'ready' | 'refreshing';

const TripGuidanceContext = createContext<TripGuidanceContextValue | null>(null);
const emptyDestinations: TripNavigationDestination[] = [];
const fallbackRefreshIntervalMs = 60_000;
const fallbackRefreshJitterMs = 30_000;

export function TripGuidanceProvider({ children }: PropsWithChildren) {
  const { isLoading: isAuthLoading, session } = useAuth();
  const userId = session?.user.id ?? null;
  const previousUserIdRef = useRef(userId);
  const syncedUserIdRef = useRef<string | null>(null);
  const [navigationCache, setNavigationCache] = useTripNavigationCache();
  const [destinations, setDestinations] = useState(emptyDestinations);
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [syncErrorKind, setSyncErrorKind] = useState<SupabaseReadFailureKind | null>(null);
  const stateVersion = useRef(0);
  const cachedNavigationDestinations =
    userId && navigationCache?.userId === userId
      ? navigationCache.destinations
      : emptyDestinations;
  const visibleNavigationDestinations =
    syncedUserId === userId && syncState !== 'error'
      ? destinations
      : cachedNavigationDestinations;

  useEffect(() => {
    if (previousUserIdRef.current === userId) return;
    previousUserIdRef.current = userId;
    stateVersion.current += 1;
    syncedUserIdRef.current = null;
    setDestinations(emptyDestinations);
    setSyncedUserId(null);
    setSyncErrorMessage(null);
    setSyncErrorKind(null);
    setSyncState(userId ? 'loading' : 'ready');
  }, [userId]);

  const refresh = useCallback(async () => {
    const requestVersion = ++stateVersion.current;

    if (!userId) {
      setDestinations(emptyDestinations);
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
          .from('trip_navigation_destinations')
          .select(
            'id, trip_id, name, details, latitude, longitude, sort_order, created_by_profile_id, created_at, updated_at, archived_at',
          )
          .is('archived_at', null)
          .order('sort_order')
          .order('id')
          .abortSignal(signal),
      );
      if (error) throw error;
      const navigationDestinations = data ?? [];

      if (requestVersion === stateVersion.current) {
        setNavigationCache({ destinations: navigationDestinations, userId });

        setDestinations(navigationDestinations);
        syncedUserIdRef.current = userId;
        setSyncedUserId(userId);
        setSyncErrorMessage(null);
        setSyncErrorKind(null);
        setSyncState('ready');
      }
    } catch (error) {
      if (requestVersion === stateVersion.current) {
        syncedUserIdRef.current = userId;
        setSyncedUserId(userId);
        setSyncErrorMessage(getOriginalErrorMessage(error));
        setSyncErrorKind(getSupabaseReadFailureKind(error));
        setSyncState('error');
      }
    }
  }, [setNavigationCache, userId]);

  useEffect(() => {
    if (isAuthLoading) return;
    const initialRefreshTimeout = setTimeout(() => void refresh(), 0);

    if (!userId) {
      return () => {
        clearTimeout(initialRefreshTimeout);
        stateVersion.current += 1;
      };
    }

    const channel = supabase.channel(`trip-guidance-state:${userId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trip_navigation_destinations' },
      () => void refresh(),
    );
    channel.subscribe();

    let pollingTimeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const scheduleFallbackRefresh = () => {
      if (stopped) return;
      const delay = fallbackRefreshIntervalMs + Math.random() * fallbackRefreshJitterMs;
      pollingTimeout = setTimeout(
        () => void refresh().finally(scheduleFallbackRefresh),
        delay,
      );
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
      stateVersion.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [isAuthLoading, refresh, userId]);

  const value = useMemo<TripGuidanceContextValue>(
    () => ({
      hasSyncError: syncState === 'error',
      isLoading: syncState === 'loading' || syncedUserId !== userId,
      isRefreshing: syncState === 'refreshing',
      navigationDestinations: visibleNavigationDestinations,
      refresh,
      syncErrorMessage,
      syncErrorKind,
    }),
    [refresh, syncErrorKind, syncErrorMessage, syncState, syncedUserId, userId, visibleNavigationDestinations],
  );

  return <TripGuidanceContext.Provider value={value}>{children}</TripGuidanceContext.Provider>;
}

export function useTripGuidance() {
  const value = useContext(TripGuidanceContext);
  if (!value) {
    throw new Error('useTripGuidance must be used inside TripGuidanceProvider.');
  }
  return value;
}
