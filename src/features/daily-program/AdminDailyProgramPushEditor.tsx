import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { Spacing } from '@/constants/theme';
import type { DailyProgramItem } from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import { useDailyProgram } from '@/features/daily-program/daily-program-context';
import { useI18n } from '@/features/i18n/i18n';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { localDateTimeFields, parseLocalDateTime } from '@/features/scheduling/local-date-time';
import { useTheme } from '@/hooks/use-theme';

export function AdminDailyProgramPushEditor({ onClose, item }: {
  onClose: () => void;
  item: DailyProgramItem;
}) {
  const theme = useTheme();
  const { isRTL, t } = useI18n();
  const { refresh } = useDailyProgram();
  const [now, setNow] = useState(() => Date.now());
  const [initialFields] = useState(() => localDateTimeFields(
    item.push_scheduled_at ? new Date(item.push_scheduled_at) : new Date(),
  ));
  const [enabled, setEnabled] = useState(item.push_scheduled_at !== null);
  const [selection, setSelection] = useState(() => ({ ...initialFields, following: item.push_scheduled_at === null }));
  const [savedInstant, setSavedInstant] = useState(item.push_scheduled_at);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const currentFields = localDateTimeFields(new Date(now));
  const fields = selection.following ? currentFields : selection;
  // Keep exact saved timestamps, including repeated autumn hours. New untouched
  // inputs follow the current local minute until the admin chooses another time.
  const instant = savedInstant ?? parseLocalDateTime(fields.date, fields.time)?.toISOString() ?? null;
  const currentMinute = fields.date === currentFields.date && fields.time === currentFields.time;
  const valid = !enabled || (instant !== null &&
    (savedInstant !== null || currentMinute || Date.parse(instant) > now));

  const clearFeedback = () => { setIsSaved(false); setError(null); };
  const changeField = (name: 'date' | 'time', value: string) => {
    setSelection((previous) => ({ ...(previous.following ? currentFields : previous), [name]: value, following: false }));
    setSavedInstant(null);
    clearFeedback();
  };

  const save = async () => {
    if (!valid || isSaving) return;
    const saveTime = Date.now();
    const atSave = localDateTimeFields(new Date(saveTime));
    const sendNow = enabled && savedInstant === null && (selection.following ||
      (fields.date === atSave.date && fields.time === atSave.time));
    setNow(saveTime);
    if (enabled && !sendNow && (instant === null || (savedInstant === null && Date.parse(instant) <= saveTime))) {
      setError(t('dailyProgram.admin.pushTimeError'));
      return;
    }
    setIsSaving(true);
    clearFeedback();
    try {
      const scheduledAt = enabled ? (sendNow ? new Date(saveTime).toISOString() : instant) : null;
      const { data, error: saveError } = await supabase.rpc('admin_schedule_daily_program_item_push', {
        p_item_id: item.id,
        p_scheduled_at: scheduledAt,
        p_send_now: sendNow,
      });
      if (saveError) throw saveError;
      const stored = data?.push_scheduled_at ?? scheduledAt;
      setSavedInstant(stored);
      const storedFields = stored ? localDateTimeFields(new Date(stored)) : fields;
      setSelection({ ...storedFields, following: stored === null });
      setIsSaved(true);
      await refresh();
    } catch (cause) {
      setError(getOriginalErrorMessage(cause));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.editor, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={[styles.header, isRTL && styles.rowReverse]}>
        <View style={[styles.title, isRTL && styles.rowReverse]}>
          <SymbolIcon color={theme.accent} name="clock" size={18} />
          <ThemedText type="smallBold">{t('dailyProgram.admin.pushEditorTitle')}</ThemedText>
        </View>
        <Pressable
          accessibilityLabel={t('dailyProgram.admin.pushClose')}
          accessibilityRole="button"
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={onClose}
          style={styles.closeButton}>
          <SymbolIcon color={theme.textSecondary} name="close" size={18} />
        </Pressable>
      </View>
      <View style={[styles.toggle, isRTL && styles.rowReverse]}>
        <ThemedText style={styles.toggleLabel} type="small">{t('dailyProgram.admin.pushEnabled')}</ThemedText>
        <Switch
          accessibilityLabel={t('dailyProgram.admin.pushEnabled')}
          disabled={isSaving}
          onValueChange={(value) => { setEnabled(value); clearFeedback(); }}
          trackColor={{ true: theme.accent, false: theme.border }}
          value={enabled}
        />
      </View>
      {enabled ? (
        <>
          <View style={[styles.fields, isRTL && styles.rowReverse]}>
            <TimeField
              accessibilityLabel={t('dailyProgram.admin.pushDate')}
              editable={!isSaving}
              label={t('dailyProgram.admin.pushDateShort')}
              onChangeText={(value) => changeField('date', value)}
              placeholder="YYYY-MM-DD"
              value={fields.date}
            />
            <TimeField
              accessibilityLabel={t('dailyProgram.admin.pushTime')}
              editable={!isSaving}
              isTime
              label={t('dailyProgram.admin.pushTimeShort')}
              onChangeText={(value) => changeField('time', value)}
              placeholder="HH:MM"
              value={fields.time}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.timeZone}>
            {t('dailyProgram.admin.pushLocalTime', {
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            })}
          </ThemedText>
          {!valid ? (
            <ThemedText type="small" themeColor="danger">{t('dailyProgram.admin.pushTimeError')}</ThemedText>
          ) : null}
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">{t('dailyProgram.admin.pushOffHint')}</ThemedText>
      )}
      <View style={[styles.footer, isRTL && styles.rowReverse]}>
        <Button
          disabled={!valid || isSaving}
          icon="confirm"
          label={t('dailyProgram.admin.pushSave')}
          onPress={() => void save()}
          size="compact"
          style={styles.saveButton}
        />
        {isSaving ? <ActivityIndicator color={theme.accent} /> : null}
      </View>
      {isSaved ? (
        <ThemedText accessibilityLiveRegion="polite" type="smallBold" themeColor="success">
          {t('dailyProgram.admin.pushSaved')}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText accessibilityLiveRegion="polite" type="small" themeColor="danger">{error}</ThemedText>
      ) : null}
    </View>
  );
}

function TimeField({ accessibilityLabel, editable, isTime = false, label, onChangeText, placeholder, value }: {
  accessibilityLabel: string;
  editable: boolean;
  isTime?: boolean;
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.field, isTime ? styles.timeField : styles.dateField]}>
      <ThemedText type="tinyBold" themeColor="textSecondary">{label}</ThemedText>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, isTime && styles.timeInput, {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          color: theme.text,
        }]}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, gap: Spacing.two, padding: 12 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: -Spacing.two },
  title: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: Spacing.two },
  closeButton: { alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, marginRight: -Spacing.two },
  toggle: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: 44 },
  toggleLabel: { flex: 1 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  field: { gap: Spacing.one, flexGrow: 1 },
  dateField: { flexBasis: 130, minWidth: 130 },
  timeField: { flexBasis: 88, minWidth: 88 },
  rowReverse: { flexDirection: 'row-reverse' },
  input: {
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, fontSize: 16,
    minHeight: 52, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two,
    textAlign: 'left', writingDirection: 'ltr', fontVariant: ['tabular-nums'],
  },
  timeZone: { fontSize: 12, lineHeight: 17 },
  timeInput: { fontSize: 24, fontWeight: '600', textAlign: 'center' },
  footer: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  saveButton: { minHeight: 44, paddingHorizontal: Spacing.three },
});
