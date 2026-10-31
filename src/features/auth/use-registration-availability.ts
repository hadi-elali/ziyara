import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/features/auth/supabase';
import { withSupabaseReadTimeout } from '@/features/network/supabase-read';

export function useRegistrationAvailability() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [hasError, setHasError] = useState(false);
  const sequence = useRef(0);
  const mounted = useRef(false);

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
    void Promise.resolve().then(() => { if (mounted.current) void refresh(); });
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
      clearInterval(poll);
      subscription.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return { enabled, hasError, refresh };
}
