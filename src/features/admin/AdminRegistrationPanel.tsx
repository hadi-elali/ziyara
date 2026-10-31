import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/features/auth/supabase';
import { useRegistrationAvailability } from '@/features/auth/use-registration-availability';
import { useI18n } from '@/features/i18n/i18n';
import { useTheme } from '@/hooks/use-theme';

export function AdminRegistrationPanel() {
  const { t, isRTL } = useI18n();
  const theme = useTheme();
  const { enabled, hasError, refresh } = useRegistrationAvailability();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const saving = useRef(false);

  const save = async (next: boolean) => {
    if (saving.current || enabled === null) return;
    saving.current = true;
    setIsSaving(true);
    setSaveError(false);
    try {
      const { error } = await supabase.rpc('admin_set_registration_enabled', { p_enabled: next });
      if (error) throw error;
    } catch {
      setSaveError(true);
    } finally {
      // Reconcile even after an ambiguous network failure; never show an
      // optimistic value as if closing registration had been confirmed.
      await refresh();
      saving.current = false;
      setIsSaving(false);
    }
  };

  return (
    <Card style={styles.card}>
      <ThemedText type="heading">{t('admin.registration.title')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('admin.registration.description')}
      </ThemedText>
      <View style={[styles.row, isRTL && styles.rtl]}>
        <ThemedText style={styles.label}>{t('admin.registration.allow')}</ThemedText>
        <Switch
          accessibilityLabel={t('admin.registration.allow')}
          accessibilityState={{ busy: isSaving, disabled: isSaving || enabled === null }}
          disabled={isSaving || enabled === null}
          onValueChange={(next) => void save(next)}
          trackColor={{ true: theme.accent }}
          value={enabled === true}
        />
      </View>
      {isSaving || (enabled === null && !hasError) ? (
        <ActivityIndicator color={theme.accent} />
      ) : enabled !== null ? (
        <ThemedText type="small" themeColor={enabled ? 'success' : 'textSecondary'}>
          {t(enabled ? 'admin.registration.enabled' : 'admin.registration.disabled')}
        </ThemedText>
      ) : null}
      {hasError || saveError ? (
        <>
          <ThemedText accessibilityRole="alert" type="small" themeColor="danger">
            {t(saveError ? 'admin.registration.saveError' : 'auth.registrationUnavailable')}
          </ThemedText>
          <Button disabled={isSaving} icon="refresh" label={t('admin.retry')}
            onPress={() => { setSaveError(false); void refresh(); }} variant="secondary" />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  row: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minHeight: 48 },
  rtl: { flexDirection: 'row-reverse' },
  label: { flex: 1 },
});
