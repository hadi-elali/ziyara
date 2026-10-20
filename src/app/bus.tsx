import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useBusManagement } from '@/features/bus-management/bus-management-context';
import type { BusParticipantState } from '@/features/bus-management/bus-management-state';
import { useI18n } from '@/features/i18n/i18n';
import { useTheme } from '@/hooks/use-theme';

export default function BusScreen() {
  return (
    <RequireAuth returnTo="/bus">
      <BusContent />
    </RequireAuth>
  );
}

function BusContent() {
  const theme = useTheme();
  const { t } = useI18n();
  const {
    activeTrip,
    hasSyncError,
    isLoading,
    isRefreshing,
    participants,
    refresh,
    syncErrorMessage,
  } = useBusManagement();
  if (isLoading) {
    return (
      <SafeAreaView
        edges={['right', 'bottom', 'left']}
        style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.accent} size="large" />
          <ThemedText themeColor="textSecondary">{t('bus.loading')}</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (hasSyncError && !activeTrip) {
    return (
      <SafeAreaView
        edges={['right', 'bottom', 'left']}
        style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <View style={styles.centered}>
          <Card style={styles.stateCard}>
            <ThemedText type="heading">{t('bus.syncErrorTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {syncErrorMessage}
            </ThemedText>
            <Button icon="refresh" label={t('bus.retry')} onPress={() => void refresh()} />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['right', 'bottom', 'left']}
      style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
        <View style={styles.heading}>
          <ThemedText style={styles.headingText} themeColor="textSecondary">
            {activeTrip?.name ?? t('bus.noAssignmentTitle')}
          </ThemedText>
          {isRefreshing ? <ActivityIndicator color={theme.accent} /> : null}
        </View>

        {hasSyncError ? (
          <Card style={[styles.inlineError, { borderColor: theme.warning }]}>
            <ThemedText type="small" themeColor="warning">
              {syncErrorMessage}
            </ThemedText>
            <Button
              icon="refresh"
              label={t('bus.retry')}
              onPress={() => void refresh()}
              variant="secondary"
            />
          </Card>
        ) : null}

        {!activeTrip || participants.length === 0 ? (
          <Card style={styles.stateCard}>
            <ThemedText type="heading">{t('bus.noAssignmentTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary">{t('bus.noAssignmentBody')}</ThemedText>
          </Card>
        ) : (
          <>
            <View style={styles.participantList}>
              {participants.map((participant) => (
                <ParticipantCard key={participant.id} participant={participant} />
              ))}
            </View>
          </>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ParticipantCard({ participant }: { participant: BusParticipantState }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <Card style={styles.participantCard}>
      <View style={styles.participantHeader}>
        <SymbolIcon color={theme.accent} name="bus" size={24} />
        <View style={styles.participantText}>
          <ThemedText type="heading">{participant.display_name}</ThemedText>
          <ThemedText type="smallBold" themeColor="accent">
            {participant.bus_name ?? t('bus.unassignedBus')}
          </ThemedText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.three,
    justifyContent: 'center',
    padding: Spacing.three,
  },
  content: {
    alignSelf: 'center',
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    width: '100%',
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  headingText: {
    flex: 1,
  },
  inlineError: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  participantCard: {
    gap: Spacing.three,
  },
  participantHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  participantList: {
    gap: Spacing.three,
  },
  participantText: {
    flex: 1,
    gap: Spacing.half,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  stateCard: {
    gap: Spacing.two,
  },
});
