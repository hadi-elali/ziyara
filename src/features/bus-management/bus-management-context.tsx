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

import type {
  Trip,
  TripBus,
  TripParticipant,
} from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import {
  buildBusParticipantStates,
  type BusParticipantState,
} from '@/features/bus-management/bus-management-state';
import {
  getOriginalErrorMessage,
  getSupabaseReadFailureKind,
  type SupabaseReadFailureKind,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';

type SyncState = 'error' | 'loading' | 'ready' | 'refreshing';

type BusManagementContextValue = {
  activeTrip: Trip | null;
  buses: TripBus[];
  hasSyncError: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  participants: BusParticipantState[];
  refresh: () => Promise<void>;
  syncErrorMessage: string | null;
  syncErrorKind: SupabaseReadFailureKind | null;
  trips: Trip[];
};

const BusManagementContext = createContext<BusManagementContextValue | null>(null);
const fallbackRefreshIntervalMs = 60_000;
const fallbackRefreshJitterMs = 30_000;

type BusManagementSnapshot = {
  activeTrip: Trip | null;
  buses: TripBus[];
  participants: TripParticipant[];
  trips: Trip[];
};

const emptySnapshot: BusManagementSnapshot = {
  activeTrip: null,
  buses: [],
  participants: [],
  trips: [],
};

export function BusManagementProvider({ children }: PropsWithChildren) {
  const { isLoading: isAuthLoading, session } = useAuth();
  const userId = session?.user.id ?? null;
  const previousUserIdRef = useRef(userId);
  const syncedUserIdRef = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<BusManagementSnapshot>(emptySnapshot);
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [syncErrorKind, setSyncErrorKind] = useState<SupabaseReadFailureKind | null>(null);
  const stateVersion = useRef(0);

  useEffect(() => {
    if (previousUserIdRef.current === userId) return;

    previousUserIdRef.current = userId;
    stateVersion.current += 1;
    syncedUserIdRef.current = null;
    setSyncedUserId(null);
    setSnapshot(emptySnapshot);
    setSyncErrorMessage(null);
    setSyncErrorKind(null);
    setSyncState(userId ? 'loading' : 'ready');
  }, [userId]);

  const refresh = useCallback(async () => {
    const requestVersion = ++stateVersion.current;

    if (!userId) {
      setSnapshot(emptySnapshot);
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
      const { data: trips, error: tripError } = await withSupabaseReadTimeout((signal) =>
        supabase
          .from('trips')
          .select('id, name, created_by_profile_id, created_at, archived_at')
          .order('created_at', { ascending: false })
          .abortSignal(signal)
      );

      if (tripError) {
        throw tripError;
      }

      const visibleTrips = trips ?? [];
      const activeTrip = visibleTrips.find((trip) => trip.archived_at === null) ?? null;

      if (!activeTrip) {
        if (requestVersion === stateVersion.current) {
          setSnapshot({ ...emptySnapshot, trips: visibleTrips });
          syncedUserIdRef.current = userId;
          setSyncedUserId(userId);
          setSyncErrorMessage(null);
          setSyncErrorKind(null);
          setSyncState('ready');
        }
        return;
      }

      const [busesResult, participantsResult] = await Promise.all([
        withSupabaseReadTimeout((signal) =>
          supabase
            .from('trip_buses')
            .select('id, trip_id, name, sort_order, leader_participant_id, created_at')
            .eq('trip_id', activeTrip.id)
            .order('sort_order')
            .abortSignal(signal),
        ),
        withSupabaseReadTimeout((signal) =>
          supabase
            .from('trip_participants')
            .select(
              'id, trip_id, bus_id, profile_id, assignment_family_id, participant_code, display_name, created_at, updated_at',
            )
            .eq('trip_id', activeTrip.id)
            .order('display_name')
            .abortSignal(signal),
        ),
      ]);

      if (busesResult.error) throw busesResult.error;
      if (participantsResult.error) throw participantsResult.error;
      if (requestVersion === stateVersion.current) {
        setSnapshot({
          activeTrip,
          buses: busesResult.data ?? [],
          participants: participantsResult.data ?? [],
          trips: visibleTrips,
        });
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
  }, [userId]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    const initialRefreshTimeout = setTimeout(() => void refresh(), 0);

    if (!userId) {
      return () => {
        clearTimeout(initialRefreshTimeout);
        stateVersion.current += 1;
      };
    }

    const channel = supabase.channel(`bus-management-state:${userId}`);
    for (const table of [
      'trips',
      'trip_buses',
      'trip_participants',
    ]) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => void refresh());
    }
    channel.subscribe();

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
      stateVersion.current += 1;
      if (pollingTimeout) clearTimeout(pollingTimeout);
      appStateSubscription?.remove();
      void supabase.removeChannel(channel);
    };
  }, [isAuthLoading, refresh, userId]);

  const participants = useMemo(
    () =>
      buildBusParticipantStates(
        snapshot.participants,
        snapshot.buses,
        [],
      ),
    [snapshot.buses, snapshot.participants],
  );
  const value = useMemo<BusManagementContextValue>(
    () => ({
      activeTrip: snapshot.activeTrip,
      buses: snapshot.buses,
      hasSyncError: syncState === 'error',
      isLoading: syncState === 'loading' || syncedUserId !== userId,
      isRefreshing: syncState === 'refreshing',
      participants,
      refresh,
      syncErrorMessage,
      syncErrorKind,
      trips: snapshot.trips,
    }),
    [participants, refresh, snapshot.activeTrip, snapshot.buses, snapshot.trips, syncErrorKind, syncErrorMessage, syncState, syncedUserId, userId],
  );

  return <BusManagementContext.Provider value={value}>{children}</BusManagementContext.Provider>;
}

export function useBusManagement() {
  const value = useContext(BusManagementContext);

  if (!value) {
    throw new Error('useBusManagement must be used inside BusManagementProvider.');
  }

  return value;
}
