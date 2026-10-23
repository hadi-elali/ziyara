import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { useBusManagement } from '@/features/bus-management/bus-management-context';
import { useI18n } from '@/features/i18n/i18n';
import { getOriginalErrorMessage, getSupabaseReadFailureKind } from '@/features/network/supabase-read';
import { useTheme } from '@/hooks/use-theme';

export function BusSelectionPanel() {
  const theme = useTheme();
  const { t } = useI18n();
  const { profile } = useAuth();
  const { activeTrip, buses, participants, selectBus, setBusPresence } = useBusManagement();
  const busyRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ key: string; error: boolean } | null>(null);
  const ownAssignment = participants.find((person) => person.profile_id === profile?.id);
  const ownBus = buses.find((bus) => bus.id === ownAssignment?.bus_id);

  const saveBusData = async (action: () => Promise<void>, successKey: string, errorKey: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsSaving(true);
    setFeedback(null);
    try {
      await action();
      setFeedback({ key: successKey, error: false });
    } catch (error) {
      const message = getOriginalErrorMessage(error) ?? '';
      const key = /Active trip not found|Bus does not belong|bus assignment has changed|Choose a bus before/.test(message)
        ? 'bus.selection.changed'
        : /Authentication required|User profile is required|JWT|session/i.test(message)
          ? 'bus.submitError.auth'
          : getSupabaseReadFailureKind(error) === 'offline'
            ? 'bus.submitError.offline'
            : errorKey;
      setFeedback({ key, error: true });
    } finally {
      busyRef.current = false;
      setIsSaving(false);
    }
  };

  const chooseBus = (busId: number) => {
    if (ownBus?.id === busId) return;
    void saveBusData(() => selectBus(busId), 'bus.selection.saved', 'bus.selection.error');
  };

  const confirmPresence = (isOnBus: boolean) => {
    if (!ownBus || ownAssignment?.is_on_bus === isOnBus) return;
    void saveBusData(() => setBusPresence(ownBus.id, isOnBus), 'bus.presence.saved', 'bus.presence.error');
  };

  if (!activeTrip) return (
    <Card style={styles.card}>
      <ThemedText type="heading">{t('bus.selection.noTripTitle')}</ThemedText>
      <ThemedText themeColor="textSecondary">{t('bus.selection.noTripBody')}</ThemedText>
    </Card>
  );

  return (
    <Card style={styles.card}>
      <ThemedText type="heading">{ownBus ? t('bus.selection.current', { bus: ownBus.name }) : t('bus.selection.title')}</ThemedText>
      {ownBus ? (
        <View style={styles.buses}>
          <ThemedText type="smallBold">{t('bus.presence.title')}</ThemedText>
          <ThemedText
            accessibilityLiveRegion="polite"
            type="small"
            themeColor={ownAssignment?.is_on_bus === true ? 'success' : 'textSecondary'}>
            {t(ownAssignment?.is_on_bus === true ? 'bus.presence.onBus'
              : ownAssignment?.is_on_bus === false ? 'bus.presence.notOnBus' : 'bus.presence.unanswered')}
          </ThemedText>
          <View style={styles.presenceActions}>
            <Button
              accessibilityState={{ selected: ownAssignment?.is_on_bus === true }}
              disabled={isSaving}
              icon={ownAssignment?.is_on_bus === true ? 'confirm' : 'unchecked'}
              iconSize={32}
              label={t('bus.presence.onBus')}
              onPress={() => confirmPresence(true)}
              style={styles.presenceButton}
              variant="success"
            />
            <Button
              accessibilityState={{ selected: ownAssignment?.is_on_bus === false }}
              disabled={isSaving}
              icon={ownAssignment?.is_on_bus === false ? 'confirm' : 'unchecked'}
              iconSize={32}
              label={t('bus.presence.notOnBus')}
              onPress={() => confirmPresence(false)}
              style={styles.presenceButton}
              variant="danger-solid"
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">{t('bus.presence.resetHint')}</ThemedText>
        </View>
      ) : null}
      <ThemedText themeColor="textSecondary">{t('bus.selection.body')}</ThemedText>
      {buses.length === 0 ? (
        <ThemedText themeColor="textSecondary">{t('bus.selection.noBuses')}</ThemedText>
      ) : (
        <View style={styles.buses}>
          {buses.map((bus) => (
            <Button
              key={bus.id}
              disabled={isSaving || ownBus?.id === bus.id}
              icon={ownBus?.id === bus.id ? 'confirm' : 'bus'}
              label={t(ownBus?.id === bus.id ? 'bus.selection.selected' : ownBus ? 'bus.selection.change' : 'bus.selection.choose', { bus: bus.name })}
              onPress={() => void chooseBus(bus.id)}
              variant={ownBus?.id === bus.id ? 'secondary' : 'primary'}
            />
          ))}
        </View>
      )}
      {isSaving ? <ActivityIndicator accessibilityLabel={t('bus.selection.saving')} color={theme.accent} /> : null}
      {feedback ? (
        <ThemedText accessibilityLiveRegion="polite" type="small" themeColor={feedback.error ? 'danger' : 'success'}>{t(feedback.key)}</ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  buses: { gap: Spacing.two },
  presenceActions: { flexDirection: 'row', gap: Spacing.two },
  presenceButton: { flex: 1, minWidth: 0, minHeight: 56, paddingHorizontal: Spacing.two },
});
