import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import type { DailyProgramInput } from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import { useDailyProgram } from '@/features/daily-program/daily-program-context';
import {
  dailyProgramDateRange,
  localISODate,
  parseLocalISODate,
  visibleDailyPrograms,
} from '@/features/daily-program/daily-program-state';
import { useI18n } from '@/features/i18n/i18n';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { useTheme } from '@/hooks/use-theme';

const dayCountOptions = [1, 2, 3, 5, 7] as const;

function draftsForRange(
  startDate: string,
  dayCount: number,
  programs: ReturnType<typeof useDailyProgram>['programs'],
) {
  return dailyProgramDateRange(startDate, dayCount).map((programDate) => {
    const existing = programs.find((program) => program.program_date === programDate);
    return {
      details: existing?.details ?? '',
      program_date: programDate,
      title: existing?.title ?? '',
    } satisfies DailyProgramInput;
  });
}

export function AdminDailyProgramPanel() {
  const theme = useTheme();
  const { language, t } = useI18n();
  const { hasSyncError, isLoading, programs, refresh, syncErrorMessage } = useDailyProgram();
  const [startDate, setStartDate] = useState(localISODate);
  const [dayCount, setDayCount] = useState<number>(1);
  const [drafts, setDrafts] = useState<DailyProgramInput[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isDirty) return;
    const syncTimeout = setTimeout(
      () => setDrafts(draftsForRange(startDate, dayCount, programs)),
      0,
    );
    return () => clearTimeout(syncTimeout);
  }, [dayCount, isDirty, programs, startDate]);

  const upcomingPrograms = useMemo(
    () => visibleDailyPrograms(programs, localISODate()),
    [programs],
  );
  const startDateValid = parseLocalISODate(startDate) !== null;
  const formValid =
    startDateValid &&
    drafts.length === dayCount &&
    drafts.every(
      (draft) =>
        draft.details.trim().length >= 2 &&
        draft.details.trim().length <= 4000 &&
        (draft.title.trim().length === 0 ||
          (draft.title.trim().length >= 2 && draft.title.trim().length <= 120)),
    );

  const changeRange = (nextStartDate: string, nextDayCount: number) => {
    setStartDate(nextStartDate);
    setDayCount(nextDayCount);
    setIsDirty(false);
    setSaveState('idle');
    setSaveErrorMessage(null);
  };

  const updateDraft = (
    programDate: string,
    key: 'details' | 'title',
    value: string,
  ) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.program_date === programDate ? { ...draft, [key]: value } : draft,
      ),
    );
    setIsDirty(true);
    setSaveState('idle');
    setSaveErrorMessage(null);
  };

  const savePrograms = async () => {
    if (!formValid || isSaving) return;
    setIsSaving(true);
    setSaveState('idle');
    setSaveErrorMessage(null);

    try {
      const { error } = await supabase.rpc('admin_upsert_daily_programs', {
        p_programs: drafts.map((draft) => ({
          details: draft.details.trim(),
          program_date: draft.program_date,
          title: draft.title.trim(),
        })),
      });

      if (error) {
        setSaveErrorMessage(error.message);
      } else {
        await refresh();
        setIsDirty(false);
        setSaveState('saved');
      }
    } catch (error) {
      setSaveErrorMessage(getOriginalErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card style={styles.stateCard}>
        <ActivityIndicator color={theme.accent} />
        <ThemedText themeColor="textSecondary">{t('dailyProgram.loading')}</ThemedText>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      {hasSyncError ? (
        <Card style={[styles.inlineState, { borderColor: theme.warning }]}>
          <ThemedText type="small" themeColor="warning">
            {syncErrorMessage}
          </ThemedText>
          <Button
            icon="refresh"
            label={t('dailyProgram.retry')}
            onPress={() => void refresh()}
            variant="secondary"
          />
        </Card>
      ) : null}

      <Card style={styles.formCard}>
        <ThemedText type="heading">{t('dailyProgram.admin.editorTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {t('dailyProgram.admin.editorBody')}
        </ThemedText>

        <View style={styles.field}>
          <ThemedText type="smallBold">{t('dailyProgram.admin.startDate')}</ThemedText>
          <TextInput
            accessibilityLabel={t('dailyProgram.admin.startDate')}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => changeRange(value, dayCount)}
            placeholder="2026-08-28"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: startDateValid ? theme.border : theme.danger,
                color: theme.text,
                textAlign: 'left',
                writingDirection: 'ltr',
              },
            ]}
            value={startDate}
          />
          {!startDateValid ? (
            <ThemedText type="small" themeColor="danger">
              {t('dailyProgram.admin.dateError')}
            </ThemedText>
          ) : null}
        </View>

        <View style={styles.field}>
          <ThemedText type="smallBold">{t('dailyProgram.admin.numberOfDays')}</ThemedText>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {dayCountOptions.map((count) => (
              <DayCountChip
                key={count}
                label={t(
                  count === 1 ? 'dailyProgram.admin.day' : 'dailyProgram.admin.days',
                  { count },
                )}
                onPress={() => changeRange(startDate, count)}
                selected={dayCount === count}
              />
            ))}
          </View>
        </View>

        {drafts.map((draft, index) => (
          <View
            key={draft.program_date}
            style={[styles.dayEditor, { borderColor: theme.border }]}>
            <View style={styles.dayHeading}>
              <ThemedText type="heading">
                {t('dailyProgram.admin.dayNumber', { count: index + 1 })}
              </ThemedText>
              <ThemedText type="smallBold" themeColor="accent">
                {formatProgramDate(draft.program_date, language)}
              </ThemedText>
            </View>
            <LabeledInput
              label={t('dailyProgram.admin.title')}
              onChangeText={(value) => updateDraft(draft.program_date, 'title', value)}
              placeholder={t('dailyProgram.admin.titlePlaceholder')}
              value={draft.title}
            />
            <LabeledInput
              label={t('dailyProgram.admin.details')}
              multiline
              onChangeText={(value) => updateDraft(draft.program_date, 'details', value)}
              placeholder={t('dailyProgram.admin.detailsPlaceholder')}
              value={draft.details}
            />
          </View>
        ))}

        <Button
          disabled={!formValid || isSaving}
          icon="confirm"
          label={
            dayCount === 1
              ? t('dailyProgram.admin.saveOne')
              : t('dailyProgram.admin.saveMany', { count: dayCount })
          }
          onPress={() => void savePrograms()}
        />
        {isSaving ? <ActivityIndicator color={theme.accent} /> : null}
        {saveState === 'saved' ? (
          <ThemedText accessibilityLiveRegion="polite" type="smallBold" themeColor="success">
            {t('dailyProgram.admin.saved')}
          </ThemedText>
        ) : null}
        {saveErrorMessage ? (
          <ThemedText accessibilityLiveRegion="polite" type="small" themeColor="danger">
            {saveErrorMessage}
          </ThemedText>
        ) : null}
      </Card>

      <View style={styles.savedPrograms}>
        <ThemedText type="heading">{t('dailyProgram.admin.publishedTitle')}</ThemedText>
        {upcomingPrograms.length === 0 ? (
          <Card style={styles.stateCard}>
            <ThemedText themeColor="textSecondary">
              {t('dailyProgram.admin.empty')}
            </ThemedText>
          </Card>
        ) : (
          upcomingPrograms.map((program) => (
            <Card key={program.id} style={styles.publishedCard}>
              <View style={styles.publishedText}>
                <ThemedText type="smallBold" themeColor="accent">
                  {formatProgramDate(program.program_date, language)}
                </ThemedText>
                {program.title ? <ThemedText type="heading">{program.title}</ThemedText> : null}
                <ThemedText numberOfLines={3} themeColor="textSecondary">
                  {program.details}
                </ThemedText>
              </View>
              <Button
                icon="confirm"
                label={t('dailyProgram.admin.edit')}
                onPress={() => changeRange(program.program_date, 1)}
                variant="secondary"
              />
            </Card>
          ))
        )}
      </View>
    </View>
  );
}

function formatProgramDate(value: string, language: string) {
  const date = parseLocalISODate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(date);
}

function LabeledInput({
  label,
  multiline = false,
  onChangeText,
  placeholder,
  value,
}: {
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const theme = useTheme();
  const { isRTL } = useI18n();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            color: theme.text,
            textAlign: isRTL ? 'right' : 'left',
            writingDirection: isRTL ? 'rtl' : 'ltr',
          },
        ]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

function DayCountChip({
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
        styles.chip,
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

const styles = StyleSheet.create({
  chip: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.three,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  container: {
    gap: Spacing.three,
  },
  dayEditor: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  dayHeading: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  field: {
    gap: Spacing.one,
  },
  formCard: {
    gap: Spacing.three,
  },
  inlineState: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  multilineInput: {
    minHeight: 120,
  },
  pressed: {
    opacity: 0.72,
  },
  publishedCard: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  publishedText: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 220,
  },
  savedPrograms: {
    gap: Spacing.two,
  },
  stateCard: {
    alignItems: 'center',
    gap: Spacing.two,
  },
});
