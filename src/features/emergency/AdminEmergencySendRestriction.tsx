import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import type { EmergencySendRestriction } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import { useI18n } from '@/features/i18n/i18n';
import { emergencyRestrictionUntilRelease } from './use-emergency-send-restriction';
import { withSupabaseReadTimeout } from '@/features/network/supabase-read';
import { useTheme } from '@/hooks/use-theme';

type Props = ({ userId: string; requestId?: never } | { requestId: number; userId?: never }) & {
  defaultOpen?: boolean;
};

export function AdminEmergencySendRestriction(props: Props) {
  const { profile } = useAuth();
  return profile?.role === 'admin' ? <RestrictionEditor {...props} /> : null;
}

function RestrictionEditor({ userId, requestId, defaultOpen = false }: Props) {
  const theme = useTheme();
  const { isRTL, language, t } = useI18n();
  const [expanded, setExpanded] = useState(defaultOpen);
  const [restriction, setRestriction] = useState<EmergencySendRestriction | null | undefined>();
  const [durationHours, setDurationHours] = useState<1 | 24 | null>(1);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [readError, setReadError] = useState(false);
  const [feedback, setFeedback] = useState<'saved' | 'revoked' | 'validation' | 'error' | null>(null);
  const sequence = useRef(0);
  const working = useRef(false);
  const mounted = useRef(false);
  const target = userId ? { p_user_id: userId } : { p_request_id: requestId };

  const refresh = useCallback(async () => {
    if (working.current) return;
    const version = ++sequence.current;
    setLoading(true);
    try {
      const { data, error } = await withSupabaseReadTimeout((signal) => supabase.rpc(
        'admin_get_emergency_send_restriction',
        userId ? { p_user_id: userId } : { p_request_id: requestId },
      ).abortSignal(signal));
      if (error || !data) throw error ?? new Error('Missing restriction status.');
      if (mounted.current && sequence.current === version) {
        setRestriction(data[0] ?? null);
        setReadError(false);
      }
    } catch {
      if (mounted.current && sequence.current === version) {
        setRestriction(undefined);
        setReadError(true);
      }
    } finally {
      if (mounted.current && sequence.current === version) setLoading(false);
    }
  }, [requestId, userId]);

  useEffect(() => {
    mounted.current = true;
    if (!expanded) return () => { mounted.current = false; sequence.current += 1; };
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
  }, [expanded, refresh]);

  const mutate = async () => {
    if (working.current || loading || restriction === undefined) return;
    if (!restriction && (reason.trim().length < 5 || reason.trim().length > 500)) {
      setFeedback('validation');
      return;
    }
    working.current = true;
    sequence.current += 1;
    setPending(true);
    setFeedback(null);
    try {
      if (restriction) {
        const { error } = await supabase.rpc('admin_revoke_emergency_send_restriction', {
          ...target, p_restriction_id: restriction.id,
        });
        if (error) throw error;
        if (mounted.current) { setRestriction(null); setFeedback('revoked'); }
      } else {
        const { data, error } = await supabase.rpc('admin_restrict_emergency_sender', {
          ...target, p_duration_hours: durationHours, p_reason: reason.trim(),
        });
        if (error || !data?.[0]) throw error ?? new Error('Missing restriction result.');
        if (mounted.current) {
          setRestriction(data[0]);
          setReason('');
          setFeedback('saved');
        }
      }
    } catch {
      if (mounted.current) setFeedback('error');
    } finally {
      working.current = false;
      if (mounted.current) setPending(false);
      // Reconcile other admins' changes and writes whose response was lost.
      if (mounted.current) void refresh();
    }
  };

  return (
    <View style={styles.container}>
      <Button
        disabled={pending}
        icon="settings"
        label={t('emergency.restriction.manage')}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        size="compact"
        variant="ghost"
      />
      {expanded ? (
        <View style={[styles.editor, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">{t('emergency.restriction.title')}</ThemedText>
          {loading ? <ActivityIndicator color={theme.accent} /> : null}
          {readError ? (
            <ThemedText type="small" themeColor="danger">{t('emergency.restriction.loadError')}</ThemedText>
          ) : null}
          {restriction ? (
            <>
              <ThemedText type="small" themeColor="danger">
                {restriction.restricted_until === emergencyRestrictionUntilRelease
                  ? t('emergency.restriction.activeUntilRelease')
                  : t('emergency.restriction.active', { date: new Intl.DateTimeFormat(language, {
                  dateStyle: 'short', timeStyle: 'short',
                }).format(new Date(restriction.restricted_until)) })}
              </ThemedText>
              <ThemedText type="small">{restriction.reason}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('emergency.restriction.actor', { name: restriction.created_by_display_name,
                  date: new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' })
                    .format(new Date(restriction.created_at)) })}
              </ThemedText>
              <Button disabled={pending || loading} icon="confirm" label={t('emergency.restriction.revoke')}
                onPress={() => void mutate()} variant="secondary" />
            </>
          ) : restriction === null ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">{t('emergency.restriction.inactive')}</ThemedText>
              <ThemedText type="small">{t('emergency.restriction.scope')}</ThemedText>
              <View style={styles.choices}>
                {([1, 24, null] as const).map((hours) => (
                  <Button key={hours ?? 'untilRelease'} disabled={pending || loading} icon="clock"
                    accessibilityState={{ selected: durationHours === hours }}
                    label={t(hours === null ? 'emergency.restriction.untilRelease' : `emergency.restriction.hours${hours}`)}
                    onPress={() => setDurationHours(hours)}
                    variant={durationHours === hours ? 'primary' : 'secondary'} />
                ))}
              </View>
              <TextInput accessibilityLabel={t('emergency.restriction.reason')} editable={!pending}
                maxLength={500} multiline value={reason}
                placeholder={t('emergency.restriction.reason')} placeholderTextColor={theme.textSecondary}
                onChangeText={(value) => { setReason(value); setFeedback(null); }}
                style={[styles.input, { color: theme.text, borderColor: theme.border,
                  backgroundColor: theme.background, textAlign: isRTL ? 'right' : 'left' }]}
                textAlignVertical="top" />
              <Button disabled={pending || loading} icon="warning" label={t('emergency.restriction.restrict')}
                onPress={() => void mutate()} variant="danger" />
            </>
          ) : null}
          {pending ? <ActivityIndicator color={theme.accent} /> : null}
          {feedback ? (
            <ThemedText accessibilityLiveRegion="polite" type="small"
              themeColor={feedback === 'saved' || feedback === 'revoked' ? 'success' : 'danger'}>
              {t(`emergency.restriction.${feedback}`)}
            </ThemedText>
          ) : null}
          <Button disabled={pending || loading} icon="refresh" label={t('emergency.retry')}
            onPress={() => void refresh()} size="compact" variant="ghost" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one, alignItems: 'stretch' },
  editor: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: Spacing.two, gap: Spacing.two },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  input: { borderWidth: 1, borderRadius: 8, minHeight: 88, padding: Spacing.two, fontSize: 16 },
});
