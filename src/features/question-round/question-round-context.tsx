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

import type { QuestionRound } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import {
  getOriginalErrorMessage,
  getSupabaseReadFailureKind,
  type SupabaseReadFailureKind,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';

type QuestionRoundActionResult = {
  error: PostgrestError | null;
};

type QuestionRoundContextValue = {
  activeRound: QuestionRound | null;
  hasSyncError: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  submitQuestion: (roundId: number, question: string) => Promise<QuestionRoundActionResult>;
  syncErrorMessage: string | null;
  syncErrorKind: SupabaseReadFailureKind | null;
};

type SyncState = 'error' | 'loading' | 'ready';

const QuestionRoundContext = createContext<QuestionRoundContextValue | null>(null);
const fallbackRefreshIntervalMs = 120_000;
const fallbackRefreshJitterMs = 30_000;

export function QuestionRoundProvider({ children }: PropsWithChildren) {
  const { isLoading: isAuthLoading, session } = useAuth();
  const [activeRound, setActiveRound] = useState<QuestionRound | null>(null);
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [syncErrorKind, setSyncErrorKind] = useState<SupabaseReadFailureKind | null>(null);
  const refreshSequence = useRef(0);
  const userId = session?.user.id ?? null;

  const refresh = useCallback(async () => {
    const requestSequence = ++refreshSequence.current;

    if (!userId) {
      setActiveRound(null);
      setSyncedUserId(null);
      setSyncErrorMessage(null);
      setSyncErrorKind(null);
      setSyncState('ready');
      return;
    }

    try {
      const { data, error } = await withSupabaseReadTimeout((signal) =>
        supabase
          .from('question_rounds')
          .select('id, created_at, closed_at')
          .is('closed_at', null)
          .abortSignal(signal)
          .maybeSingle(),
      );

      if (error) {
        throw error;
      }

      if (requestSequence === refreshSequence.current) {
        setActiveRound(data);
        setSyncedUserId(userId);
        setSyncErrorMessage(null);
        setSyncErrorKind(null);
        setSyncState('ready');
      }
    } catch (error) {
      if (requestSequence === refreshSequence.current) {
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
      return () => clearTimeout(initialRefreshTimeout);
    }

    const channel = supabase
      .channel(`question-round-state:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'question_rounds' },
        () => void refresh(),
      )
      .subscribe();

    let pollingTimeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const scheduleFallbackRefresh = () => {
      if (stopped) {
        return;
      }

      const delay = fallbackRefreshIntervalMs + Math.random() * fallbackRefreshJitterMs;
      pollingTimeout = setTimeout(() => {
        void refresh().finally(scheduleFallbackRefresh);
      }, delay);
    };
    scheduleFallbackRefresh();
    const appStateSubscription =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') {
              void refresh();
            }
          });

    return () => {
      stopped = true;
      clearTimeout(initialRefreshTimeout);
      if (pollingTimeout) {
        clearTimeout(pollingTimeout);
      }
      appStateSubscription?.remove();
      void supabase.removeChannel(channel);
    };
  }, [isAuthLoading, refresh, userId]);

  const submitQuestion = useCallback(async (roundId: number, question: string) => {
    const { error } = await supabase.rpc('submit_anonymous_question', {
      p_question: question,
      p_round_id: roundId,
    });

    return { error };
  }, []);

  const value = useMemo<QuestionRoundContextValue>(
    () => ({
      activeRound,
      hasSyncError: syncState === 'error',
      isLoading: isAuthLoading || syncedUserId !== userId || syncState === 'loading',
      refresh,
      submitQuestion,
      syncErrorMessage,
      syncErrorKind,
    }),
    [
      activeRound,
      isAuthLoading,
      refresh,
      submitQuestion,
      syncErrorMessage,
      syncErrorKind,
      syncedUserId,
      syncState,
      userId,
    ],
  );

  return <QuestionRoundContext.Provider value={value}>{children}</QuestionRoundContext.Provider>;
}

export function useQuestionRound() {
  const value = useContext(QuestionRoundContext);

  if (!value) {
    throw new Error('useQuestionRound muss innerhalb von QuestionRoundProvider verwendet werden.');
  }

  return value;
}
