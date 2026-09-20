import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { Spacing } from '@/constants/theme';
import { useDailyProgram } from '@/features/daily-program/daily-program-context';
import {
  localISODate,
  parseLocalISODate,
} from '@/features/daily-program/daily-program-state';
import { useI18n } from '@/features/i18n/i18n';
import { dailyProgramRoute } from '@/features/navigation/routes';

const heroText = '#FFFFFF';
const heroTextMuted = '#E4EEE6';

export function DailyProgramHome() {
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
  const todaysProgram = programs.find((program) => program.program_date === today);
  if (isLoading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={heroText} />
        <ThemedText style={styles.mutedText}>{t('dailyProgram.loading')}</ThemedText>
      </View>
      
    );
  }

  if (hasSyncError && !hasProgramSnapshot) {
    return (
      <View accessibilityRole="alert" style={styles.state}>
        <ThemedText style={styles.eyebrow} type="eyebrow">
          {t('dailyProgram.homeTitle')}
        </ThemedText>
        <ThemedText style={styles.heroHeading} type="heading">
          {t('dailyProgram.syncErrorTitle')}
        </ThemedText>
        <ThemedText style={styles.mutedText}>
          {syncErrorMessage}
        </ThemedText>
        <Button
          icon="refresh"
          label={t('dailyProgram.retry')}
          onPress={() => void refresh()}
          variant="secondary"
        />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={t('dailyProgram.openWeekHint')}
      accessibilityLabel={t('dailyProgram.openWeekAccessibility')}
      accessibilityRole="button"
      onPress={() => router.push(dailyProgramRoute())}
      style={({ pressed }) => [styles.preview, pressed && styles.pressed]}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <ThemedText style={styles.eyebrow} type="eyebrow">
            {t('dailyProgram.homeTitle')}
          </ThemedText>
          <ThemedText style={styles.dateText} type="small">
            {formatProgramDate(today, language)}
          </ThemedText>
        </View>
        <View style={styles.statusRow}>
          {isRefreshing ? <ActivityIndicator color={heroText} size="small" /> : null}
          <View style={styles.todayBadge}>
            <ThemedText style={styles.todayText} type="tinyBold">
              {t('dailyProgram.today')}
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.programText}>
        {todaysProgram ? (
          <>
            {todaysProgram.title ? (
              <ThemedText style={styles.heroHeading} type="subtitle">
                {todaysProgram.title}
              </ThemedText>
            ) : null}
            <ThemedText numberOfLines={3} style={styles.details}>
              {todaysProgram.details}
            </ThemedText>
          </>
        ) : (
          <ThemedText style={styles.heroHeading} type="heading">
            {t('dailyProgram.todayEmpty')}
          </ThemedText>
        )}
      </View>

      {hasSyncError ? (
        <ThemedText
          accessibilityLiveRegion="polite"
          style={styles.syncNotice}
          type="small">
          {syncErrorMessage}
        </ThemedText>
      ) : null}

      <View style={styles.openRow}>
        <ThemedText style={styles.openLabel} type="smallBold">
          {t('dailyProgram.openWeek')}
        </ThemedText>
        <SymbolIcon color={heroText} name="chevron" size={20} />
      </View>
    </Pressable>
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

const styles = StyleSheet.create({
  dateText: {
    color: heroTextMuted,
  },
  details: {
    color: heroText,
    lineHeight: 24,
  },
  eyebrow: {
    color: heroTextMuted,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: Spacing.one,
  },
  heroHeading: {
    color: heroText,
  },
  mutedText: {
    color: heroTextMuted,
  },
  openLabel: {
    color: heroText,
    flex: 1,
  },
  openRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.24)',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  pressed: {
    opacity: 0.76,
  },
  preview: {
    flex: 1,
    gap: Spacing.three,
  },
  programText: {
    gap: Spacing.two,
  },
  state: {
    gap: Spacing.two,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  syncNotice: {
    color: heroTextMuted,
  },
  todayBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.34)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  todayText: {
    color: heroText,
  },
});
