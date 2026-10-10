import { PostgrestError } from '@supabase/supabase-js';
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

function outboxEntryKey(entry: PendingTripGuidanceStatus) {
  return `${entry.userId}:${entry.guidanceId}:${entry.participantId}:${entry.queuedAt}:${entry.status}`;
}

export function TripGuidanceProvider({ children }: PropsWithChildren) {
  const { isLoading: isAuthLoading, session } = useAuth();
  const userId = session?.user.id ?? null;
  const userIdRef = useRef(userId);
  const previousUserIdRef = useRef(userId);
  const syncedUserIdRef = useRef<string | null>(null);
  const activeGuidanceRef = useRef<TripGuidanceUpdate | null>(null);
  const outboxRef = useRef<PendingTripGuidanceStatus[]>([]);
  const flushInProgressRef = useRef(false);
  const attemptedOutboxEntriesRef = useRef(new Set<string>());
  const statusWritesRef = useRef(new Map<string, Promise<unknown>>());
  const lastQueuedAtRef = useRef(0);
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
      const [tripResult, destinationsResult] = await Promise.all([
        withSupabaseReadTimeout((signal) =>
          supabase
            .from('trips')
            .select('id, name, created_by_profile_id, created_at, archived_at')
            .is('archived_at', null)
            .abortSignal(signal)
            .maybeSingle(),
        ),
        withSupabaseReadTimeout((signal) =>
          supabase
            .from('trip_navigation_destinations')
            .select(
              'id, trip_id, name, details, latitude, longitude, sort_order, created_by_profile_id, created_at, updated_at, archived_at',
            )
            .is('archived_at', null)
            .order('sort_order')
            .order('id')
            .abortSignal(signal),
        ),
      ]);
      if (tripResult.error) throw tripResult.error;
      if (destinationsResult.error) throw destinationsResult.error;
      const activeTrip = tripResult.data;
      const navigationDestinations = destinationsResult.data ?? [];

      if (!activeTrip) {
        if (requestVersion === stateVersion.current) {
          setSnapshot({ ...emptySnapshot, navigationDestinations });
          setNavigationCache({ destinations: navigationDestinations, userId });
          syncedUserIdRef.current = userId;
          setSyncedUserId(userId);
          setSyncErrorMessage(null);
          setSyncErrorKind(null);
          setSyncState('ready');
        }
        return;
      }

      const [participantsResult, guidanceResult] = await Promise.all([
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
      ]);
      if (participantsResult.error) throw participantsResult.error;
      if (guidanceResult.error) throw guidanceResult.error;

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
        setNavigationCache({ destinations: navigationDestinations, userId });

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
      if (!userId || userIdRef.current !== userId) {
        return {
          data: null,
          error: new PostgrestError({
            code: '42501',
            details: '',
            hint: '',
            message: 'Authentication required.',
          }),
        };
      }
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
          if (
            !refreshedSession.error &&
            refreshedSession.data.session?.user.id === userId &&
            userIdRef.current === userId
          ) {
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

  // Manual updates and background retries for one participant share one queue.
  // Keep the acknowledgement/cleanup inside the queue as well as the RPC.
  const runStatusWrite = useCallback(
    <T,>(guidanceId: number, participantId: number, action: () => Promise<T>): Promise<T> => {
      const key = `${userId}:${guidanceId}:${participantId}`;
      const previous = statusWritesRef.current.get(key) ?? Promise.resolve();
      const pending = previous.catch(() => undefined).then(action);
      statusWritesRef.current.set(key, pending);
      const cleanup = () => {
        if (statusWritesRef.current.get(key) === pending) statusWritesRef.current.delete(key);
      };
      void pending.then(cleanup, cleanup);
      return pending;
    },
    [userId],
  );

  const removeOutboxEntry = useCallback(
    (entry: PendingTripGuidanceStatus) => {
      const key = outboxEntryKey(entry);
      setOutbox((current) => {
        const next = current.filter((candidate) => outboxEntryKey(candidate) !== key);
        outboxRef.current = next;
        return next;
      });
      attemptedOutboxEntriesRef.current.delete(key);
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
          if (userIdRef.current !== userId) break;
          const entryKey = outboxEntryKey(entry);
          if (entry.guidanceId !== activeGuidance.id) {
            removeOutboxEntry(entry);
            continue;
          }
          if (!force && attemptedOutboxEntriesRef.current.has(entryKey)) continue;
          attemptedOutboxEntriesRef.current.add(entryKey);

          const failure = await runStatusWrite(entry.guidanceId, entry.participantId, async () => {
            // A manual update may have replaced this entry while it waited.
            if (
              userIdRef.current !== userId ||
              !outboxRef.current.some((candidate) => outboxEntryKey(candidate) === entryKey)
            ) {
              return null;
            }
            const { error } = await submitStatusRpc(entry.guidanceId, entry.participantId, entry.status);
            const kind = error ? getTripGuidanceSubmitFailureKind(error) : null;
            if (!error || kind === 'closed' || kind === 'not_linked') removeOutboxEntry(entry);
            return kind;
          });
          if (failure === 'offline') break;
        }
      } finally {
        flushInProgressRef.current = false;
      }
    },
    [outboxLoaded, removeOutboxEntry, runStatusWrite, submitStatusRpc, userId],
  );

  const retryPending = useCallback(async () => {
    attemptedOutboxEntriesRef.current.clear();
    await flushPending(true);
    if (userIdRef.current === userId) await refresh();
  }, [flushPending, refresh, userId]);

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
    (guidanceId: number, participantId: number, status: TripGuidanceStatus) =>
      runStatusWrite(guidanceId, participantId, async (): Promise<TripGuidanceActionResult> => {
        if (!userId) return { error: null, queued: false };
        const previousPending = outboxRef.current.find(
          (entry) =>
            entry.userId === userId &&
            entry.guidanceId === guidanceId &&
            entry.participantId === participantId,
        );
        const result = await submitStatusRpc(guidanceId, participantId, status);
        if (userIdRef.current !== userId) return { error: result.error, queued: false };

        if (result.error && shouldQueueTripGuidanceStatus(result.error)) {
          // queuedAt is also the persisted revision; it must stay unique even if
          // the clock moves backwards or two updates occur in one millisecond.
          lastQueuedAtRef.current = Math.max(
            Date.now(),
            lastQueuedAtRef.current + 1,
            ...outboxRef.current.map((entry) => (Date.parse(entry.queuedAt) || 0) + 1),
          );
          const pending: PendingTripGuidanceStatus = {
            guidanceId,
            participantId,
            queuedAt: new Date(lastQueuedAtRef.current).toISOString(),
            status,
            userId,
          };
          if (previousPending) attemptedOutboxEntriesRef.current.delete(outboxEntryKey(previousPending));
          attemptedOutboxEntriesRef.current.add(outboxEntryKey(pending));
          setOutbox((current) => {
            const next = [
              ...current.filter(
                (entry) =>
                  entry.userId !== userId ||
                  entry.guidanceId !== guidanceId ||
                  entry.participantId !== participantId,
              ),
              pending,
            ];
            outboxRef.current = next;
            return next;
          });
          return { error: null, queued: true };
        }

        if (result.error) {
          await refresh();
          return { error: result.error, queued: false };
        }

        if (previousPending) removeOutboxEntry(previousPending);
        if (result.data) {
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
      }),
    [refresh, removeOutboxEntry, runStatusWrite, setOutbox, submitStatusRpc, userId],
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
