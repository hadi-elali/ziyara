import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

import type { WakeUpCall, WakeUpCallRecipient } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import {
  getOriginalErrorMessage,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';

type Snapshot = {
  calls: WakeUpCall[];
  recipients: WakeUpCallRecipient[];
  userId: string | null;
};
type ActionResult = { error: string | null; pushFailed?: boolean };
type WakeUpCallContextValue = {
  call: WakeUpCall | null;
  calls: WakeUpCall[];
  scheduledCalls: WakeUpCall[];
  recipients: WakeUpCallRecipient[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  start: (message: string) => Promise<ActionResult>;
  schedule: (
    message: string,
    scheduledFor: string,
    callId: number | null,
  ) => Promise<ActionResult>;
  close: (id: number) => Promise<ActionResult>;
  acknowledge: (id: number) => Promise<ActionResult>;
};
const Context = createContext<WakeUpCallContextValue | null>(null);
const empty: Snapshot = { calls: [], recipients: [], userId: null };

export function WakeUpCallProvider({ children }: PropsWithChildren) {
  const { session, isLoading: authLoading, isAdmin } = useAuth();
  const userId = session?.user.id ?? null;
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++version.current;
    if (!userId) {
      setSnapshot(empty);
      setError(null);
      setLoading(false);
      return;
    }
    try {
      const result = await withSupabaseReadTimeout((signal) =>
        supabase.from('wake_up_calls').select('*').is('closed_at', null)
          .order('scheduled_for', { ascending: false }).abortSignal(signal)
      );
      if (result.error) throw result.error;
      const activeIds = (result.data ?? []).filter((call) =>
        call.activated_at !== null
      ).map((call) => call.id);
      const recipients: WakeUpCallRecipient[] = [];
      if (activeIds.length) {
        for (let from = 0;; from += 1000) {
          const page = await withSupabaseReadTimeout((signal) =>
            supabase.from('wake_up_call_recipients').select('*')
              .in('call_id', activeIds).order('call_id').order('user_id').range(
                from,
                from + 999,
              ).abortSignal(signal)
          );
          if (page.error) throw page.error;
          recipients.push(...page.data);
          if (page.data.length < 1000) break;
        }
      }
      if (version.current !== current) return;
      setSnapshot({
        calls: result.data ?? [],
        recipients,
        userId,
      });
      setError(null);
    } catch (cause) {
      if (version.current === current) setError(getOriginalErrorMessage(cause));
    } finally {
      if (version.current === current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    const initial = setTimeout(() => {
      setLoading(true);
      void refresh();
    }, 0);
    if (!userId) {
      return () => {
        clearTimeout(initial);
        version.current += 1;
      };
    }
    const channel = supabase.channel(`wake-up:${userId}:${isAdmin}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'wake_up_calls',
      }, () => void refresh())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'wake_up_call_recipients',
      }, () => void refresh())
      .subscribe();
    const interval = setInterval(
      () => void refresh(),
      60_000 + Math.random() * 15_000,
    );
    const focus = Platform.OS === 'web'
      ? null
      : AppState.addEventListener('change', (state) => {
        if (state === 'active') void refresh();
      });
    const onFocus = () => void refresh();
    if (Platform.OS === 'web') window.addEventListener('focus', onFocus);
    return () => {
      version.current += 1;
      clearTimeout(initial);
      clearInterval(interval);
      focus?.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [authLoading, isAdmin, refresh, userId]);

  const start = async (message: string): Promise<ActionResult> => {
    try {
      const result = await supabase.rpc('admin_start_wake_up_call', {
        p_message: message.trim(),
      });
      if (result.error) throw result.error;
      await refresh();
      try {
        const dispatch = await supabase.functions.invoke(
          'dispatch-wake-up-call',
          { body: { callId: result.data.id } },
        );
        return {
          error: null,
          pushFailed: Boolean(dispatch.error || dispatch.data?.failed > 0),
        };
      } catch {
        return { error: null, pushFailed: true };
      }
    } catch (cause) {
      await refresh();
      return { error: getOriginalErrorMessage(cause) };
    }
  };
  const mutate = async (
    action: () => PromiseLike<{ error: unknown }>,
  ): Promise<ActionResult> => {
    try {
      const result = await action();
      if (result.error) throw result.error;
      await refresh();
      return { error: null };
    } catch (cause) {
      await refresh();
      return { error: getOriginalErrorMessage(cause) };
    }
  };
  const visible = snapshot.userId === userId ? snapshot : empty;
  return (
    <Context.Provider
      value={{
        call: visible.calls.find((call) => call.activated_at !== null) ?? null,
        calls: visible.calls.filter((call) => call.activated_at !== null),
        scheduledCalls: isAdmin
          ? visible.calls.filter((call) => call.activated_at === null).sort((
            a,
            b,
          ) => a.scheduled_for.localeCompare(b.scheduled_for))
          : [],
        recipients: visible.recipients,
        error,
        isLoading: authLoading || loading,
        refresh,
        start,
        schedule: (message, scheduledFor, callId) =>
          mutate(() =>
            supabase.rpc('admin_schedule_wake_up_call', {
              p_message: message.trim(),
              p_scheduled_for: scheduledFor,
              p_call_id: callId,
            })
          ),
        close: (id) =>
          mutate(() =>
            supabase.rpc('admin_close_wake_up_call', { p_call_id: id })
          ),
        acknowledge: (id) =>
          mutate(() =>
            supabase.rpc('acknowledge_wake_up_call', { p_call_id: id })
          ),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useWakeUpCall() {
  const context = useContext(Context);
  if (!context) {
    throw new Error('useWakeUpCall must be used inside WakeUpCallProvider.');
  }
  return context;
}
