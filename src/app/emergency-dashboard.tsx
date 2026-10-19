import { Redirect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { Spacing } from '@/constants/theme';
import type { EmergencyDashboardItem } from '@/domain/database';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import { EmergencyRequestActions, EmergencyRequestStatus, type EmergencyRequestChange } from '@/features/emergency/EmergencyRequestActions';
import { useGeneralAlarmNotifications } from '@/features/general-alarm/general-alarm-notifications-context';
import { useI18n } from '@/features/i18n/i18n';
import {
  getOriginalErrorMessage,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';
import { openNavigation } from '@/features/places/openNavigation';
import { useTheme } from '@/hooks/use-theme';

export default function EmergencyDashboardScreen() {
  return (
    <RequireAuth returnTo="/emergency-dashboard">
      <EmergencyDashboardContent />
    </RequireAuth>
  );
}

function EmergencyDashboardContent() {
  const theme = useTheme();
  const { language, t } = useI18n();
  const { profile, session } = useAuth();
  const notifications = useGeneralAlarmNotifications();
  const [requests, setRequests] = useState<EmergencyDashboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [readErrorMessage, setReadErrorMessage] = useState<string | null>(null);
  const refreshSequence = useRef(0);
  const role = profile?.role;
  const userId = session?.user.id ?? null;
  const isStaff = role === 'medical_staff' || role === 'organization_team';
  const hasAccess = role === 'admin' || isStaff;

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    if (!userId || !hasAccess) {
      setIsLoading(false);
      return;
    }

    setIsRefreshing(true);
    try {
      const dashboardResult = await withSupabaseReadTimeout((signal) =>
        supabase.rpc('list_emergency_dashboard').abortSignal(signal),
      );
      if (dashboardResult.error) throw dashboardResult.error;

      if (sequence === refreshSequence.current) {
        setRequests(dashboardResult.data ?? []);
        setReadErrorMessage(null);
      }
    } catch (error) {
      if (sequence === refreshSequence.current) {
        setReadErrorMessage(getOriginalErrorMessage(error));
      }
    } finally {
      if (sequence === refreshSequence.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [hasAccess, userId]);

  useEffect(() => {
    const initialRefreshTimeout = setTimeout(() => void refresh(), 0);
    if (!userId || !hasAccess) return () => clearTimeout(initialRefreshTimeout);

    const channel = supabase
      .channel(`emergency-dashboard:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emergency_requests' },
        () => void refresh(),
      )
      .subscribe();

    const appStateSubscription =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') void refresh();
          });

    // DELETE notifications and role-based dashboard reads need a polling fallback.
    let stopped = false;
    let pollingTimeout: ReturnType<typeof setTimeout>;
    const scheduleRefresh = () => {
      if (stopped) return;
      pollingTimeout = setTimeout(() => void refresh().finally(scheduleRefresh), 60_000 + Math.random() * 30_000);
    };
    scheduleRefresh();

    return () => {
      stopped = true;
      clearTimeout(pollingTimeout);
      clearTimeout(initialRefreshTimeout);
      refreshSequence.current += 1;
      appStateSubscription?.remove();
      void supabase.removeChannel(channel);
    };
  }, [hasAccess, refresh, userId]);

  const handleRequestChanged = (change: EmergencyRequestChange) => {
    refreshSequence.current += 1;
    setRequests((current) => change.kind === 'deleted'
      ? current.filter((item) => item.request_id !== change.requestId)
      : current.map((item) => item.request_id === change.requestId
        ? { ...item, completed_at: change.completedAt }
        : item));
    void refresh();
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(value),
    );

  const openCoordinates = (item: EmergencyDashboardItem) => {
    if (item.latitude === null || item.longitude === null) return;
    void openNavigation({
      latitude: item.latitude,
      longitude: item.longitude,
      name: item.location_label ?? t('emergency.locationFallback'),
    });
  };

  if (!profile) return <ActivityIndicator color={theme.accent} size="large" />;
  if (!hasAccess) return <Redirect href="/" />;

  return (
    <Screen safeAreaEdges={['right', 'bottom', 'left']}>
      <View style={styles.intro}>
        <ThemedText type="title">{t('emergencyDashboard.title')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {t(`emergencyDashboard.body.${role}`)}
        </ThemedText>
      </View>

      {isStaff ? (
        <Section title={t('emergencyDashboard.dutyTitle')}>
          <Card style={styles.card}>
            <View style={styles.headerRow}>
              <View style={styles.headingText}>
                <ThemedText type="heading">
                  {t(
                    role === 'medical_staff'
                      ? 'emergency.team.medical'
                      : 'emergency.team.travel',
                  )}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('emergencyDashboard.dutyBody')}
                </ThemedText>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: theme.successSoft,
                    borderColor: theme.success,
                  },
                ]}>
                <ThemedText type="tinyBold" themeColor="success">
                  {t('emergencyDashboard.dutyOn')}
                </ThemedText>
              </View>
            </View>

            <ThemedText type="small" themeColor="textSecondary">
              {t(`emergency.notifications.${notifications.availability}`)}
            </ThemedText>
            {notifications.availability === 'checking' || notifications.isWorking ? (
              <ActivityIndicator color={theme.accent} />
            ) : notifications.availability === 'disabled' ||
              notifications.availability === 'denied' ||
              notifications.availability === 'error' ? (
              <View style={styles.actions}>
                <Button
                  icon="warning"
                  label={t('emergency.notificationsEnable')}
                  onPress={() => void notifications.enable()}
                />
                <Button
                  icon="settings"
                  label={t('emergency.notificationsSettings')}
                  onPress={() => void notifications.openSettings()}
                  variant="secondary"
                />
              </View>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {readErrorMessage ? (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.warningSoft, borderColor: theme.warning },
          ]}>
          <ThemedText type="heading">{t('emergency.syncErrorTitle')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {readErrorMessage}
          </ThemedText>
          <Button
            icon="refresh"
            label={t('emergency.retry')}
            onPress={() => void refresh()}
            variant="secondary"
          />
        </Card>
      ) : null}

      <Section title={t('emergencyDashboard.requestsTitle')}>
        {isLoading ? (
          <ActivityIndicator color={theme.accent} size="large" />
        ) : requests.length === 0 ? (
          <Card style={styles.card}>
            <ThemedText type="heading">{t('emergencyDashboard.emptyTitle')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('emergencyDashboard.emptyBody')}
            </ThemedText>
          </Card>
        ) : (
          <View style={styles.list}>
            {requests.map((item) => (
              <Card key={item.request_id} style={[styles.card, styles.requestCard]}>
                <View style={styles.headerRow}>
                  <View style={styles.headingText}>
                    <ThemedText type="smallBold" style={styles.senderName}>{item.requester_display_name}</ThemedText>
                    <View style={styles.messageMeta}>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.metaText}>
                        {t(`emergency.team.${item.target_team}`)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.metaText}>
                        {formatDate(item.created_at)}
                      </ThemedText>
                    </View>
                  </View>
                  <EmergencyRequestStatus completedAt={item.completed_at} />
                </View>
                <ThemedText>{item.message}</ThemedText>
                {item.location_label ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('emergency.locationPrefix', { location: item.location_label })}
                  </ThemedText>
                ) : null}
                {item.latitude !== null && item.longitude !== null ? (
                  <View style={styles.coordinatesRow}>
                    <ThemedText
                      style={styles.coordinatesText}
                      themeColor="textSecondary"
                      type="code">
                      {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                      {item.accuracy_meters !== null
                        ? ` · ±${Math.round(item.accuracy_meters)} m`
                        : ''}
                    </ThemedText>
                    <Button
                      icon="map"
                      label={t('emergency.locationOpen')}
                      onPress={() => openCoordinates(item)}
                      size="compact"
                      variant="ghost"
                    />
                  </View>
                ) : null}
                <EmergencyRequestActions item={item} onChanged={handleRequestChanged} showStatus={false} />
              </Card>
            ))}
          </View>
        )}
      </Section>

      <Button
        disabled={isRefreshing}
        icon="refresh"
        label={t('emergency.retry')}
        onPress={() => void refresh()}
        variant="secondary"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  card: { gap: Spacing.three },
  coordinatesRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  coordinatesText: { flex: 1, minWidth: 180 },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  headingText: { flex: 1, gap: Spacing.one, minWidth: 180 },
  intro: { gap: Spacing.two },
  list: { gap: Spacing.three },
  requestCard: { gap: Spacing.two },
  messageMeta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.two },
  metaText: { fontSize: 12, lineHeight: 18 },
  senderName: { fontSize: 16, lineHeight: 22 },
  statusBadge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
