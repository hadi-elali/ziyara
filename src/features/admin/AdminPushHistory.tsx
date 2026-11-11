import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import type { AdminPushMessageSummary } from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import { useI18n } from '@/features/i18n/i18n';
import {
  getSupabaseReadFailureKind,
  type SupabaseReadFailureKind,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';
import { formatLocalDateTime } from '@/features/scheduling/local-date-time';
import { useTheme } from '@/hooks/use-theme';

type HistoryState = {
  messages: AdminPushMessageSummary[];
  error: SupabaseReadFailureKind | null;
  revision: number;
  reload: number;
};

export function AdminPushHistory({ revision }: { revision: number }) {
  const { t, language } = useI18n();
  const theme = useTheme();
  const [history, setHistory] = useState<HistoryState>({
    messages: [], error: null, revision: -1, reload: -1,
  });
  const [reload, setReload] = useState(0);
  const loading = history.revision !== revision || history.reload !== reload;
  const error = loading ? null : history.error;
  const { messages } = history;

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const result = await withSupabaseReadTimeout((signal) =>
          supabase.rpc('admin_list_push_messages').abortSignal(signal),
        );
        if (result.error) throw result.error;
        if (active) setHistory({ messages: result.data ?? [], error: null, revision, reload });
      } catch (cause) {
        if (active) setHistory((previous) => ({
          ...previous, error: getSupabaseReadFailureKind(cause), revision, reload,
        }));
      }
    })();

    // A send, reload or account change must invalidate older responses.
    return () => { active = false; };
  }, [reload, revision]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setReload((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.stack}>
      <ThemedText accessibilityRole="header" type="heading">{t('adminPush.history')}</ThemedText>
      <Button
        disabled={loading}
        icon="refresh"
        label={t('adminPush.historyRefresh')}
        onPress={() => setReload((value) => value + 1)}
        size="compact"
        variant="secondary"
      />
      {loading ? <ActivityIndicator accessibilityLabel={t('adminPush.historyLoading')} color={theme.accent} /> : null}
      {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{t(`adminPush.historyError.${error}`)}</ThemedText> : null}
      {!loading && !error && messages.length === 0 ? (
        <ThemedText themeColor="textSecondary">{t('adminPush.historyEmpty')}</ThemedText>
      ) : null}
      {messages.map((message) => (
        <Card key={message.id}>
          <ThemedText type="small" themeColor="textSecondary">
            {formatLocalDateTime(message.created_at, language)}
          </ThemedText>
          <ThemedText type="smallBold" selectable>{message.title}</ThemedText>
          <ThemedText selectable>{message.body}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t(!message.started_at ? 'adminPush.historySaved'
              : message.total === 0 ? 'adminPush.historyNoDevices'
                : message.pending > 0 ? 'adminPush.historyPending'
                  : 'adminPush.processed')}
          </ThemedText>
          {message.started_at && message.total > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('adminPush.historyCounts', {
                total: message.total, accepted: message.accepted,
                failed: message.failed, pending: message.pending,
              })}
            </ThemedText>
          ) : null}
        </Card>
      ))}
      {messages.some((message) => message.started_at !== null && message.total > 0) ? (
        <ThemedText type="small" themeColor="textSecondary">{t('adminPush.historyDeliveryHint')}</ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
});
