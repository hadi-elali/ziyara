import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/features/auth/supabase';
import { withSupabaseReadTimeout } from '@/features/network/supabase-read';

export function useRegistrationAvailability({ realtime = false } = {}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [hasError, setHasError] = useState(false);
  const sequence = useRef(0);
  const mounted = useRef(false);
  const channelId = useId();

  const refresh = useCallback(async (): Promise<boolean | null> => {
    const request = ++sequence.current;
    try {
      const { data, error } = await withSupabaseReadTimeout((signal) =>
        supabase.rpc('get_registration_enabled').abortSignal(signal),
      );
      if (error) throw error;
      if (typeof data !== 'boolean') throw new Error('Invalid registration setting.');
      if (mounted.current && request === sequence.current) {
        setEnabled(data);
        setHasError(false);
      }
      return data;
    } catch {
      if (mounted.current && request === sequence.current) {
        setEnabled(null);
        setHasError(true);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const onChange = () => { if (active) void refresh(); };
    const isVisible = () => Platform.OS === 'web'
      ? typeof document !== 'undefined' && document.visibilityState === 'visible'
      : AppState.currentState === 'active';
    void Promise.resolve().then(onChange);

    // Realtime needs admin-only SELECT permission. Public auth screens keep
    // using the Boolean getter without opening an unauthorized subscription.
    const channel = realtime ? supabase
      .channel(`registration-settings:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_settings' }, onChange)
      .subscribe((status) => {
        // Also reconcile changes missed while joining or reconnecting.
        if (status === 'SUBSCRIBED') onChange();
      }) : null;
    const poll = setInterval(() => {
      if (isVisible()) onChange();
    }, 30_000);
    const onVisible = () => { if (isVisible()) onChange(); };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') onChange();
    });
    if (Platform.OS === 'web') {
      window.addEventListener('focus', onChange);
      document.addEventListener('visibilitychange', onVisible);
    }

    return () => {
      active = false;
      mounted.current = false;
      sequence.current += 1;
      clearInterval(poll);
      subscription.remove();
      if (channel) void supabase.removeChannel(channel);
      if (Platform.OS === 'web') {
        window.removeEventListener('focus', onChange);
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, [channelId, realtime, refresh]);

  return { enabled, hasError, refresh };
}
