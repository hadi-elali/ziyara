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

import type {
  BusBoarding,
  BusBoardingEscalation,
  BusBoardingResponse,
  BusBoardingStatus,
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

type BusManagementActionResult = {
  error: PostgrestError | null;
};

type SyncState = 'error' | 'loading' | 'ready' | 'refreshing';

type BusManagementContextValue = {
  activeBoarding: BusBoarding | null;
  activeTrip: Trip | null;
  buses: TripBus[];
  hasSyncError: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  participants: BusParticipantState[];
  refresh: () => Promise<void>;
  setStatus: (
    boardingId: number,
    participantId: number,
    status: BusBoardingStatus,
  ) => Promise<BusManagementActionResult>;
  syncErrorMessage: string | null;
  syncErrorKind: SupabaseReadFailureKind | null;
  trips: Trip[];
};

const BusManagementContext = createContext<BusManagementContextValue | null>(null);
const fallbackRefreshIntervalMs = 60_000;
const fallbackRefreshJitterMs = 30_000;

type BusManagementSnapshot = {
  activeBoarding: BusBoarding | null;
  activeTrip: Trip | null;
  buses: TripBus[];
  escalations: BusBoardingEscalation[];
  participants: TripParticipant[];
  responses: BusBoardingResponse[];
  trips: Trip[];
};

const emptySnapshot: BusManagementSnapshot = {
  activeBoarding: null,
  activeTrip: null,
  buses: [],
  escalations: [],
  participants: [],
  responses: [],
  trips: [],
};

export function BusManagementProvider({ children }: PropsWithChildren) {
  const { isLoading: isAuthLoading, session } = useAuth();
  const userId = session?.user.id ?? null;
  const userIdRef = useRef(userId);
  const previousUserIdRef = useRef(userId);
  const syncedUserIdRef = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<BusManagementSnapshot>(emptySnapshot);
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [syncErrorKind, setSyncErrorKind] = useState<SupabaseReadFailureKind | null>(null);
  const stateVersion = useRef(0);
  const latestMutationVersion = useRef(0);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (previousUserIdRef.current === userId) return;

    previousUserIdRef.current = userId;
    stateVersion.current += 1;
    latestMutationVersion.current = stateVersion.current;
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

      const [busesResult, participantsResult, boardingResult] = await Promise.all([
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
        withSupabaseReadTimeout((signal) =>
          supabase
            .from('bus_boardings')
            .select(
              'id, trip_id, title, departure_at, reminder_interval_minutes, urgent_before_minutes, created_by_profile_id, opened_at, closed_at',
            )
            .eq('trip_id', activeTrip.id)
            .is('closed_at', null)
            .abortSignal(signal)
            .maybeSingle(),
        ),
      ]);

      if (busesResult.error) throw busesResult.error;
      if (participantsResult.error) throw participantsResult.error;
      if (boardingResult.error) throw boardingResult.error;

      let responses: BusBoardingResponse[] = [];
      let escalations: BusBoardingEscalation[] = [];

      if (boardingResult.data) {
        const boardingId = boardingResult.data.id;
        const [responseResult, escalationResult] = await Promise.all([
          withSupabaseReadTimeout((signal) =>
            supabase
              .from('bus_boarding_responses')
              .select(
                'id, trip_id, boarding_id, participant_id, status, updated_by_profile_id, created_at, updated_at',
              )
              .eq('boarding_id', boardingId)
              .abortSignal(signal),
          ),
          withSupabaseReadTimeout((signal) =>
            supabase
              .from('bus_boarding_escalations')
              .select(
                'id, trip_id, boarding_id, participant_id, escalated_by_profile_id, escalated_by_display_name, escalated_at',
              )
              .eq('boarding_id', boardingId)
              .abortSignal(signal),
          ),
        ]);

        if (responseResult.error) throw responseResult.error;
        if (escalationResult.error) throw escalationResult.error;
        responses = responseResult.data ?? [];
        escalations = escalationResult.data ?? [];
      }

      if (requestVersion === stateVersion.current) {
        setSnapshot({
          activeBoarding: boardingResult.data,
          activeTrip,
          buses: busesResult.data ?? [],
          escalations,
          participants: participantsResult.data ?? [],
          responses,
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
        latestMutationVersion.current = ++stateVersion.current;
      };
    }

    const channel = supabase.channel(`bus-management-state:${userId}`);
    for (const table of [
      'trips',
      'trip_buses',
      'trip_participants',
      'bus_boardings',
      'bus_boarding_responses',
      'bus_boarding_escalations',
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
      latestMutationVersion.current = ++stateVersion.current;
      if (pollingTimeout) clearTimeout(pollingTimeout);
      appStateSubscription?.remove();
      void supabase.removeChannel(channel);
    };
  }, [isAuthLoading, refresh, userId]);

  const setStatus = useCallback(
    async (boardingId: number, participantId: number, status: BusBoardingStatus) => {
      const mutationVersion = ++stateVersion.current;
      latestMutationVersion.current = mutationVersion;
      const submitStatus = () =>
        supabase.rpc('respond_to_bus_boarding', {
          p_boarding_id: boardingId,
          p_participant_id: participantId,
          p_status: status,
        });
      let result = await submitStatus();

      if (
        result.error &&
        shouldRetryBusStatusAfterSessionRefresh(result.error) &&
        userIdRef.current === userId
      ) {
        try {
          const refreshedSession = await supabase.auth.refreshSession();

          if (
            !refreshedSession.error &&
            refreshedSession.data.session?.user.id === userId &&
            mutationVersion === latestMutationVersion.current
          ) {
            result = await submitStatus();
          }
        } catch {
          // Preserve the original RPC error so the UI can explain the failed save.
        }
      }

      const { data, error } = result;

      if (error && mutationVersion === latestMutationVersion.current) {
        setSyncState((current) => (current === 'refreshing' ? 'ready' : current));
        await refresh();
      }

      if (!error && data && userIdRef.current === userId) {
        if (mutationVersion === latestMutationVersion.current) {
          stateVersion.current += 1;
          setSnapshot((current) => ({
            ...current,
            responses: [
              ...current.responses.filter(
                (response) => response.participant_id !== participantId,
              ),
              data,
            ],
          }));
          setSyncErrorMessage(null);
          setSyncErrorKind(null);
          setSyncState('ready');
        }

        await refresh();
      }

      return { error };
    },
    [refresh, userId],
  );

  const participants = useMemo(
    () =>
      buildBusParticipantStates(
        snapshot.participants,
        snapshot.buses,
        snapshot.responses,
        snapshot.escalations,
      ),
    [snapshot.buses, snapshot.escalations, snapshot.participants, snapshot.responses],
  );
  const value = useMemo<BusManagementContextValue>(
    () => ({
      activeBoarding: snapshot.activeBoarding,
      activeTrip: snapshot.activeTrip,
      buses: snapshot.buses,
      hasSyncError: syncState === 'error',
      isLoading: syncState === 'loading' || syncedUserId !== userId,
      isRefreshing: syncState === 'refreshing',
      participants,
      refresh,
      setStatus,
      syncErrorMessage,
      syncErrorKind,
      trips: snapshot.trips,
    }),
    [participants, refresh, setStatus, snapshot.activeBoarding, snapshot.activeTrip, snapshot.buses, snapshot.trips, syncErrorKind, syncErrorMessage, syncState, syncedUserId, userId],
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
