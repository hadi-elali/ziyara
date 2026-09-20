import { Redirect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { Spacing } from '@/constants/theme';
import type {
  EmergencyDashboardItem,
  EmergencyDutyNotification,
} from '@/domain/database';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
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
  const [dutyMessages, setDutyMessages] = useState<EmergencyDutyNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [readErrorMessage, setReadErrorMessage] = useState<string | null>(null);
  const [markingDutyId, setMarkingDutyId] = useState<number | null>(null);
  const [markDutyError, setMarkDutyError] = useState<{
    message: string;
    notificationId: number;
  } | null>(null);
  const refreshSequence = useRef(0);
  const role = profile?.role;
  const userId = session?.user.id ?? null;
  const isStaff = role === 'medical_staff' || role === 'organization_team';
  const hasAccess = role === 'admin' || isStaff;
  const isOnDuty = dutyMessages[0]?.is_on_duty ?? false;

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    if (!userId || !hasAccess) {
      setIsLoading(false);
      return;
    }

    setIsRefreshing(true);
    try {
      const [dashboardResult, dutyResult] = await Promise.all([
        withSupabaseReadTimeout((signal) =>
          supabase.rpc('list_emergency_dashboard').abortSignal(signal),
        ),
        withSupabaseReadTimeout((signal) =>
          supabase.rpc('list_my_emergency_duty_notifications').abortSignal(signal),
        ),
      ]);
      if (dashboardResult.error) throw dashboardResult.error;
      if (dutyResult.error) throw dutyResult.error;

      if (sequence === refreshSequence.current) {
        setRequests(dashboardResult.data ?? []);
        setDutyMessages(dutyResult.data ?? []);
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emergency_team_duties' },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emergency_duty_notifications' },
        () => void refresh(),
      )
      .subscribe();

    const appStateSubscription =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') void refresh();
          });

    return () => {
      clearTimeout(initialRefreshTimeout);
      refreshSequence.current += 1;
      appStateSubscription?.remove();
      void supabase.removeChannel(channel);
    };
  }, [hasAccess, refresh, userId]);

  const markDutyRead = async (notificationId: number) => {
    if (markingDutyId !== null) return;
    setMarkingDutyId(notificationId);
    setMarkDutyError(null);

    try {
      const { error } = await supabase.rpc('mark_emergency_duty_notification_read', {
        p_notification_id: notificationId,
      });
      if (error) throw error;

      setDutyMessages((current) =>
        current.map((item) =>
          item.notification_id === notificationId
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
    } catch (error) {
      const message = getOriginalErrorMessage(error);
      if (message) setMarkDutyError({ message, notificationId });
    } finally {
      setMarkingDutyId(null);
    }
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
                    backgroundColor: isOnDuty ? theme.successSoft : theme.backgroundElement,
                    borderColor: isOnDuty ? theme.success : theme.border,
                  },
                ]}>
                <ThemedText
                  type="tinyBold"
                  themeColor={isOnDuty ? 'success' : 'textSecondary'}>
                  {t(
                    isOnDuty
                      ? 'emergencyDashboard.dutyOn'
                      : 'emergencyDashboard.dutyOff',
                  )}
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

          {dutyMessages.length > 0 ? (
            <View style={styles.list}>
              {dutyMessages.map((item) => {
                const unread = item.read_at === null;
                return (
                  <Card
                    key={item.notification_id}
                    style={[
                      styles.card,
                      unread
                        ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
                        : null,
                    ]}>
                    <View style={styles.headerRow}>
                      <View style={styles.headingText}>
                        <ThemedText type="heading">
                          {t('emergencyDashboard.dutyMessageTitle')}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {formatDate(item.created_at)}
                        </ThemedText>
                      </View>
                      {unread ? (
                        <View style={[styles.newBadge, { backgroundColor: theme.accent }]}>
                          <ThemedText style={{ color: theme.surface }} type="tinyBold">
                            {t('emergency.new')}
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <ThemedText>
                      {t('emergencyDashboard.dutyMessageBody', {
                        admin: item.assigned_by_display_name,
                        team: t(`emergency.team.${item.team}`),
                      })}
                    </ThemedText>
                    {unread ? (
                      <Button
                        disabled={markingDutyId !== null}
                        icon="confirm"
                        label={t('emergency.markRead')}
                        onPress={() => void markDutyRead(item.notification_id)}
                        variant="secondary"
                      />
                    ) : (
                      <ThemedText type="small" themeColor="success">
                        {t('emergency.read')}
                      </ThemedText>
                    )}
                    {markDutyError?.notificationId === item.notification_id ? (
                      <ThemedText
                        accessibilityLiveRegion="polite"
                        type="small"
                        themeColor="danger">
                        {markDutyError.message}
                      </ThemedText>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          ) : null}
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
              <Card key={item.request_id} style={styles.card}>
                <View style={styles.headerRow}>
                  <View style={styles.headingText}>
                    <ThemedText type="heading">{item.requester_display_name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDate(item.created_at)}
                    </ThemedText>
                  </View>
                  <View
                    style={[
                      styles.teamBadge,
                      {
                        backgroundColor: theme.dangerSoft,
                        borderColor: theme.danger,
                      },
                    ]}>
                    <ThemedText type="tinyBold" themeColor="danger">
                      {t(`emergency.team.${item.target_team}`)}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText>{item.message}</ThemedText>
                {item.location_label ? (
                  <ThemedText type="small">
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
                      variant="secondary"
                    />
                  </View>
                ) : null}
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
  newBadge: {
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: Spacing.two,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  teamBadge: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
