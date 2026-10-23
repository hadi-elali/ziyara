import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useAuth } from '@/features/auth/auth-context';
import { useBusManagement } from '@/features/bus-management/bus-management-context';
import { BusSelectionPanel } from '@/features/bus-management/BusSelectionPanel';
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
  const { session } = useAuth();
  const {
    activeTrip,
    hasSyncError,
    isLoading,
    isRefreshing,
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

          <BusSelectionPanel key={`${session?.user.id}:${activeTrip?.id}`} />
        </View>
      </ScrollView>
    </SafeAreaView>
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
