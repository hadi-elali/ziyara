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
  AdminTripBusMember,
  Trip,
  TripBus,
  TripParticipant,
} from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import {
  buildBusParticipantStates,
  shouldRetryBusStatusAfterSessionRefresh,
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
  roster: AdminTripBusMember[];
  selectBus: (busId: number) => Promise<void>;
  setBusPresence: (busId: number, isOnBus: boolean) => Promise<void>;
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
  roster: AdminTripBusMember[];
  trips: Trip[];
};

const emptySnapshot: BusManagementSnapshot = {
  activeTrip: null,
  buses: [],
  participants: [],
  roster: [],
  trips: [],
};

export function BusManagementProvider({ children }: PropsWithChildren) {
  const { isLoading: isAuthLoading, profile, session } = useAuth();
  const userId = session?.user.id ?? null;
  const isAdmin = profile?.role === 'admin';
  const scopeKey = userId ? `${userId}:${isAdmin}` : null;
  const currentScopeRef = useRef(scopeKey);
  const previousScopeRef = useRef(scopeKey);
  const syncedScopeRef = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<BusManagementSnapshot>(emptySnapshot);
  const [syncedScope, setSyncedScope] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [syncErrorKind, setSyncErrorKind] = useState<SupabaseReadFailureKind | null>(null);
  const stateVersion = useRef(0);

  useEffect(() => {
    currentScopeRef.current = scopeKey;
    if (previousScopeRef.current === scopeKey) return;

    previousScopeRef.current = scopeKey;
    stateVersion.current += 1;
    syncedScopeRef.current = null;
    setSyncedScope(null);
    setSnapshot(emptySnapshot);
    setSyncErrorMessage(null);
    setSyncErrorKind(null);
    setSyncState(userId ? 'loading' : 'ready');
  }, [scopeKey, userId]);

  const refresh = useCallback(async () => {
    if (currentScopeRef.current !== scopeKey) return;
    const requestVersion = ++stateVersion.current;

    if (!userId) {
      setSnapshot(emptySnapshot);
      syncedScopeRef.current = null;
      setSyncedScope(null);
      setSyncErrorMessage(null);
      setSyncErrorKind(null);
      setSyncState('ready');
      return;
    }

    setSyncState((current) =>
      syncedScopeRef.current === scopeKey && current !== 'loading' ? 'refreshing' : 'loading',
    );

    try {
      const { data: trips, error: tripError } = await withSupabaseReadTimeout((signal) =>
        supabase
          .from('trips')
          .select('id, name, created_by_profile_id, created_at, archived_at, bus_setup_deleted_at')
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
          syncedScopeRef.current = scopeKey;
          setSyncedScope(scopeKey);
          setSyncErrorMessage(null);
          setSyncErrorKind(null);
          setSyncState('ready');
        }
        return;
      }

      const [busesResult, participantsResult, rosterResult] = await Promise.all([
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
              'id, trip_id, bus_id, profile_id, assignment_family_id, participant_code, display_name, is_on_bus, created_at, updated_at',
            )
            .eq('trip_id', activeTrip.id)
            .order('display_name')
            .abortSignal(signal),
        ),
        isAdmin
          ? withSupabaseReadTimeout((signal) =>
              supabase.rpc('admin_trip_bus_roster', { p_trip_id: activeTrip.id }).abortSignal(signal),
            )
          : Promise.resolve({ data: [] as AdminTripBusMember[], error: null }),
      ]);

      if (busesResult.error) throw busesResult.error;
      if (participantsResult.error) throw participantsResult.error;
      if (rosterResult.error) throw rosterResult.error;
      if (requestVersion === stateVersion.current) {
        setSnapshot({
          activeTrip,
          buses: busesResult.data ?? [],
          participants: participantsResult.data ?? [],
          roster: rosterResult.data ?? [],
          trips: visibleTrips,
        });
        syncedScopeRef.current = scopeKey;
        setSyncedScope(scopeKey);
        setSyncErrorMessage(null);
        setSyncErrorKind(null);
        setSyncState('ready');
      }
    } catch (error) {
      if (requestVersion === stateVersion.current) {
        syncedScopeRef.current = scopeKey;
        setSyncedScope(scopeKey);
        setSyncErrorMessage(getOriginalErrorMessage(error));
        setSyncErrorKind(getSupabaseReadFailureKind(error));
        setSyncState('error');
      }
    }
  }, [isAdmin, scopeKey, userId]);

  const mutateOwnAssignment = useCallback(async (busId: number, isOnBus?: boolean) => {
    const tripId = snapshot.activeTrip?.id;
    if (!userId || !tripId || currentScopeRef.current !== scopeKey) {
      throw new Error('Active trip not found.');
    }
    const action = () => isOnBus === undefined
      ? supabase.rpc('select_trip_bus', { p_trip_id: tripId, p_bus_id: busId })
      : supabase.rpc('set_trip_bus_presence', { p_trip_id: tripId, p_bus_id: busId, p_is_on_bus: isOnBus });
    let result = await action();
    if (currentScopeRef.current !== scopeKey) return;
    if (result.error && shouldRetryBusStatusAfterSessionRefresh(result.error)) {
      const renewed = await supabase.auth.refreshSession();
      if (currentScopeRef.current !== scopeKey) return;
      if (!renewed.error && renewed.data.session?.user.id === userId) result = await action();
    }
    if (currentScopeRef.current !== scopeKey) return;
    if (result.error) {
      await refresh();
      throw result.error;
    }
    // Invalidate reads begun before this write, and keep the confirmed choice
    // visible even when the following background refresh fails.
    stateVersion.current += 1;
    const saved = result.data;
    if (saved) setSnapshot((current) => current.activeTrip?.id === tripId ? {
      ...current,
      buses: current.buses.map((bus) =>
        bus.id !== saved.bus_id && bus.leader_participant_id === saved.id
          ? { ...bus, leader_participant_id: null } : bus),
      participants: [...current.participants.filter((person) => person.profile_id !== saved.profile_id), saved],
      roster: current.roster.map((person) => person.user_id === userId
        ? { ...person, bus_id: saved.bus_id, participant_id: saved.id, is_on_bus: saved.is_on_bus } : person),
    } : current);
    await refresh();
  }, [refresh, scopeKey, snapshot.activeTrip?.id, userId]);

  const selectBus = useCallback((busId: number) => mutateOwnAssignment(busId), [mutateOwnAssignment]);
  const setBusPresence = useCallback((busId: number, isOnBus: boolean) =>
    mutateOwnAssignment(busId, isOnBus), [mutateOwnAssignment]);

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
      ...(isAdmin ? ['profiles'] : []),
    ]) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => void refresh());
    }
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') void refresh(); });

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
    const onFocus = () => void refresh();
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('focus', onFocus);

    return () => {
      stopped = true;
      clearTimeout(initialRefreshTimeout);
      stateVersion.current += 1;
      if (pollingTimeout) clearTimeout(pollingTimeout);
      appStateSubscription?.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, isAuthLoading, refresh, userId]);

  const visibleSnapshot = syncedScope === scopeKey ? snapshot : emptySnapshot;

  const participants = useMemo(
    () =>
      buildBusParticipantStates(
        visibleSnapshot.participants,
        visibleSnapshot.buses,
        [],
      ),
    [visibleSnapshot.buses, visibleSnapshot.participants],
  );
  const value = useMemo<BusManagementContextValue>(
    () => ({
      activeTrip: visibleSnapshot.activeTrip,
      buses: visibleSnapshot.buses,
      hasSyncError: syncState === 'error',
      isLoading: syncState === 'loading' || syncedScope !== scopeKey,
      isRefreshing: syncState === 'refreshing',
      participants,
      refresh,
      roster: visibleSnapshot.roster,
      selectBus,
      setBusPresence,
      syncErrorMessage,
      syncErrorKind,
      trips: visibleSnapshot.trips,
    }),
    [participants, refresh, scopeKey, selectBus, setBusPresence, syncErrorKind, syncErrorMessage, syncState, syncedScope, visibleSnapshot],
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
