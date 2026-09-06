import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import type { BusBoardingStatus } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import { useBusManagement } from '@/features/bus-management/bus-management-context';
import {
  buildBusClosureStates,
  getGeneralAlarmUrgency,
  isGeneralAlarmReminderDue,
  shouldRetryBusStatusAfterSessionRefresh,
  summarizeBusBoarding,
  type BusParticipantState,
} from '@/features/bus-management/bus-management-state';
import { useI18n } from '@/features/i18n/i18n';
import { supabaseReadFailureTranslationKey } from '@/features/network/supabase-read';
import { useTheme } from '@/hooks/use-theme';

const departureMinuteOptions = [15, 30, 60] as const;
const statusOptions: BusBoardingStatus[] = ['read', 'on_way', 'boarded', 'problem'];

export function AdminGeneralAlarmPanel() {
  const theme = useTheme();
  const { language, t } = useI18n();
  const { session } = useAuth();
  const {
    activeBoarding,
    activeTrip,
    hasSyncError,
    isLoading,
    participants,
    refresh,
    syncErrorKind,
  } = useBusManagement();
  const [alarmTitle, setAlarmTitle] = useState('');
  const [departureMinutes, setDepartureMinutes] = useState<(typeof departureMinuteOptions)[number]>(
    15,
  );
  const [isWorking, setIsWorking] = useState(false);
  const [hasActionError, setHasActionError] = useState(false);
  const [pushDispatchState, setPushDispatchState] = useState<
    'error' | 'idle' | 'running' | 'success'
  >('idle');
  const [now, setNow] = useState(() => new Date());
  const summary = summarizeBusBoarding(participants);
  const busClosureStates = buildBusClosureStates(participants);
  const orderedParticipants = useMemo(
    () =>
      [...participants].sort(
        (left, right) => Number(left.status === 'boarded') - Number(right.status === 'boarded'),
      ),
    [participants],
  );
  const alarmUrgency = activeBoarding ? getGeneralAlarmUrgency(activeBoarding, now) : 'normal';

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(interval);
  }, []);

  const dispatchPushNotifications = useCallback(async () => {
    if (!activeBoarding?.id) return;
    setPushDispatchState('running');

    try {
      const { error } = await supabase.functions.invoke('dispatch-general-alarm', {
        body: {},
      });
      setPushDispatchState(error ? 'error' : 'success');
    } catch {
      setPushDispatchState('error');
    }
  }, [activeBoarding?.id]);

  useEffect(() => {
    if (!activeBoarding?.id) return;

    const timeout = setTimeout(() => void dispatchPushNotifications(), 0);
    const interval = setInterval(() => void dispatchPushNotifications(), 60_000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [activeBoarding?.id, dispatchPushNotifications]);

  const runAction = async (
    action: () => PromiseLike<{ error: unknown }>,
    onSuccess?: () => void,
  ) => {
    if (isWorking) return;
    setHasActionError(false);
    setIsWorking(true);

    try {
      let result = await action();

      if (result.error && shouldRetryBusStatusAfterSessionRefresh(result.error)) {
        const refreshedSession = await supabase.auth.refreshSession();

        if (
          !refreshedSession.error &&
          refreshedSession.data.session?.user.id === session?.user.id
        ) {
          result = await action();
        }
      }

      if (result.error) {
        setHasActionError(true);
      } else {
        onSuccess?.();
      }
      await refresh();
    } catch {
      setHasActionError(true);
    } finally {
      setIsWorking(false);
    }
  };

  const enableAlarm = () => {
    if (!activeTrip) return;
    const departureAt = new Date(Date.now() + departureMinutes * 60_000).toISOString();
    void runAction(
      () =>
        supabase.rpc('admin_start_bus_boarding', {
          p_departure_at: departureAt,
          p_title: alarmTitle.trim(),
          p_trip_id: activeTrip.id,
        }),
      () => setAlarmTitle(''),
    );
  };

  const disableAlarm = () => {
    if (!activeBoarding) return;
    void runAction(() =>
      supabase.rpc('admin_close_bus_boarding', { p_boarding_id: activeBoarding.id }),
    );
  };

  const setParticipantStatus = (participantId: number, status: BusBoardingStatus) => {
    if (!activeBoarding) return;
    void runAction(() =>
      supabase.rpc('admin_set_bus_boarding_status', {
        p_boarding_id: activeBoarding.id,
        p_participant_id: participantId,
        p_status: status,
      }),
    );
  };

  const escalateParticipant = (participantId: number) => {
    if (!activeBoarding) return;
    void runAction(() =>
      supabase.rpc('admin_escalate_bus_boarding_participant', {
        p_boarding_id: activeBoarding.id,
        p_participant_id: participantId,
      }),
    );
  };

  if (isLoading) {
    return (
      <Card style={styles.stateCard}>
        <ActivityIndicator color={theme.accent} />
        <ThemedText themeColor="textSecondary">{t('bus.loading')}</ThemedText>
      </Card>
    );
  }

  if (hasSyncError && !activeTrip) {
    return (
      <Card style={styles.stateCard}>
        <ThemedText type="heading">{t('generalAlarm.admin.unavailableTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {t(supabaseReadFailureTranslationKey(syncErrorKind ?? 'server'))}
        </ThemedText>
        <Button icon="refresh" label={t('bus.retry')} onPress={() => void refresh()} />
      </Card>
    );
  }

  if (!activeTrip) {
    return (
      <Card style={styles.stateCard}>
        <ThemedText type="heading">{t('generalAlarm.admin.tripRequiredTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {t('generalAlarm.admin.tripRequiredBody')}
        </ThemedText>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      {hasSyncError ? (
        <Card style={[styles.inlineError, { borderColor: theme.warning }]}>
          <ThemedText type="small" themeColor="warning">
            {t(supabaseReadFailureTranslationKey(syncErrorKind ?? 'server'))}
          </ThemedText>
          <Button
            icon="refresh"
            label={t('bus.retry')}
            onPress={() => void refresh()}
            variant="secondary"
          />
        </Card>
      ) : null}

      <Card style={styles.formCard}>
        <ThemedText type="heading">
          {activeBoarding ? activeBoarding.title : t('generalAlarm.admin.enableTitle')}
        </ThemedText>

        {activeBoarding ? (
          <>
            <View
              accessibilityRole="alert"
              style={[
                styles.alarmBanner,
                {
                  backgroundColor:
                    alarmUrgency === 'normal' ? theme.warningSoft : theme.dangerSoft,
                  borderColor: alarmUrgency === 'normal' ? theme.warning : theme.danger,
                },
              ]}>
              <ThemedText
                type="heading"
                themeColor={alarmUrgency === 'normal' ? 'warning' : 'danger'}>
                {alarmUrgency === 'overdue'
                  ? t('generalAlarm.admin.departureOverdue')
                  : alarmUrgency === 'urgent'
                    ? t('generalAlarm.admin.departureUrgent')
                    : t('generalAlarm.admin.active')}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {t('generalAlarm.admin.confirmedSummary', {
                  confirmed: summary.confirmed,
                  total: summary.total,
                })}
              </ThemedText>
              <ThemedText themeColor={summary.boarded === summary.total ? 'success' : 'danger'}>
                {t('generalAlarm.admin.missingSummary', {
                  count: summary.total - summary.boarded,
                })}
              </ThemedText>
            </View>

            <ThemedText themeColor="textSecondary">
              {t('bus.departureAt', {
                date: new Intl.DateTimeFormat(language, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(activeBoarding.departure_at)),
              })}
            </ThemedText>

            <View style={styles.summaryGrid}>
              <SummaryValue
                color={theme.textSecondary}
                label={t('bus.status.not_confirmed')}
                value={summary.notConfirmed}
              />
              <SummaryValue color={theme.warning} label={t('bus.status.read')} value={summary.read} />
              <SummaryValue color={theme.accent} label={t('bus.status.on_way')} value={summary.onWay} />
              <SummaryValue color={theme.success} label={t('bus.status.boarded')} value={summary.boarded} />
              <SummaryValue color={theme.danger} label={t('bus.status.problem')} value={summary.problem} />
            </View>

            <View style={styles.busClosureGrid}>
              {busClosureStates.map((busState) => (
                <View
                  key={busState.busId ?? 'unassigned'}
                  style={[
                    styles.busClosureCard,
                    {
                      backgroundColor: busState.canClose
                        ? theme.successSoft
                        : theme.dangerSoft,
                      borderColor: busState.canClose ? theme.success : theme.danger,
                    },
                  ]}>
                  <ThemedText type="smallBold">
                    {busState.busName ?? t('bus.unassignedBus')}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    themeColor={busState.canClose ? 'success' : 'danger'}>
                    {busState.canClose
                      ? t('generalAlarm.admin.busCanClose')
                      : t('generalAlarm.admin.busCannotClose', {
                          count: busState.total - busState.boarded,
                        })}
                  </ThemedText>
                  {!busState.canClose ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {busState.outstandingParticipantNames.join(', ')}
                    </ThemedText>
                  ) : null}
                </View>
              ))}
            </View>

            <View style={styles.pushDispatchRow}>
              <ThemedText
                accessibilityLiveRegion="polite"
                style={styles.pushDispatchText}
                themeColor={pushDispatchState === 'error' ? 'danger' : 'textSecondary'}
                type="small">
                {t(`generalAlarm.admin.push.${pushDispatchState}`)}
              </ThemedText>
              <Button
                disabled={pushDispatchState === 'running'}
                icon="refresh"
                label={t('generalAlarm.admin.pushNow')}
                onPress={() => void dispatchPushNotifications()}
                variant="secondary"
              />
            </View>

            <Button
              disabled={isWorking}
              icon="close"
              label={t('generalAlarm.admin.disable')}
              onPress={disableAlarm}
              variant="secondary"
            />
          </>
        ) : participants.length === 0 ? (
          <>
            <ThemedText themeColor="textSecondary">
              {t('generalAlarm.admin.noParticipantsBody')}
            </ThemedText>
            <Button
              disabled
              icon="warning"
              label={t('generalAlarm.admin.enable')}
              onPress={() => undefined}
            />
          </>
        ) : (
          <>
            <ThemedText themeColor="textSecondary">
              {t('generalAlarm.admin.enableBody')}
            </ThemedText>
            <AlarmField
              label={t('generalAlarm.admin.messageLabel')}
              onChangeText={setAlarmTitle}
              placeholder={t('generalAlarm.admin.messagePlaceholder')}
              value={alarmTitle}
            />
            <ThemedText type="smallBold">{t('generalAlarm.admin.departureIn')}</ThemedText>
            <View accessibilityRole="radiogroup" style={styles.chips}>
              {departureMinuteOptions.map((minutes) => (
                <SelectionChip
                  key={minutes}
                  label={t('bus.admin.minutes', { count: minutes })}
                  onPress={() => setDepartureMinutes(minutes)}
                  selected={departureMinutes === minutes}
                />
              ))}
            </View>
            <Button
              disabled={isWorking || alarmTitle.trim().length < 3}
              icon="warning"
              label={t('generalAlarm.admin.enable')}
              onPress={enableAlarm}
            />
          </>
        )}
      </Card>

      {activeBoarding ? (
        <View style={styles.participantList}>
          <View style={styles.outstandingHeading}>
            <ThemedText type="heading">{t('generalAlarm.admin.outstandingTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {t('generalAlarm.admin.outstandingBody', {
                count: summary.total - summary.boarded,
              })}
            </ThemedText>
          </View>
          {orderedParticipants.map((participant) => (
            <AlarmParticipantRow
              activeBoarding={activeBoarding}
              disabled={isWorking}
              key={participant.id}
              now={now}
              onEscalate={() => escalateParticipant(participant.id)}
              onStatus={(status) => setParticipantStatus(participant.id, status)}
              participant={participant}
            />
          ))}
        </View>
      ) : null}

      {isWorking ? <ActivityIndicator color={theme.accent} /> : null}
      {hasActionError ? <ActionError /> : null}
    </View>
  );
}

function AlarmField({
  label,
  onChangeText,
  placeholder,
  value,
}: {
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text },
        ]}
        value={value}
      />
    </View>
  );
}

function SelectionChip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectionChip,
        {
          backgroundColor: selected ? theme.accent : theme.backgroundElement,
          borderColor: selected ? theme.accent : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={selected ? { color: theme.background } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function SummaryValue({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={[styles.summaryValue, { borderColor: color }]}>
      <ThemedText type="title" style={{ color }}>
        {value}
      </ThemedText>
      <ThemedText type="small" style={{ color }}>
        {label}
      </ThemedText>
    </View>
  );
}

function AlarmParticipantRow({
  activeBoarding,
  disabled,
  now,
  onEscalate,
  onStatus,
  participant,
}: {
  activeBoarding: NonNullable<ReturnType<typeof useBusManagement>['activeBoarding']>;
  disabled: boolean;
  now: Date;
  onEscalate: () => void;
  onStatus: (status: BusBoardingStatus) => void;
  participant: BusParticipantState;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const statusColor =
    participant.status === 'boarded'
      ? theme.success
      : participant.status === 'problem'
        ? theme.danger
        : participant.status === 'on_way'
          ? theme.accent
          : participant.status === 'read'
            ? theme.warning
            : theme.textSecondary;
  const reminderDue = isGeneralAlarmReminderDue(activeBoarding, participant, now);
  const showEscalationAction =
    participant.status !== 'boarded' &&
    (reminderDue ||
      participant.status === 'problem' ||
      getGeneralAlarmUrgency(activeBoarding, now) !== 'normal');

  return (
    <Card style={styles.participantRow}>
      <View style={styles.participantHeader}>
        <View style={styles.participantText}>
          <ThemedText type="heading">{participant.display_name}</ThemedText>
          <ThemedText type="smallBold" themeColor="accent">
            {participant.bus_name ?? t('bus.unassignedBus')}
          </ThemedText>
        </View>
        <View style={[styles.currentStatus, { borderColor: statusColor }]}>
          <ThemedText type="smallBold" style={{ color: statusColor }}>
            {t(`bus.status.${participant.status ?? 'not_confirmed'}`)}
          </ThemedText>
        </View>
      </View>

      {reminderDue ? (
        <ThemedText type="smallBold" themeColor="danger">
          {t('generalAlarm.admin.participantReminderDue', {
            name: participant.display_name,
          })}
        </ThemedText>
      ) : null}

      {participant.escalation && participant.status !== 'boarded' ? (
        <ThemedText type="smallBold" themeColor="danger">
          {t('generalAlarm.admin.escalatedBy', {
            name: participant.escalation.escalated_by_display_name,
          })}
        </ThemedText>
      ) : null}

      <View style={styles.rowActions}>
        {statusOptions.map((status) => (
          <Button
            disabled={disabled}
            icon={
              status === 'boarded' || status === 'read'
                ? 'confirm'
                : status === 'problem'
                  ? 'warning'
                  : 'bus'
            }
            key={status}
            label={t(`bus.status.${status}`)}
            onPress={() => onStatus(status)}
            variant={participant.status === status ? 'primary' : 'secondary'}
          />
        ))}
        {showEscalationAction ? (
          <Button
            disabled={disabled}
            icon="warning"
            label={
              participant.escalation
                ? t('generalAlarm.admin.escalateAgain')
                : t('generalAlarm.admin.escalate')
            }
            onPress={onEscalate}
            variant="secondary"
          />
        ) : null}
      </View>
    </Card>
  );
}

function ActionError() {
  const { t } = useI18n();
  return (
    <ThemedText accessibilityLiveRegion="polite" themeColor="danger" type="small">
      {t('generalAlarm.admin.actionError')}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  alarmBanner: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  busClosureCard: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexGrow: 1,
    gap: Spacing.one,
    minWidth: 180,
    padding: Spacing.two,
  },
  busClosureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  container: {
    gap: Spacing.three,
  },
  currentStatus: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  field: {
    gap: Spacing.one,
  },
  formCard: {
    gap: Spacing.three,
  },
  inlineError: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  outstandingHeading: {
    gap: Spacing.one,
  },
  participantHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  participantList: {
    gap: Spacing.two,
  },
  participantRow: {
    gap: Spacing.two,
  },
  participantText: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.72,
  },
  pushDispatchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pushDispatchText: {
    flex: 1,
    minWidth: 180,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  selectionChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  stateCard: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  summaryValue: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexGrow: 1,
    minWidth: 110,
    padding: Spacing.two,
  },
});
