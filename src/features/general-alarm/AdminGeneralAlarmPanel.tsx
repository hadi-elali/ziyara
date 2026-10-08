import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import type { WakeUpCall } from '@/domain/database';
import { useI18n } from '@/features/i18n/i18n';
import { useWakeUpCall } from '@/features/wake-up-call/wake-up-call-context';
import {
  formatWakeUpTime,
  parseWakeUpDateTime,
  wakeUpDateTimeFields,
} from '@/features/wake-up-call/wake-up-call-time';
import { useTheme } from '@/hooks/use-theme';

export function AdminGeneralAlarmPanel() {
  const { t, isRTL, language } = useI18n();
  const theme = useTheme();
  const {
    calls,
    scheduledCalls,
    recipients,
    isLoading,
    error,
    refresh,
    start,
    schedule,
    close,
  } = useWakeUpCall();
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'now' | 'scheduled'>('now');
  const [date, setDate] = useState(() =>
    wakeUpDateTimeFields(new Date(Date.now() + 86400000)).date
  );
  const [time, setTime] = useState('06:00');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hasValidationError, setHasValidationError] = useState(false);
  const inputStyle = [styles.input, {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.border,
    color: theme.text,
    textAlign: isRTL ? 'right' as const : 'left' as const,
  }];
  const reset = () => {
    setMessage('');
    setEditingId(null);
    setHasValidationError(false);
  };
  const submit = async () => {
    if (working) return;
    const scheduledFor = parseWakeUpDateTime(date.trim(), time.trim());
    const latest = new Date();
    latest.setFullYear(latest.getFullYear() + 1);
    if (
      mode === 'scheduled' &&
      (!scheduledFor || scheduledFor.getTime() <= Date.now() ||
        scheduledFor > latest)
    ) {
      setHasValidationError(true);
      return;
    }
    setWorking(true);
    setFeedback(null);
    setHasValidationError(false);
    try {
      const result = mode === 'scheduled' && scheduledFor
        ? await schedule(message, scheduledFor.toISOString(), editingId)
        : await start(message);
      setFeedback(
        result.error ??
          (result.pushFailed
            ? t('wakeUp.pushFailed')
            : mode === 'scheduled'
            ? t('wakeUp.saved')
            : null),
      );
      if (!result.error) reset();
    } finally {
      setWorking(false);
    }
  };
  const closeCall = async (call: WakeUpCall) => {
    if (working) return;
    setWorking(true);
    setFeedback(null);
    try {
      const result = await close(call.id);
      setFeedback(
        result.error ??
          (call.activated_at === null ? t('wakeUp.cancelled') : null),
      );
      if (!result.error && editingId === call.id) reset();
    } finally {
      setWorking(false);
    }
  };
  const edit = (call: WakeUpCall) => {
    if (Date.parse(call.scheduled_for) <= now) {
      setFeedback(t('wakeUp.alreadyDue'));
      void refresh();
      return;
    }
    const fields = wakeUpDateTimeFields(new Date(call.scheduled_for));
    setEditingId(call.id);
    setMessage(call.message);
    setDate(fields.date);
    setTime(fields.time);
    setMode('scheduled');
    setFeedback(null);
    setHasValidationError(false);
  };
  return (
    <View style={styles.stack}>
      {error
        ? (
          <Card style={styles.stack}>
            <ThemedText themeColor='danger'>{error}</ThemedText>
            <Button
              icon='refresh'
              label={t('tripGroups.retry')}
              onPress={() => void refresh()}
              variant='secondary'
            />
          </Card>
        )
        : null}
      <Card style={styles.stack}>
        <ThemedText type='heading'>
          {t(editingId === null ? 'wakeUp.title' : 'wakeUp.edit')}
        </ThemedText>
        <ThemedText type='small' themeColor='textSecondary'>
          {t('wakeUp.description')}
        </ThemedText>
        {editingId === null
          ? (
            <View accessibilityRole='radiogroup' style={styles.row}>
              {(['now', 'scheduled'] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole='radio'
                  accessibilityState={{
                    checked: mode === value,
                    disabled: working,
                  }}
                  disabled={working}
                  onPress={() => {
                    setMode(value);
                    setHasValidationError(false);
                  }}
                  style={[styles.mode, {
                    borderColor: mode === value ? theme.accent : theme.border,
                    backgroundColor: mode === value
                      ? theme.accentSoft
                      : theme.background,
                  }]}
                >
                  <ThemedText type='smallBold'>
                    {t(value === 'now' ? 'wakeUp.now' : 'wakeUp.plan')}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          )
          : null}
        <TextInput
          accessibilityLabel={t('wakeUp.message')}
          placeholder={t('wakeUp.placeholder')}
          placeholderTextColor={theme.textSecondary}
          editable={!working}
          maxLength={500}
          multiline
          value={message}
          onChangeText={setMessage}
          style={[inputStyle, styles.message]}
        />
        {mode === 'scheduled'
          ? (
            <>
              <ThemedText type='smallBold'>{t('wakeUp.timeZone')}</ThemedText>
              <View style={styles.row}>
                <View style={styles.field}>
                  <ThemedText type='smallBold'>{t('wakeUp.date')}</ThemedText>
                  <TextInput
                    accessibilityLabel={t('wakeUp.date')}
                    autoCapitalize='none'
                    autoCorrect={false}
                    editable={!working}
                    maxLength={10}
                    value={date}
                    onChangeText={(value) => {
                      setDate(value);
                      setHasValidationError(false);
                    }}
                    placeholder='YYYY-MM-DD'
                    placeholderTextColor={theme.textSecondary}
                    style={[inputStyle, styles.dateTime]}
                  />
                </View>
                <View style={styles.field}>
                  <ThemedText type='smallBold'>{t('wakeUp.time')}</ThemedText>
                  <TextInput
                    accessibilityLabel={t('wakeUp.time')}
                    autoCapitalize='none'
                    autoCorrect={false}
                    editable={!working}
                    maxLength={5}
                    value={time}
                    onChangeText={(value) => {
                      setTime(value);
                      setHasValidationError(false);
                    }}
                    placeholder='HH:MM'
                    placeholderTextColor={theme.textSecondary}
                    style={[inputStyle, styles.dateTime]}
                  />
                </View>
              </View>
              <ThemedText type='small' themeColor='textSecondary'>
                {t('wakeUp.scheduleHint')}
              </ThemedText>
              {hasValidationError
                ? (
                  <ThemedText themeColor='danger'>
                    {t('wakeUp.invalidTime')}
                  </ThemedText>
                )
                : null}
            </>
          )
          : null}
        <Button
          icon={mode === 'scheduled' ? 'confirm' : 'warning'}
          disabled={working || isLoading || message.trim().length === 0}
          label={t(
            mode === 'now'
              ? 'wakeUp.send'
              : editingId === null
              ? 'wakeUp.schedule'
              : 'wakeUp.saveChanges',
          )}
          onPress={() => void submit()}
        />
        {editingId !== null
          ? (
            <Button
              icon='close'
              disabled={working}
              label={t('tripGroups.admin.cancel')}
              onPress={reset}
              variant='secondary'
            />
          )
          : null}
        {working || isLoading
          ? <ActivityIndicator color={theme.accent} />
          : null}
        {feedback
          ? (
            <View accessibilityLiveRegion='polite'>
              <ThemedText>{feedback}</ThemedText>
            </View>
          )
          : null}
      </Card>
      <ThemedText type='heading'>{t('wakeUp.planned')}</ThemedText>
      {!isLoading && scheduledCalls.length === 0
        ? (
          <ThemedText themeColor='textSecondary'>
            {t('wakeUp.noPlanned')}
          </ThemedText>
        )
        : null}
      {scheduledCalls.map((call) => (
        <Card key={call.id} style={styles.stack}>
          <ThemedText type='smallBold'>
            {formatWakeUpTime(call.scheduled_for, language)} ·{' '}
            {t('wakeUp.timeZone')}
          </ThemedText>
          <ThemedText>{call.message}</ThemedText>
          <View style={styles.row}>
            <Button
              icon='settings'
              disabled={working}
              label={t('wakeUp.edit')}
              onPress={() => edit(call)}
              variant='secondary'
            />
            <Button
              icon='close'
              disabled={working}
              label={t('wakeUp.cancelScheduled')}
              onPress={() => void closeCall(call)}
              variant='secondary'
            />
          </View>
        </Card>
      ))}
      {calls.map((call) => {
        const targets = recipients.filter((recipient) =>
          recipient.call_id === call.id
        );
        return (
          <Card key={call.id} style={styles.stack}>
            <ThemedText type='heading'>{t('wakeUp.active')}</ThemedText>
            <ThemedText type='small' themeColor='textSecondary'>
              {formatWakeUpTime(call.scheduled_for, language)} ·{' '}
              {t('wakeUp.timeZone')}
            </ThemedText>
            <ThemedText>{call.message}</ThemedText>
            <ThemedText themeColor='textSecondary'>
              {t('wakeUp.confirmations', {
                confirmed: targets.filter((recipient) =>
                  recipient.acknowledged_at
                ).length,
                total: targets.length,
              })}
            </ThemedText>
            <Button
              icon='close'
              disabled={working}
              label={t('wakeUp.close')}
              onPress={() => void closeCall(call)}
              variant='secondary'
            />
          </Card>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  field: { flex: 1, minWidth: 140, gap: Spacing.one },
  mode: {
    flex: 1,
    minHeight: 48,
    padding: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    fontSize: 16,
    minHeight: 48,
    padding: Spacing.three,
  },
  message: { minHeight: 100, textAlignVertical: 'top' },
  dateTime: { textAlign: 'left', writingDirection: 'ltr' },
});
