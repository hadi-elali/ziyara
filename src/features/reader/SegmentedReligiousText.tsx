import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { TextParagraph } from '@/domain/types';
import { useI18n } from '@/features/i18n/i18n';
import type { ReaderPreferences } from '@/features/storage/useReaderPreferences';
import { useTheme } from '@/hooks/use-theme';
import { FormattedReaderText } from './FormattedReaderText';
import { visibleTranslations } from './religious-content-format';

type Props = { paragraphs: TextParagraph[]; preferences: ReaderPreferences };

export function SegmentedReligiousText({ paragraphs, preferences }: Props) {
  const { t } = useI18n();
  const theme = useTheme();
  const visible = paragraphs.filter((p) => (preferences.showArabic && p.arabic.trim())
    || (preferences.showTransliteration && p.transliteration.trim()) || visibleTranslations(p, preferences).length);
  if (!visible.length) return <ThemedText themeColor="textSecondary">{t('reader.noVisibleText')}</ThemedText>;

  return <View style={styles.list}>
    {visible.map((p, index) => {
      const note = p.kind === 'note';
      const heading = p.kind === 'heading';
      return <View key={index} style={[styles.paragraph, {
        backgroundColor: note ? theme.accentSoft : theme.surface,
        borderColor: note ? theme.accent : theme.border, borderLeftWidth: note ? 4 : StyleSheet.hairlineWidth,
      }]}>
        {p.kind === 'note' || p.kind === 'introduction' ? <ThemedText type="smallBold" themeColor="textSecondary">
          {t(`contentImport.kind.${p.kind}`)}
        </ThemedText> : null}
        {preferences.showArabic && p.arabic.trim() ? <FormattedReaderText text={p.arabic} arabic heading={heading}
          fontSize={28 * preferences.arabicFontScale} lineHeight={46 * preferences.arabicFontScale} /> : null}
        {preferences.showTransliteration && p.transliteration.trim() ? <FormattedReaderText text={p.transliteration} italic
          fontSize={15 * preferences.transliterationFontScale} lineHeight={22 * preferences.transliterationFontScale} /> : null}
        {visibleTranslations(p, preferences).map((translation) => <View key={translation.language} style={styles.translation}>
          <ThemedText type="tinyBold" themeColor="textSecondary">{translation.language.toUpperCase()}</ThemedText>
          <FormattedReaderText text={translation.text} heading={heading}
            fontSize={16 * preferences.translationFontScale} lineHeight={24 * preferences.translationFontScale} />
        </View>)}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: Spacing.three },
  paragraph: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.three,
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.four },
  translation: { gap: Spacing.one },
});
