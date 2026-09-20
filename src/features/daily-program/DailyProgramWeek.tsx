import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import type { TripDailyProgram } from '@/domain/database';
import { useDailyProgram } from '@/features/daily-program/daily-program-context';
import {
  dailyProgramDateRange,
  localISODate,
  parseLocalISODate,
  splitProgramDetails,
} from '@/features/daily-program/daily-program-state';
import { useI18n } from '@/features/i18n/i18n';
import { useTheme } from '@/hooks/use-theme';

const timePrefixPattern = /^(\d{1,2}[:.]\d{2}(?:\s*Uhr)?)\s*(?:[-–—:]\s*)?(.+)$/iu;

export function DailyProgramWeek() {
  const theme = useTheme();
  const { language, t } = useI18n();
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
  const weekDates = dailyProgramDateRange(today, 7);
  const lastDate = weekDates.at(-1) ?? today;
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
          <ThemedText type="title">{t('dailyProgram.weekTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t('dailyProgram.weekIntro')}
          </ThemedText>
          <ThemedText type="smallBold" themeColor="accent">
            {t('dailyProgram.weekRange', {
              end: formatRangeDate(lastDate, language),
              start: formatRangeDate(today, language),
            })}
          </ThemedText>
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
              {weekDates.map((date) => (
                <ProgramDay
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
  date,
  isToday,
  program,
}: {
  date: string;
  isToday: boolean;
  program?: TripDailyProgram;
}) {
  const theme = useTheme();
  const { language, t } = useI18n();
  const detailLines = program ? splitProgramDetails(program.details) : [];

  return (
    <Card
      style={[
        styles.dayCard,
        isToday && {
          backgroundColor: theme.accentSoft,
          borderColor: theme.accent,
        },
      ]}>
      <View style={styles.dayHeader}>
        <View style={styles.dayHeading}>
          <ThemedText type="heading">{formatWeekday(date, language)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDayDate(date, language)}
          </ThemedText>
        </View>
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

      {program ? (
        <View style={styles.program}>
          {program.title ? (
            <ThemedText type="subtitle">{program.title}</ThemedText>
          ) : null}
          <View style={styles.agenda}>
            {detailLines.map((line, index) => (
              <AgendaLine
                key={`${program.id}-${index}`}
                isLast={index === detailLines.length - 1}
                line={line}
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

function AgendaLine({ isLast, line }: { isLast: boolean; line: string }) {
  const theme = useTheme();
  const { isRTL } = useI18n();
  const match = timePrefixPattern.exec(line);
  const time = match?.[1];
  const description = match?.[2] ?? line;

  return (
    <View style={[styles.agendaLine, isRTL && styles.rowReverse]}>
      <View style={styles.timeline}>
        <View style={[styles.timelineDot, { backgroundColor: theme.accent }]} />
        {!isLast ? (
          <View style={[styles.timelineStem, { backgroundColor: theme.border }]} />
        ) : null}
      </View>
      <View style={[styles.agendaContent, isRTL && styles.rowReverse]}>
        {time ? (
          <View style={[styles.timeBadge, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold" themeColor="accent">
              {time}
            </ThemedText>
          </View>
        ) : null}
        <ThemedText style={styles.agendaDescription}>{description}</ThemedText>
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
  agendaContent: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    paddingBottom: Spacing.three,
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
