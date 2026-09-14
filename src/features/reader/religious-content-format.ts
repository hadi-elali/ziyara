import type { TextParagraph } from '@/domain/types';
import type { ReaderPreferences } from '@/features/storage/useReaderPreferences';

export function formatVisibleParagraphs(
  paragraphs: TextParagraph[],
  preferences: ReaderPreferences,
) {
  return paragraphs
    .map((paragraph) =>
      [
        preferences.showArabic ? paragraph.arabic : '',
        preferences.showTransliteration ? paragraph.transliteration : '',
        preferences.showTranslation ? paragraph.translation_de : '',
      ]
        .map((value) => value.trim())
        .filter(Boolean)
        .join('\n'),
    )
    .filter(Boolean)
    .join('\n\n');
}
