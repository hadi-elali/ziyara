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
  Trip,
  TripGuidanceResponse,
  TripGuidanceStatus,
  TripGuidanceUpdate,
  TripNavigationDestination,
  TripParticipant,
} from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import {
  getOriginalErrorMessage,
  getSupabaseReadFailureKind,
  type SupabaseReadFailureKind,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';
import { useTripGuidanceOutbox } from '@/features/trip-guidance/trip-guidance-outbox';
import { useTripNavigationCache } from '@/features/trip-guidance/trip-navigation-cache';
import {
  buildTripGuidanceParticipantStates,
  getTripGuidanceSubmitFailureKind,
  shouldQueueTripGuidanceStatus,
  type PendingTripGuidanceStatus,
  type TripGuidanceParticipantState,
} from '@/features/trip-guidance/trip-guidance-state';

type TripGuidanceActionResult = {
  error: PostgrestError | null;
  queued: boolean;
};

type TripGuidanceContextValue = {
  acknowledgeProblem: (responseId: number) => Promise<{ error: PostgrestError | null }>;
  activeGuidance: TripGuidanceUpdate | null;
  activeTrip: Trip | null;
  hasSyncError: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  navigationDestinations: TripNavigationDestination[];
  participants: TripGuidanceParticipantState[];
  pendingCount: number;
  refresh: () => Promise<void>;
  retryPending: () => Promise<void>;
  setStatus: (
    guidanceId: number,
    participantId: number,
    status: TripGuidanceStatus,
  ) => Promise<TripGuidanceActionResult>;
  syncErrorMessage: string | null;
  syncErrorKind: SupabaseReadFailureKind | null;
};

type Snapshot = {
  activeGuidance: TripGuidanceUpdate | null;
  activeTrip: Trip | null;
  navigationDestinations: TripNavigationDestination[];
  participants: TripParticipant[];
  responses: TripGuidanceResponse[];
};

type SyncState = 'error' | 'loading' | 'ready' | 'refreshing';

const TripGuidanceContext = createContext<TripGuidanceContextValue | null>(null);
const emptySnapshot: Snapshot = {
  activeGuidance: null,
  activeTrip: null,
  navigationDestinations: [],
  participants: [],
  responses: [],
};
const fallbackRefreshIntervalMs = 60_000;
const fallbackRefreshJitterMs = 30_000;

export function TripGuidanceProvider({ children }: PropsWithChildren) {
  const { isLoading: isAuthLoading, session } = useAuth();
  const userId = session?.user.id ?? null;
  const userIdRef = useRef(userId);
  const previousUserIdRef = useRef(userId);
  const syncedUserIdRef = useRef<string | null>(null);
  const activeGuidanceRef = useRef<TripGuidanceUpdate | null>(null);
  const navigationDestinationsRef = useRef<TripNavigationDestination[]>([]);
  const outboxRef = useRef<PendingTripGuidanceStatus[]>([]);
  const flushInProgressRef = useRef(false);
  const attemptedOutboxEntriesRef = useRef(new Set<string>());
  const [outbox, setOutbox, outboxLoaded] = useTripGuidanceOutbox();
  const [navigationCache, setNavigationCache] = useTripNavigationCache();
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [syncErrorKind, setSyncErrorKind] = useState<SupabaseReadFailureKind | null>(null);
  const stateVersion = useRef(0);
  const cachedNavigationDestinations =
    userId && navigationCache?.userId === userId
      ? navigationCache.destinations
      : emptySnapshot.navigationDestinations;
  const visibleNavigationDestinations =
    syncedUserId === userId && syncState !== 'error'
      ? snapshot.navigationDestinations
      : cachedNavigationDestinations;

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    activeGuidanceRef.current = snapshot.activeGuidance;
  }, [snapshot.activeGuidance]);

  useEffect(() => {
    navigationDestinationsRef.current = visibleNavigationDestinations;
  }, [visibleNavigationDestinations]);

  useEffect(() => {
    outboxRef.current = outbox;
  }, [outbox]);

  useEffect(() => {
    if (previousUserIdRef.current === userId) return;
    previousUserIdRef.current = userId;
    stateVersion.current += 1;
    syncedUserIdRef.current = null;
    setSnapshot(emptySnapshot);
    setSyncedUserId(null);
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
      const { data: activeTrip, error: tripError } = await withSupabaseReadTimeout((signal) =>
        supabase
          .from('trips')
          .select('id, name, created_by_profile_id, created_at, archived_at')
          .is('archived_at', null)
          .abortSignal(signal)
          .maybeSingle(),
      );
      if (tripError) throw tripError;

      if (!activeTrip) {
        if (requestVersion === stateVersion.current) {
          setSnapshot(emptySnapshot);
          setNavigationCache(null);
          syncedUserIdRef.current = userId;
          setSyncedUserId(userId);
          setSyncErrorMessage(null);
          setSyncErrorKind(null);
          setSyncState('ready');
        }
        return;
      }

      const [participantsResult, guidanceResult, destinationsResult] = await Promise.all([
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
            .from('trip_guidance_updates')
            .select(
              'id, trip_id, current_place_name, current_place_slug, current_latitude, current_longitude, next_program_name, departure_at, meeting_point, meeting_latitude, meeting_longitude, relevant_gate, distance_hint, description, acts, published_by_profile_id, published_at, updated_at, closed_at',
            )
            .eq('trip_id', activeTrip.id)
            .is('closed_at', null)
            .abortSignal(signal)
            .maybeSingle(),
        ),
        withSupabaseReadTimeout((signal) =>
          supabase
            .from('trip_navigation_destinations')
            .select(
              'id, trip_id, name, details, latitude, longitude, sort_order, created_by_profile_id, created_at, updated_at, archived_at',
            )
            .eq('trip_id', activeTrip.id)
            .is('archived_at', null)
            .order('sort_order')
            .order('id')
            .abortSignal(signal),
        ),
      ]);
      if (participantsResult.error) throw participantsResult.error;
      if (guidanceResult.error) throw guidanceResult.error;
      if (destinationsResult.error && destinationsResult.error.code !== 'PGRST205') {
        throw destinationsResult.error;
      }

      let responses: TripGuidanceResponse[] = [];
      const activeGuidance = guidanceResult.data;
      if (activeGuidance) {
        const responseResult = await withSupabaseReadTimeout((signal) =>
          supabase
            .from('trip_guidance_responses')
            .select(
              'id, trip_id, guidance_id, participant_id, status, acknowledged_by_profile_id, acknowledged_by_display_name, acknowledged_at, created_at, updated_at',
            )
            .eq('guidance_id', activeGuidance.id)
            .abortSignal(signal),
        );
        if (responseResult.error) throw responseResult.error;
        responses = responseResult.data ?? [];
      }

      if (requestVersion === stateVersion.current) {
        const navigationDestinations = destinationsResult.error
          ? navigationDestinationsRef.current
          : (destinationsResult.data ?? []);

        if (!destinationsResult.error) {
          setNavigationCache({
            destinations: navigationDestinations,
            tripId: activeTrip.id,
            userId,
          });
        }

        setSnapshot({
          activeGuidance,
          activeTrip,
          navigationDestinations,
          participants: participantsResult.data ?? [],
          responses,
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
  }, [setNavigationCache, userId]);

  const submitStatusRpc = useCallback(
    async (guidanceId: number, participantId: number, status: TripGuidanceStatus) => {
      const submit = () =>
        supabase.rpc('respond_to_trip_guidance', {
          p_guidance_id: guidanceId,
          p_participant_id: participantId,
          p_status: status,
        });
      let result = await submit();

      if (
        result.error &&
        getTripGuidanceSubmitFailureKind(result.error) === 'auth' &&
        userIdRef.current === userId
      ) {
        try {
          const refreshedSession = await supabase.auth.refreshSession();
          if (!refreshedSession.error && refreshedSession.data.session?.user.id === userId) {
            result = await submit();
          }
        } catch {
          // Return the original authentication failure below.
        }
      }

      return result;
    },
    [userId],
  );

  const removeOutboxEntry = useCallback(
    (entry: Pick<PendingTripGuidanceStatus, 'guidanceId' | 'participantId' | 'userId'>) => {
      setOutbox((current) =>
        current.filter(
          (candidate) =>
            candidate.userId !== entry.userId ||
            candidate.guidanceId !== entry.guidanceId ||
            candidate.participantId !== entry.participantId,
        ),
      );
    },
    [setOutbox],
  );

  const flushPending = useCallback(
    async (force: boolean) => {
      if (!userId || !outboxLoaded || flushInProgressRef.current) return;
      const activeGuidance = activeGuidanceRef.current;
      if (!activeGuidance) return;

      flushInProgressRef.current = true;
      try {
        const currentEntries = outboxRef.current.filter((entry) => entry.userId === userId);
        for (const entry of currentEntries) {
          const entryKey = `${entry.userId}:${entry.guidanceId}:${entry.participantId}:${entry.queuedAt}`;
          if (entry.guidanceId !== activeGuidance.id) {
            removeOutboxEntry(entry);
            continue;
          }
          if (!force && attemptedOutboxEntriesRef.current.has(entryKey)) continue;
          attemptedOutboxEntriesRef.current.add(entryKey);

          const { error } = await submitStatusRpc(
            entry.guidanceId,
            entry.participantId,
            entry.status,
          );
          if (!error) {
            removeOutboxEntry(entry);
            continue;
          }

          const kind = getTripGuidanceSubmitFailureKind(error);
          if (kind === 'closed' || kind === 'not_linked') {
            removeOutboxEntry(entry);
          }
          if (kind === 'offline') break;
        }
      } finally {
        flushInProgressRef.current = false;
      }
    },
    [outboxLoaded, removeOutboxEntry, submitStatusRpc, userId],
  );

  const retryPending = useCallback(async () => {
    attemptedOutboxEntriesRef.current.clear();
    await flushPending(true);
    await refresh();
  }, [flushPending, refresh]);

  useEffect(() => {
    if (!outboxLoaded || !snapshot.activeGuidance || !userId) return;
    void flushPending(false);
  }, [flushPending, outbox, outboxLoaded, snapshot.activeGuidance, userId]);

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
    for (const table of [
      'trips',
      'trip_participants',
      'trip_guidance_updates',
      'trip_guidance_responses',
      'trip_navigation_destinations',
    ]) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => void refresh());
    }
    channel.subscribe();

    let pollingTimeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const scheduleFallbackRefresh = () => {
      if (stopped) return;
      const delay = fallbackRefreshIntervalMs + Math.random() * fallbackRefreshJitterMs;
      pollingTimeout = setTimeout(
        () => void retryPending().finally(scheduleFallbackRefresh),
        delay,
      );
    };
    scheduleFallbackRefresh();

    const appStateSubscription =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') void retryPending();
          });

    return () => {
      stopped = true;
      clearTimeout(initialRefreshTimeout);
      if (pollingTimeout) clearTimeout(pollingTimeout);
      appStateSubscription?.remove();
      stateVersion.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [isAuthLoading, refresh, retryPending, userId]);

  const setStatus = useCallback(
    async (guidanceId: number, participantId: number, status: TripGuidanceStatus) => {
      if (!userId) return { error: null, queued: false };
      const result = await submitStatusRpc(guidanceId, participantId, status);

      if (result.error && shouldQueueTripGuidanceStatus(result.error)) {
        const pending: PendingTripGuidanceStatus = {
          guidanceId,
          participantId,
          queuedAt: new Date().toISOString(),
          status,
          userId,
        };
        attemptedOutboxEntriesRef.current.add(
          `${pending.userId}:${pending.guidanceId}:${pending.participantId}:${pending.queuedAt}`,
        );
        setOutbox((current) => [
          ...current.filter(
            (entry) =>
              entry.userId !== userId ||
              entry.guidanceId !== guidanceId ||
              entry.participantId !== participantId,
          ),
          pending,
        ]);
        return { error: null, queued: true };
      }

      if (result.error) {
        await refresh();
        return { error: result.error, queued: false };
      }

      removeOutboxEntry({ guidanceId, participantId, userId });
      if (result.data && userIdRef.current === userId) {
        stateVersion.current += 1;
        setSnapshot((current) => ({
          ...current,
          responses: [
            ...current.responses.filter(
              (response) => response.participant_id !== participantId,
            ),
            result.data,
          ],
        }));
        setSyncErrorMessage(null);
        setSyncErrorKind(null);
        setSyncState('ready');
      }
      await refresh();
      return { error: null, queued: false };
    },
    [refresh, removeOutboxEntry, setOutbox, submitStatusRpc, userId],
  );

  const acknowledgeProblem = useCallback(
    async (responseId: number) => {
      const { data, error } = await supabase.rpc('admin_acknowledge_trip_guidance_problem', {
        p_response_id: responseId,
      });
      if (!error && data) {
        stateVersion.current += 1;
        setSnapshot((current) => ({
          ...current,
          responses: current.responses.map((response) =>
            response.id === responseId ? data : response,
          ),
        }));
      }
      await refresh();
      return { error };
    },
    [refresh],
  );

  const applicableOutbox = useMemo(
    () =>
      outbox.filter(
        (entry) =>
          entry.userId === userId && entry.guidanceId === snapshot.activeGuidance?.id,
      ),
    [outbox, snapshot.activeGuidance?.id, userId],
  );
  const participants = useMemo(
    () =>
      buildTripGuidanceParticipantStates(
        snapshot.participants,
        snapshot.responses,
        applicableOutbox,
      ),
    [applicableOutbox, snapshot.participants, snapshot.responses],
  );
  const value = useMemo<TripGuidanceContextValue>(
    () => ({
      acknowledgeProblem,
      activeGuidance: snapshot.activeGuidance,
      activeTrip: snapshot.activeTrip,
      hasSyncError: syncState === 'error',
      isLoading: syncState === 'loading' || syncedUserId !== userId,
      isRefreshing: syncState === 'refreshing',
      navigationDestinations: visibleNavigationDestinations,
      participants,
      pendingCount: applicableOutbox.length,
      refresh,
      retryPending,
      setStatus,
      syncErrorMessage,
      syncErrorKind,
    }),
    [acknowledgeProblem, applicableOutbox.length, participants, refresh, retryPending, setStatus, snapshot.activeGuidance, snapshot.activeTrip, syncErrorKind, syncErrorMessage, syncState, syncedUserId, userId, visibleNavigationDestinations],
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
