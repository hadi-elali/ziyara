import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/features/auth/supabase';
import { withSupabaseReadTimeout } from '@/features/network/supabase-read';

export const emergencyRestrictionUntilRelease = 'infinity';

function isRestrictionExpiry(value: unknown): value is string {
  return typeof value === 'string' &&
    (value === emergencyRestrictionUntilRelease || Number.isFinite(Date.parse(value)));
}

export function isEmergencySendRestrictedError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'message' in error &&
    error.message === 'EMERGENCY_SEND_RESTRICTED';
}

export function emergencyRestrictionUntil(error: unknown): string | null {
  if (!isEmergencySendRestrictedError(error) || !error || typeof error !== 'object' ||
    !('details' in error) || typeof error.details !== 'string') return null;
  try {
    const details: unknown = JSON.parse(error.details);
    if (typeof details === 'object' && details !== null && 'restricted_until' in details &&
      isRestrictionExpiry(details.restricted_until)) {
      return details.restricted_until;
    }
  } catch { /* The generic restricted notice still explains that no emergency was sent. */ }
  return null;
}

export function useEmergencySendRestriction(userId: string | null) {
  const [status, setStatus] = useState<{ userId: string; until: string | null } | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    const version = ++sequence.current;
    if (!userId) return;
    try {
      const { data, error } = await withSupabaseReadTimeout((signal) =>
        supabase.rpc('get_my_emergency_send_restriction').abortSignal(signal));
      if (error) throw error;
      if (data !== null && !isRestrictionExpiry(data)) {
        throw new Error('Invalid emergency restriction status.');
      }
      if (mounted.current && version === sequence.current) setStatus({ userId, until: data });
    } catch {
      // A failed advisory read must not prevent someone from requesting help.
      // The database insert guard remains authoritative for every submission.
    }
  }, [userId]);

  const acceptRejection = useCallback((error: unknown) => {
    if (!isEmergencySendRestrictedError(error)) return false;
    const until = emergencyRestrictionUntil(error);
    sequence.current += 1;
    if (userId && mounted.current) setStatus({ userId, until });
    void refresh();
    return true;
  }, [refresh, userId]);

  const until = status?.userId === userId ? status?.until ?? null : null;
  useEffect(() => {
    mounted.current = true;
    if (!userId) return () => { mounted.current = false; sequence.current += 1; };
    const initial = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 30_000);
    const onFocus = () => { void refresh(); };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') onFocus();
    });
    if (Platform.OS === 'web') window.addEventListener('focus', onFocus);
    return () => {
      mounted.current = false;
      sequence.current += 1;
      clearTimeout(initial);
      clearInterval(poll);
      subscription.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', onFocus);
    };
  }, [refresh, userId]);

  useEffect(() => {
    if (!until || until === emergencyRestrictionUntilRelease || !userId) return;
    const expiry = setTimeout(() => {
      sequence.current += 1;
      setStatus({ userId, until: null });
    }, Math.max(0, Date.parse(until) - Date.now()));
    return () => clearTimeout(expiry);
  }, [until, userId]);

  return { until, acceptRejection, refresh };
}
