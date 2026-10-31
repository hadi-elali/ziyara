import { useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { Spacing } from '@/constants/theme';
import type { EmergencyInboxMessage } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import { AdminEmergencySendRestriction } from '@/features/emergency/AdminEmergencySendRestriction';
import { useI18n } from '@/features/i18n/i18n';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { useTheme } from '@/hooks/use-theme';

export type EmergencyRequestChange =
  | { requestId: number; kind: 'completed'; completedAt: string }
  | { requestId: number; kind: 'deleted' };

export function EmergencyRequestStatus({ completedAt }: { completedAt: string | null }) {
  const theme = useTheme();
  const { t } = useI18n();
  const completed = completedAt !== null;
  return (
    <View style={styles.status}>
      <View style={[styles.statusDot, { backgroundColor: completed ? theme.success : theme.warning }]} />
      <ThemedText type="small" themeColor={completed ? 'success' : 'textSecondary'} style={styles.statusLabel}>
        {t(completed ? 'emergency.completed' : 'emergency.open')}
      </ThemedText>
    </View>
  );
}

export function EmergencyRequestActions({
  item,
  onChanged,
  onMarkRead,
  markingRead = false,
  readAt,
  showStatus = true,
}: {
  item: Pick<EmergencyInboxMessage, 'request_id' | 'target_team' | 'completed_at'>;
  onChanged?: (change: EmergencyRequestChange) => void;
  onMarkRead?: () => void;
  markingRead?: boolean;
  readAt?: string | null;
  showStatus?: boolean;
}) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { language, t } = useI18n();
  const [pending, setPending] = useState<'complete' | 'delete' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const working = useRef(false);
  const role = profile?.role;
  const isAdmin = role === 'admin';
  const canComplete = isAdmin ||
    (role === 'medical_staff' && item.target_team === 'medical') ||
    (role === 'organization_team' && item.target_team === 'travel');
  const completed = item.completed_at !== null;
  const hasActions = Boolean(onMarkRead || (onChanged && (isAdmin || (canComplete && !completed))));

  const runAction = async (action: 'complete' | 'delete') => {
    if (working.current) return;
    working.current = true;
    setPending(action);
    setErrorMessage(null);
    try {
      if (action === 'complete') {
        const { data, error } = await supabase.rpc('complete_emergency_request', {
          p_request_id: item.request_id,
        });
        if (error) throw error;
        if (!data) throw new Error(t('emergency.actionError'));
        onChanged?.({ requestId: item.request_id, kind: 'completed', completedAt: data });
      } else {
        const { error } = await supabase.rpc('admin_delete_emergency_request', {
          p_request_id: item.request_id,
        });
        if (error) throw error;
        onChanged?.({ requestId: item.request_id, kind: 'deleted' });
      }
    } catch (error) {
      setErrorMessage(getOriginalErrorMessage(error) ?? t('emergency.actionError'));
    } finally {
      working.current = false;
      setPending(null);
    }
  };

  const confirmDelete = () => {
    const title = t('emergency.deleteTitle');
    const body = t('emergency.deleteBody');
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n${body}`)) void runAction('delete');
      return;
    }
    Alert.alert(title, body, [
      { text: t('emergency.cancel'), style: 'cancel' },
      { text: t('emergency.delete'), style: 'destructive', onPress: () => void runAction('delete') },
    ]);
  };

  if (!showStatus && !hasActions && !item.completed_at && !readAt) return null;

  return (
    <View style={[styles.container, { borderTopColor: theme.border }]}>
      {showStatus ? <EmergencyRequestStatus completedAt={item.completed_at} /> : null}
      {item.completed_at ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.timestamp}>
          {t('emergency.completedAt', {
            date: new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' })
              .format(new Date(item.completed_at)),
          })}
        </ThemedText>
      ) : null}
      {hasActions || readAt ? (
        <View style={styles.actions}>
          {onMarkRead ? (
            <Button
              disabled={markingRead || pending !== null}
              accessibilityState={{ busy: markingRead }}
              icon="confirm"
              label={t('emergency.markRead')}
              onPress={onMarkRead}
              size="compact"
              variant="ghost"
            />
          ) : readAt ? (
            <View style={styles.readReceipt}>
              <SymbolIcon color={theme.textSecondary} name="confirm" size={13} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.statusLabel}>
                {t('emergency.read')}
              </ThemedText>
            </View>
          ) : null}
          {onChanged && canComplete && !completed ? (
            <Button
              disabled={pending !== null || markingRead}
              accessibilityState={{ busy: pending === 'complete' }}
              icon="confirm"
              label={t(pending === 'complete' ? 'emergency.completing' : 'emergency.complete')}
              onPress={() => void runAction('complete')}
              size="compact"
              style={{ backgroundColor: theme.accentSoft, borderColor: 'transparent' }}
              variant="secondary"
            />
          ) : null}
          {onChanged && isAdmin ? (
            <Button
              disabled={pending !== null || markingRead}
              accessibilityState={{ busy: pending === 'delete' }}
              icon="close"
              label={t(pending === 'delete' ? 'emergency.deleting' : 'emergency.delete')}
              onPress={confirmDelete}
              size="compact"
              style={styles.deleteButton}
              variant="danger"
            />
          ) : null}
        </View>
      ) : null}
      {errorMessage ? (
        <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
          {errorMessage}
        </ThemedText>
      ) : null}
      {onChanged && isAdmin ? <AdminEmergencySendRestriction requestId={item.request_id} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.one, paddingTop: Spacing.two },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.one, rowGap: Spacing.one },
  deleteButton: { backgroundColor: 'transparent', borderColor: 'transparent', marginStart: 'auto' },
  readReceipt: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, minHeight: 44, paddingEnd: Spacing.two },
  status: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, flexShrink: 1 },
  statusDot: { borderRadius: 3, height: 6, width: 6 },
  statusLabel: { fontSize: 12, lineHeight: 18, flexShrink: 1 },
  timestamp: { fontSize: 12, lineHeight: 18 },
});
