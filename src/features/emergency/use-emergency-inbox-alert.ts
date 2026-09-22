import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { AppRole } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import {
  getOriginalErrorMessage,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';

const fallbackRefreshIntervalMs = 60_000;
const fallbackRefreshJitterMs = 30_000;

export function isEmergencyInboxRole(role: AppRole | null | undefined) {
  return role === 'admin' || role === 'medical_staff' || role === 'organization_team';
}

export function useEmergencyInboxAlert() {
  const { isLoading: isAuthLoading, profile, session } = useAuth();
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [syncedScope, setSyncedScope] = useState<string | null>(null);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const refreshSequence = useRef(0);
  const syncedScopeRef = useRef<string | null>(null);
  const userId = session?.user.id ?? null;
  const scope = userId && isEmergencyInboxRole(profile?.role) ? userId : null;

  const refresh = useCallback(async () => {
    const requestSequence = ++refreshSequence.current;

    if (!scope) {
      setHasUnreadMessages(false);
      syncedScopeRef.current = null;
      setSyncedScope(null);
      setSyncErrorMessage(null);
      return;
    }

    try {
      const { data, error } = await withSupabaseReadTimeout((signal) =>
        supabase
          .from('emergency_request_recipients')
          .select('request_id')
          .is('read_at', null)
          .limit(1)
          .abortSignal(signal),
      );

      if (error) throw error;

      if (requestSequence === refreshSequence.current) {
        setHasUnreadMessages((data?.length ?? 0) > 0);
        syncedScopeRef.current = scope;
        setSyncedScope(scope);
        setSyncErrorMessage(null);
      }
    } catch (error) {
      if (requestSequence === refreshSequence.current) {
        if (syncedScopeRef.current !== scope) setHasUnreadMessages(false);
        syncedScopeRef.current = scope;
        setSyncedScope(scope);
        setSyncErrorMessage(getOriginalErrorMessage(error));
      }
    }
  }, [scope]);

  useEffect(() => {
    if (isAuthLoading) return;

    const initialRefreshTimeout = setTimeout(() => void refresh(), 0);
    if (!scope) return () => clearTimeout(initialRefreshTimeout);

    const channel = supabase
      .channel(`emergency-inbox-alert:${scope}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emergency_requests' },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emergency_request_recipients' },
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
      refreshSequence.current += 1;
      if (pollingTimeout) clearTimeout(pollingTimeout);
      appStateSubscription?.remove();
      void supabase.removeChannel(channel);
    };
  }, [isAuthLoading, refresh, scope]);

  return {
    hasSyncError: syncedScope === scope && syncErrorMessage !== null,
    hasUnreadMessages: syncedScope === scope && hasUnreadMessages,
    refresh,
    syncErrorMessage,
  };
}
