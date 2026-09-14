import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/features/i18n/i18n';
import { useReaderPreferences } from '@/features/storage/useReaderPreferences';
import { useTheme } from '@/hooks/use-theme';

const minimumFontScale = 0.85;
const maximumFontScale = 1.6;

export function ReaderPreferenceControls() {
  const theme = useTheme();
  const { t } = useI18n();
  const {
    preferences,
    setArabicFontScale,
    setShowArabic,
    setShowTranslation,
    setShowTransliteration,
    setTranslationFontScale,
    setTransliterationFontScale,
  } = useReaderPreferences();

  return (
    <ThemedView type="surface" style={[styles.panel, { borderColor: theme.border }]}>
      <VisibilityControl
        label={t('settings.showArabicTitle')}
        onValueChange={setShowArabic}
        value={preferences.showArabic}
      />
      <VisibilityControl
        label={t('settings.showTransliterationTitle')}
        onValueChange={setShowTransliteration}
        value={preferences.showTransliteration}
      />
      <VisibilityControl
        label={t('settings.showTranslationTitle')}
        onValueChange={setShowTranslation}
        value={preferences.showTranslation}
      />

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <FontScaleControl
        label={t('settings.arabicFontTitle')}
        onChange={setArabicFontScale}
        value={preferences.arabicFontScale}
      />
      <FontScaleControl
        label={t('settings.transliterationFontTitle')}
        onChange={setTransliterationFontScale}
        value={preferences.transliterationFontScale}
      />
      <FontScaleControl
        label={t('settings.translationFontTitle')}
        onChange={setTranslationFontScale}
        value={preferences.translationFontScale}
      />
    </ThemedView>
  );
}

function VisibilityControl({
  label,
  onValueChange,
  value,
}: {
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <ThemedText style={styles.label} type="smallBold">
        {label}
      </ThemedText>
      <Switch
        accessibilityLabel={label}
        onValueChange={onValueChange}
        thumbColor={value ? theme.accent : theme.textSecondary}
        value={value}
      />
    </View>
  );
}

function FontScaleControl({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <View style={styles.row}>
      <ThemedText style={styles.label} type="smallBold">
        {label}
      </ThemedText>
      <View style={styles.stepper}>
        <Pressable
          accessibilityLabel={t('settings.decreaseFont', { label })}
          accessibilityRole="button"
          disabled={value <= minimumFontScale}
          onPress={() => onChange(Math.max(minimumFontScale, value - 0.1))}
          style={({ pressed }) => [
            styles.stepButton,
            { borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="heading">−</ThemedText>
        </Pressable>
        <ThemedText style={styles.percentage} type="smallBold">
          {Math.round(value * 100)}%
        </ThemedText>
        <Pressable
          accessibilityLabel={t('settings.increaseFont', { label })}
          accessibilityRole="button"
          disabled={value >= maximumFontScale}
          onPress={() => onChange(Math.min(maximumFontScale, value + 0.1))}
          style={({ pressed }) => [
            styles.stepButton,
            { borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="heading">+</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
    padding: Spacing.three,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'space-between',
  },
  label: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stepButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  percentage: {
    minWidth: 44,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
