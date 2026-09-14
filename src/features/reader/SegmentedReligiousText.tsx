import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import type { TextParagraph } from '@/domain/types';
import { useI18n } from '@/features/i18n/i18n';
import type { ReaderPreferences } from '@/features/storage/useReaderPreferences';
import { useTheme } from '@/hooks/use-theme';

type SegmentedReligiousTextProps = {
  paragraphs: TextParagraph[];
  preferences: ReaderPreferences;
};

export function SegmentedReligiousText({
  paragraphs,
  preferences,
}: SegmentedReligiousTextProps) {
  const { t } = useI18n();
  const theme = useTheme();
  const hasVisibleContent = paragraphs.some(
    (paragraph) =>
      (preferences.showArabic && paragraph.arabic.trim()) ||
      (preferences.showTransliteration && paragraph.transliteration.trim()) ||
      (preferences.showTranslation && paragraph.translation_de.trim()),
  );

  if (!hasVisibleContent) {
    return <ThemedText themeColor="textSecondary">{t('reader.noVisibleText')}</ThemedText>;
  }

  return (
    <View style={styles.list}>
      {paragraphs.map((paragraph, index) => {
        const showArabic = preferences.showArabic && paragraph.arabic.trim();
        const showTransliteration =
          preferences.showTransliteration && paragraph.transliteration.trim();
        const showTranslation =
          preferences.showTranslation && paragraph.translation_de.trim();

        if (!showArabic && !showTransliteration && !showTranslation) {
          return null;
        }

        return (
          <View
            key={`${index}-${paragraph.arabic}-${paragraph.transliteration}`}
            style={[
              styles.paragraph,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}>
            {showArabic ? (
              <ThemedText
                style={[
                  styles.arabic,
                  {
                    fontSize: 28 * preferences.arabicFontScale,
                    lineHeight: 46 * preferences.arabicFontScale,
                  },
                ]}>
                {paragraph.arabic}
              </ThemedText>
            ) : null}

            {showTransliteration ? (
              <ThemedText
                style={[
                  styles.transliteration,
                  {
                    fontSize: 15 * preferences.transliterationFontScale,
                    lineHeight: 22 * preferences.transliterationFontScale,
                  },
                ]}
                themeColor="textSecondary">
                {paragraph.transliteration}
              </ThemedText>
            ) : null}

            {showTranslation ? (
              <ThemedText
                style={[
                  styles.translation,
                  {
                    fontSize: 16 * preferences.translationFontScale,
                    lineHeight: 24 * preferences.translationFontScale,
                  },
                ]}>
                {paragraph.translation_de}
              </ThemedText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.three,
  },
  paragraph: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  arabic: {
    fontFamily: Fonts.serif,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  transliteration: {
    fontStyle: 'italic',
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  translation: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
});
