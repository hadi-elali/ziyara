import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { Spacing } from '@/constants/theme';
import type { DailyProgram, DailyProgramItem } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { AdminDailyProgramPushEditor } from '@/features/daily-program/AdminDailyProgramPushEditor';
import { useDailyProgram } from '@/features/daily-program/daily-program-context';
import {
  localISODate,
  parseLocalISODate,
  splitProgramDetails,
  visibleDailyPrograms,
} from '@/features/daily-program/daily-program-state';
import { useI18n } from '@/features/i18n/i18n';
import { formatLocalDateTime } from '@/features/scheduling/local-date-time';
import { useTheme } from '@/hooks/use-theme';

const timePrefixPattern = /^(\d{1,2}[:.]\d{2}(?:\s*Uhr)?)\s*(?:[-–—:]\s*)?(.+)$/iu;

export function DailyProgramOverview() {
  const theme = useTheme();
  const { language, t } = useI18n();
  const { isAdmin } = useAuth();
  const {
    hasProgramSnapshot,
    hasSyncError,
    isLoading,
    isRefreshing,
    programs,
    refresh,
    syncErrorMessage,
  } = useDailyProgram();
  const today = localISODate();
  const upcomingPrograms = visibleDailyPrograms(programs, today);
  const programDates = [
    today,
    ...upcomingPrograms
      .map((program) => program.program_date)
      .filter((date) => date !== today),
  ];
  const lastDate = programDates.at(-1) ?? today;
  const programsByDate = new Map(
    programs.map((program) => [program.program_date, program]),
  );

  return (
    <Screen safeAreaEdges={['right', 'bottom', 'left']}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <ThemedText type="eyebrow" themeColor="accent">
            {t('dailyProgram.homeTitle')}
          </ThemedText>
          <ThemedText type="title">{t('dailyProgram.overviewTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t('dailyProgram.overviewIntro')}
          </ThemedText>
          {upcomingPrograms.length > 0 ? (
            <ThemedText type="smallBold" themeColor="accent">
              {t('dailyProgram.dateRange', {
                end: formatRangeDate(lastDate, language),
                start: formatRangeDate(today, language),
              })}
            </ThemedText>
          ) : null}
        </View>
        {isRefreshing ? <ActivityIndicator color={theme.accent} /> : null}
      </View>

      {isLoading ? (
        <Card style={styles.stateCard}>
          <ActivityIndicator color={theme.accent} size="large" />
          <ThemedText themeColor="textSecondary">
            {t('dailyProgram.loading')}
          </ThemedText>
        </Card>
      ) : (
        <>
          {hasSyncError ? (
            <Card style={[styles.errorCard, { borderColor: theme.warning }]}>
              <View style={styles.errorText}>
                <ThemedText type="smallBold" themeColor="warning">
                  {t('dailyProgram.syncErrorTitle')}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {syncErrorMessage}
                </ThemedText>
              </View>
              <Button
                icon="refresh"
                label={t('dailyProgram.retry')}
                onPress={() => void refresh()}
                variant="secondary"
              />
            </Card>
          ) : null}

          {hasProgramSnapshot || !hasSyncError ? (
            <View style={styles.dayList}>
              {programDates.map((date) => (
                <ProgramDay
                  canSchedulePush={isAdmin}
                  date={date}
                  isToday={date === today}
                  key={date}
                  program={programsByDate.get(date)}
                />
              ))}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function ProgramDay({
  canSchedulePush,
  date,
  isToday,
  program,
}: {
  canSchedulePush: boolean;
  date: string;
  isToday: boolean;
  program?: DailyProgram;
}) {
  const theme = useTheme();
  const { isRTL, language, t } = useI18n();
  const detailLines = program ? splitProgramDetails(program.details) : [];
  const agenda = program?.items?.length
    ? [...program.items].sort((left, right) => left.position - right.position)
      .map((item) => ({ key: `item-${item.id}`, line: item.details, item }))
    : detailLines.map((line, index) => ({ key: `legacy-${index}`, line, item: undefined }));

  return (
    <Card
      style={[
        styles.dayCard,
        isToday && {
          backgroundColor: theme.accentSoft,
          borderColor: theme.accent,
        },
      ]}>
      <View style={[styles.dayHeader, isRTL && styles.rowReverse]}>
        <View style={styles.dayHeading}>
          <ThemedText type="heading">{formatWeekday(date, language)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDayDate(date, language)}
          </ThemedText>
        </View>
        <View style={[styles.dayActions, isRTL && styles.rowReverse]}>
          {isToday ? (
            <View
              style={[
                styles.todayBadge,
                { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}>
              <ThemedText style={{ color: theme.background }} type="tinyBold">
                {t('dailyProgram.today')}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>

      {program ? (
        <View style={styles.program}>
          {program.title ? (
            <ThemedText type="subtitle">{program.title}</ThemedText>
          ) : null}
          <View style={styles.agenda}>
            {agenda.map((entry, index) => (
              <AgendaLine
                key={entry.key}
                canSchedulePush={canSchedulePush}
                isLast={index === agenda.length - 1}
                item={entry.item}
                line={entry.line}
                programDate={program.program_date}
              />
            ))}
          </View>
        </View>
      ) : (
        <ThemedText style={styles.emptyDay} themeColor="textSecondary">
          {t('dailyProgram.noProgramForDay')}
        </ThemedText>
      )}
    </Card>
  );
}

function AgendaLine({ canSchedulePush, isLast, item, line, programDate }: {
  canSchedulePush: boolean;
  isLast: boolean;
  item?: DailyProgramItem;
  line: string;
  programDate: string;
}) {
  const theme = useTheme();
  const { isRTL, language, t } = useI18n();
  const [showPushEditor, setShowPushEditor] = useState(false);
  const match = timePrefixPattern.exec(line);
  const time = match?.[1];
  const description = match?.[2] ?? line;

  return (
    <View style={[styles.agendaLine, isRTL && styles.rowReverse]}>
      <View style={styles.timeline}>
        <View style={[styles.timelineDot, canSchedulePush && item && styles.itemTimelineDot, { backgroundColor: theme.accent }]} />
        {!isLast ? (
          <View style={[styles.timelineStem, { backgroundColor: theme.border }]} />
        ) : null}
      </View>
      <View style={styles.agendaBody}>
        <View style={[styles.agendaContent, isRTL && styles.rowReverse]}>
          {time ? (
            <View style={[styles.timeBadge, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold" themeColor="accent">
                {time}
              </ThemedText>
            </View>
          ) : null}
          <ThemedText style={styles.agendaDescription}>{description}</ThemedText>
          {canSchedulePush && item ? (
            <Pressable
              accessibilityLabel={t('dailyProgram.admin.pushConfigure', { item: line, date: programDate, count: item.position + 1 })}
              accessibilityRole="button"
              accessibilityState={{ expanded: showPushEditor }}
              onPress={() => setShowPushEditor(true)}
              style={({ pressed }) => [styles.clockButton, {
                backgroundColor: theme.backgroundElement,
                borderColor: item.push_scheduled_at ? theme.accent : theme.border,
                opacity: pressed ? 0.7 : 1,
              }]}>
              <SymbolIcon color={item.push_scheduled_at ? theme.accent : theme.text} name="clock" size={22} />
            </Pressable>
          ) : null}
        </View>
        {canSchedulePush && item?.push_scheduled_at ? (
          <ThemedText type="small" themeColor="accent">
            {t(item.push_started_at ? 'dailyProgram.admin.pushStarted' : 'dailyProgram.admin.pushScheduled', {
              time: formatLocalDateTime(item.push_scheduled_at, language),
            })}
          </ThemedText>
        ) : null}
        {canSchedulePush && item && showPushEditor ? (
          <AdminDailyProgramPushEditor item={item} onClose={() => setShowPushEditor(false)} />
        ) : null}
      </View>
    </View>
  );
}

function formatRangeDate(value: string, language: string) {
  const date = parseLocalISODate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function formatWeekday(value: string, language: string) {
  const date = parseLocalISODate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(language, { weekday: 'long' }).format(date);
}

function formatDayDate(value: string, language: string) {
  const date = parseLocalISODate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'long',
  }).format(date);
}

const styles = StyleSheet.create({
  agenda: {
    gap: 0,
  },
  agendaBody: {
    flex: 1,
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  agendaContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  agendaDescription: {
    flex: 1,
    lineHeight: 24,
  },
  agendaLine: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dayCard: {
    gap: Spacing.three,
    overflow: 'hidden',
    padding: Spacing.four,
  },
  dayActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  clockButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
  },
  dayHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'space-between',
  },
  dayHeading: {
    flex: 1,
    gap: Spacing.one,
  },
  dayList: {
    gap: Spacing.three,
  },
  emptyDay: {
    fontStyle: 'italic',
  },
  errorCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
  },
  errorText: {
    flex: 1,
    gap: Spacing.one,
  },
  heading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.three,
  },
  headingText: {
    flex: 1,
    gap: Spacing.two,
  },
  program: {
    gap: Spacing.three,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  stateCard: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  timeBadge: {
    borderRadius: 6,
    minWidth: 58,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  timeline: {
    alignItems: 'center',
    width: 12,
  },
  timelineDot: {
    borderRadius: 5,
    height: 10,
    marginTop: 7,
    width: 10,
  },
  itemTimelineDot: { marginTop: 19 },
  timelineStem: {
    flex: 1,
    marginTop: Spacing.one,
    width: 2,
  },
  todayBadge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
