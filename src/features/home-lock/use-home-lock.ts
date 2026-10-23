import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/features/auth/supabase';
import { withSupabaseReadTimeout } from '@/features/network/supabase-read';
import { createPersistentState } from '@/features/storage/persistentState';

const useStoredHomeLock = createPersistentState(
  'ziyara.home-lock.v1',
  false,
  (value) => (typeof value === 'boolean' ? value : undefined),
);

export function useHomeLock() {
  const [locked, setLocked] = useStoredHomeLock();
  const requestSequence = useRef(0);

  useEffect(() => {
    let stopped = false;
    let pollingTimeout: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      if (stopped) return;
      const sequence = ++requestSequence.current;

      try {
        const { data, error } = await withSupabaseReadTimeout((signal) =>
          supabase
            .from('lock_app')
            .select('lock')
            .eq('id', 1)
            .abortSignal(signal)
            .maybeSingle(),
        );

        if (error) throw error;
        if (!stopped && sequence === requestSequence.current) {
          // A missing row or a legacy NULL uses the same false default.
          setLocked(data?.lock === true);
        }
      } catch {
        // Offline/timeout/permission failures retain the last confirmed value.
        // A fresh installation remains usable with the default false.
      }
    };

    void refresh();
    const channel = supabase
      .channel('home-lock')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lock_app' },
        () => void refresh(),
      )
      .subscribe((status) => {
        // Re-read after connecting/reconnecting to cover missed changes.
        if (status === 'SUBSCRIBED') void refresh();
      });

    const schedulePoll = () => {
      if (stopped) return;
      pollingTimeout = setTimeout(() => {
        const isBackground = AppState.currentState === 'background' || AppState.currentState === 'inactive';
        if (isBackground) schedulePoll();
        else void refresh().finally(schedulePoll);
      }, 30_000 + Math.random() * 10_000);
    };
    schedulePoll();

    const onFocus = () => { void refresh(); };
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') onFocus();
    });
    if (Platform.OS === 'web') window.addEventListener('focus', onFocus);

    return () => {
      stopped = true;
      requestSequence.current += 1;
      if (pollingTimeout) clearTimeout(pollingTimeout);
      appStateSubscription.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [setLocked]);

  return locked;
}
