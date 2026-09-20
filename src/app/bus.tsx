import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { BusBoardingStatus } from '@/domain/database';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useBusManagement } from '@/features/bus-management/bus-management-context';
import {
  getGeneralAlarmUrgency,
  getNextGeneralAlarmStatus,
  isGeneralAlarmReminderDue,
  type BusParticipantState,
} from '@/features/bus-management/bus-management-state';
import { useGeneralAlarmNotifications } from '@/features/general-alarm/general-alarm-notifications-context';
import { useI18n } from '@/features/i18n/i18n';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
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
  const { language, t } = useI18n();
  const {
    activeBoarding,
    activeTrip,
    hasSyncError,
    isLoading,
    isRefreshing,
    participants,
    refresh,
    setStatus,
    syncErrorMessage,
  } = useBusManagement();
  const [submittingParticipantId, setSubmittingParticipantId] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<{
    message: string;
    participantId: number;
  } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const alarmUrgency = activeBoarding ? getGeneralAlarmUrgency(activeBoarding, now) : 'normal';
  const departureLabel = activeBoarding
    ? new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(activeBoarding.departure_at))
    : null;

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(interval);
  }, []);

  const submitStatus = async (participantId: number, status: BusBoardingStatus) => {
    if (!activeBoarding || submittingParticipantId !== null) return;
    setSubmitError(null);
    setSubmittingParticipantId(participantId);

    try {
      const { error } = await setStatus(activeBoarding.id, participantId, status);
      if (error) {
        setSubmitError({ message: error.message, participantId });
      }
    } catch (error) {
      const message = getOriginalErrorMessage(error);

      if (message) setSubmitError({ message, participantId });
    } finally {
      setSubmittingParticipantId(null);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.accent} size="large" />
          <ThemedText themeColor="textSecondary">{t('bus.loading')}</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (hasSyncError && !activeTrip) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
        <View style={styles.heading}>
          <View style={styles.headingText}>
            <ThemedText type="title">{t('bus.title')}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {activeTrip?.name ?? t('bus.noAssignmentTitle')}
            </ThemedText>
          </View>
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
            {activeBoarding ? (
              <Card
                accessibilityRole="alert"
                style={[
                  styles.boardingCard,
                  {
                    backgroundColor:
                      alarmUrgency === 'normal' ? theme.surface : theme.dangerSoft,
                    borderColor:
                      alarmUrgency === 'normal' ? theme.warning : theme.danger,
                  },
                ]}>
                <ThemedText
                  type="smallBold"
                  themeColor={alarmUrgency === 'normal' ? 'warning' : 'danger'}>
                  {t('bus.activeLabel')}
                </ThemedText>
                <ThemedText type="heading">{activeBoarding.title}</ThemedText>
                <ThemedText themeColor="textSecondary">
                  {t('bus.departureAt', { date: departureLabel ?? '—' })}
                </ThemedText>
                <ThemedText
                  accessibilityLiveRegion="polite"
                  type="heading"
                  themeColor={alarmUrgency === 'normal' ? 'warning' : 'danger'}>
                  {departureCountdown(activeBoarding.departure_at, now, t)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('generalAlarm.sequenceBody')}
                </ThemedText>
              </Card>
            ) : (
              <Card style={styles.stateCard}>
                <ThemedText type="heading">{t('bus.noBoardingTitle')}</ThemedText>
                <ThemedText themeColor="textSecondary">{t('bus.noBoardingBody')}</ThemedText>
              </Card>
            )}

            <GeneralAlarmNotificationCard />

            <View style={styles.participantList}>
              {participants.map((participant) => (
                <ParticipantCard
                  active={Boolean(activeBoarding)}
                  disabled={submittingParticipantId !== null}
                  isSubmitting={submittingParticipantId === participant.id}
                  key={participant.id}
                  onStatus={(status) => void submitStatus(participant.id, status)}
                  participant={participant}
                  reminderDue={
                    activeBoarding
                      ? isGeneralAlarmReminderDue(activeBoarding, participant, now)
                      : false
                  }
                  submitErrorMessage={
                    submitError?.participantId === participant.id ? submitError.message : null
                  }
                />
              ))}
            </View>
          </>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ParticipantCard({
  active,
  disabled,
  isSubmitting,
  onStatus,
  participant,
  reminderDue,
  submitErrorMessage,
}: {
  active: boolean;
  disabled: boolean;
  isSubmitting: boolean;
  onStatus: (status: BusBoardingStatus) => void;
  participant: BusParticipantState;
  reminderDue: boolean;
  submitErrorMessage: string | null;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const nextStatus = getNextGeneralAlarmStatus(participant.status);
  const statusOptions: BusBoardingStatus[] = nextStatus
    ? [nextStatus, 'problem']
    : [];

  return (
    <Card style={styles.participantCard}>
      <View style={styles.participantHeader}>
        <View style={styles.participantText}>
          <ThemedText type="heading">{participant.display_name}</ThemedText>
          <ThemedText type="smallBold" themeColor="accent">
            {participant.bus_name ?? t('bus.unassignedBus')}
          </ThemedText>
        </View>
        <StatusBadge status={participant.status} />
      </View>

      {active ? (
        <View style={styles.statusButtons}>
          {statusOptions.map((status) => {
            const selected = participant.status === status;
            const color =
              status === 'boarded'
                ? theme.success
                : status === 'problem'
                  ? theme.danger
                  : status === 'read'
                    ? theme.warning
                    : theme.accent;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                key={status}
                onPress={() => onStatus(status)}
                style={({ pressed }) => [
                  styles.statusButton,
                  {
                    backgroundColor: selected ? color : theme.backgroundElement,
                    borderColor: color,
                  },
                  pressed && styles.pressed,
                  disabled && styles.disabled,
                ]}>
                <ThemedText
                  type="smallBold"
                  style={selected ? { color: theme.background } : { color }}>
                  {t(`bus.status.${status}`)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {reminderDue ? (
        <View style={[styles.reminderDue, { backgroundColor: theme.warningSoft }]}>
          <SymbolIcon color={theme.warning} name="warning" size={18} />
          <ThemedText type="smallBold" themeColor="warning">
            {t(`generalAlarm.reminderDue.${nextStatus ?? 'problem'}`)}
          </ThemedText>
        </View>
      ) : null}

      {isSubmitting ? <ActivityIndicator color={theme.accent} /> : null}
      {submitErrorMessage ? (
        <ThemedText accessibilityLiveRegion="polite" themeColor="danger" type="small">
          {submitErrorMessage}
        </ThemedText>
      ) : participant.status ? (
        <ThemedText accessibilityLiveRegion="polite" themeColor="success" type="small">
          {t('bus.statusSaved')}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function StatusBadge({ status }: { status: BusBoardingStatus | null }) {
  const theme = useTheme();
  const { t } = useI18n();
  const color =
    status === 'boarded'
      ? theme.success
      : status === 'problem'
        ? theme.danger
        : status === 'read'
          ? theme.warning
        : status === 'on_way'
          ? theme.accent
          : theme.textSecondary;

  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <SymbolIcon
        color={color}
        name={
          status === 'boarded' || status === 'read'
            ? 'confirm'
            : status === 'problem'
              ? 'warning'
              : 'bus'
        }
        size={18}
      />
      <ThemedText type="smallBold" style={{ color }}>
        {t(`bus.status.${status ?? 'not_confirmed'}`)}
      </ThemedText>
    </View>
  );
}

function GeneralAlarmNotificationCard() {
  const theme = useTheme();
  const { t } = useI18n();
  const { availability, enable, isWorking, openSettings } =
    useGeneralAlarmNotifications();
  const enabled = availability === 'registered';

  return (
    <Card
      style={[
        styles.notificationCard,
        { borderColor: enabled ? theme.success : theme.border },
      ]}>
      <View style={styles.notificationHeader}>
        <SymbolIcon
          color={enabled ? theme.success : theme.warning}
          name={enabled ? 'confirm' : 'warning'}
          size={22}
        />
        <View style={styles.participantText}>
          <ThemedText type="heading">{t('generalAlarm.notificationsTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t(`generalAlarm.notifications.${availability}`)}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {t('generalAlarm.platformLimit')}
      </ThemedText>
      {!enabled &&
      availability !== 'checking' &&
      availability !== 'expo_go' &&
      availability !== 'unsupported' ? (
        <View style={styles.notificationActions}>
          <Button
            disabled={isWorking}
            icon="confirm"
            label={t('generalAlarm.enableNotifications')}
            onPress={() => void enable()}
          />
          {availability === 'denied' ? (
            <Button
              icon="settings"
              label={t('generalAlarm.openSettings')}
              onPress={() => void openSettings()}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function departureCountdown(
  departureAt: string,
  now: Date,
  t: (key: string, params?: Record<string, number | string>) => string,
) {
  const remainingMs = new Date(departureAt).getTime() - now.getTime();
  const minutes = Math.ceil(Math.abs(remainingMs) / 60_000);
  return remainingMs <= 0
    ? t('generalAlarm.departureOverdue', { count: minutes })
    : t('generalAlarm.departureCountdown', { count: Math.max(1, minutes) });
}

const styles = StyleSheet.create({
  boardingCard: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
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
  disabled: {
    opacity: 0.48,
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  headingText: {
    flex: 1,
    gap: Spacing.half,
  },
  inlineError: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  notificationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  notificationCard: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  notificationHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
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
  pressed: {
    opacity: 0.72,
  },
  reminderDue: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.two,
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
  statusBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  statusButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.two,
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
