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
  OrganizationGroup,
  OrganizationGroupLocationRequest,
  OrganizationGroupMember,
} from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import {
  getOriginalErrorMessage,
  getSupabaseReadFailureKind,
  type SupabaseReadFailureKind,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';
import {
  buildTripGroupStates,
  shouldRetryTripGroupMutationAfterSessionRefresh,
  type TripGroupState,
} from '@/features/trip-groups/trip-group-state';

type SyncState = 'error' | 'loading' | 'ready' | 'refreshing';

type TripGroupActionResult = {
  error: PostgrestError | null;
};

export type SaveTripGroupInput = {
  groupId: number | null;
  leaderUserIds: string[];
  memberUserIds: string[];
  familyIds: number[];
  name: string;
};

export type TripGroupLocationResponseInput = {
  accuracyMeters: number | null;
  latitude: number | null;
  longitude: number | null;
  requestId: number;
  share: boolean;
};

type TripGroupContextValue = {
  deleteGroup: (groupId: number) => Promise<TripGroupActionResult>;
  groups: TripGroupState[];
  hasSyncError: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
  requestLeaderLocation: (
    groupId: number,
    leaderUserId: string,
  ) => Promise<TripGroupActionResult>;
  respondToLocationRequest: (
    input: TripGroupLocationResponseInput,
  ) => Promise<TripGroupActionResult>;
  saveGroup: (input: SaveTripGroupInput) => Promise<TripGroupActionResult>;
  syncErrorMessage: string | null;
  syncErrorKind: SupabaseReadFailureKind | null;
};

type TripGroupSnapshot = {
  groups: OrganizationGroup[];
  locationRequests: OrganizationGroupLocationRequest[];
  members: OrganizationGroupMember[];
};

const emptySnapshot: TripGroupSnapshot = {
  groups: [],
  locationRequests: [],
  members: [],
};
const fallbackRefreshIntervalMs = 60_000;
const fallbackRefreshJitterMs = 30_000;
const TripGroupContext = createContext<TripGroupContextValue | null>(null);

export function TripGroupProvider({ children }: PropsWithChildren) {
  const { isLoading: isAuthLoading, isAdmin, session } = useAuth();
  const userId = session?.user.id ?? null;
  const userIdRef = useRef(userId);
  const [snapshot, setSnapshot] = useState<TripGroupSnapshot>(emptySnapshot);
  const [syncedScope, setSyncedScope] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [syncErrorKind, setSyncErrorKind] = useState<
    SupabaseReadFailureKind | null
  >(null);
  const stateVersion = useRef(0);
  const syncedScopeRef = useRef<string | null>(null);
  const scope = userId ? `${userId}:${isAdmin}` : null;

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const refresh = useCallback(async () => {
    const requestVersion = ++stateVersion.current;

    if (!userId) {
      setSnapshot(emptySnapshot);
      syncedScopeRef.current = scope;
      setSyncedScope(scope);
      setSyncErrorMessage(null);
      setSyncErrorKind(null);
      setSyncState('ready');
      return;
    }

    setSyncState((current) =>
      syncedScopeRef.current === scope && current !== 'loading'
        ? 'refreshing'
        : 'loading'
    );

    try {
      const [groupsResult, membersResult, requestsResult] = await Promise.all([
        withSupabaseReadTimeout((signal) =>
          supabase
            .from('organization_groups')
            .select(
              'id, name, created_at, updated_at',
            )
            .order('name')
            .abortSignal(signal)
        ),
        withSupabaseReadTimeout((signal) =>
          supabase.rpc('get_organization_group_members').abortSignal(signal)
        ),
        withSupabaseReadTimeout((signal) =>
          supabase
            .from('organization_group_location_requests')
            .select(
              'id, group_id, leader_user_id, status, requested_at, responded_at, latitude, longitude, accuracy_meters, location_expires_at',
            )
            .abortSignal(signal)
        ),
      ]);

      if (groupsResult.error) throw groupsResult.error;
      if (membersResult.error) throw membersResult.error;
      if (requestsResult.error) throw requestsResult.error;

      if (
        requestVersion === stateVersion.current && userIdRef.current === userId
      ) {
        setSnapshot({
          groups: groupsResult.data ?? [],
          locationRequests: requestsResult.data ?? [],
          members: membersResult.data ?? [],
        });
        syncedScopeRef.current = scope;
        setSyncedScope(scope);
        setSyncErrorMessage(null);
        setSyncErrorKind(null);
        setSyncState('ready');
      }
    } catch (error) {
      if (
        requestVersion === stateVersion.current && userIdRef.current === userId
      ) {
        if (syncedScopeRef.current !== scope) setSnapshot(emptySnapshot);
        syncedScopeRef.current = scope;
        setSyncedScope(scope);
        setSyncErrorMessage(getOriginalErrorMessage(error));
        setSyncErrorKind(getSupabaseReadFailureKind(error));
        setSyncState('error');
      }
    }
  }, [scope, userId]);

  useEffect(() => {
    if (isAuthLoading) return;

    const initialRefreshTimeout = setTimeout(() => void refresh(), 0);
    if (!scope) {
      return () => clearTimeout(initialRefreshTimeout);
    }

    const channel = supabase.channel(`trip-groups:${scope}`);
    for (
      const table of [
        'organization_groups',
        'organization_group_members',
        'organization_group_location_requests',
      ]
    ) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => void refresh(),
      );
    }
    channel.subscribe();

    let pollingTimeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const scheduleFallbackRefresh = () => {
      if (stopped) return;
      const delay = fallbackRefreshIntervalMs +
        Math.random() * fallbackRefreshJitterMs;
      pollingTimeout = setTimeout(
        () => void refresh().finally(scheduleFallbackRefresh),
        delay,
      );
    };
    scheduleFallbackRefresh();

    const appStateSubscription = Platform.OS === 'web'
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
  }, [isAuthLoading, refresh, scope]);

  useEffect(() => {
    const deadlines = snapshot.locationRequests.flatMap((request) =>
      request.location_expires_at
        ? [Date.parse(request.location_expires_at)]
        : []
    );
    if (deadlines.length === 0) return;
    const timeout = setTimeout(() =>
      setSnapshot((current) => ({
        ...current,
        locationRequests: current.locationRequests.filter((request) =>
          !request.location_expires_at ||
          Date.parse(request.location_expires_at) > Date.now()
        ),
      })), Math.max(0, Math.min(...deadlines) - Date.now()));
    return () => clearTimeout(timeout);
  }, [snapshot.locationRequests]);

  const runMutation = useCallback(
    async (action: () => PromiseLike<{ error: PostgrestError | null }>) => {
      let result = await action();

      if (
        result.error &&
        shouldRetryTripGroupMutationAfterSessionRefresh(result.error) &&
        userIdRef.current === userId
      ) {
        try {
          const refreshedSession = await supabase.auth.refreshSession();
          if (
            !refreshedSession.error &&
            refreshedSession.data.session?.user.id === userId &&
            userIdRef.current === userId
          ) {
            result = await action();
          }
        } catch {
          // Return the original RPC error below if the session cannot be refreshed.
        }
      }

      await refresh();
      return { error: result.error };
    },
    [refresh, userId],
  );

  const saveGroup = useCallback(
    (input: SaveTripGroupInput) => {
      return runMutation(() =>
        supabase.rpc('admin_save_organization_group', {
          p_group_id: input.groupId,
          p_leader_user_ids: input.leaderUserIds,
          p_member_user_ids: input.memberUserIds,
          p_family_ids: input.familyIds,
          p_name: input.name,
        })
      );
    },
    [runMutation],
  );

  const deleteGroup = useCallback(
    (groupId: number) =>
      runMutation(() =>
        supabase.rpc('admin_delete_organization_group', { p_group_id: groupId })
      ),
    [runMutation],
  );

  const requestLeaderLocation = useCallback(
    (groupId: number, leaderUserId: string) =>
      runMutation(() =>
        supabase.rpc('admin_request_organization_group_location', {
          p_group_id: groupId,
          p_leader_user_id: leaderUserId,
        })
      ),
    [runMutation],
  );

  const respondToLocationRequest = useCallback(
    (input: TripGroupLocationResponseInput) =>
      runMutation(() =>
        supabase.rpc('respond_to_organization_group_location', {
          p_accuracy_meters: input.accuracyMeters,
          p_latitude: input.latitude,
          p_longitude: input.longitude,
          p_request_id: input.requestId,
          p_share: input.share,
        })
      ),
    [runMutation],
  );

  const groups = useMemo(
    () =>
      syncedScope === scope
        ? buildTripGroupStates(
          snapshot.groups,
          snapshot.members,
          snapshot.locationRequests,
          userId,
        )
        : [],
    [userId, scope, snapshot, syncedScope],
  );
  const value = useMemo<TripGroupContextValue>(
    () => ({
      deleteGroup,
      groups,
      hasSyncError: syncedScope === scope && syncState === 'error',
      isLoading: isAuthLoading ||
        (scope !== null && (syncedScope !== scope || syncState === 'loading')),
      isRefreshing: syncState === 'refreshing',
      refresh,
      requestLeaderLocation,
      respondToLocationRequest,
      saveGroup,
      syncErrorMessage,
      syncErrorKind,
    }),
    [
      deleteGroup,
      groups,
      isAuthLoading,
      refresh,
      requestLeaderLocation,
      respondToLocationRequest,
      saveGroup,
      scope,
      syncedScope,
      syncErrorMessage,
      syncErrorKind,
      syncState,
    ],
  );

  return (
    <TripGroupContext.Provider value={value}>
      {children}
    </TripGroupContext.Provider>
  );
}

export function useTripGroups() {
  const context = useContext(TripGroupContext);
  if (!context) {
    throw new Error('useTripGroups must be used inside TripGroupProvider.');
  }
  return context;
}
