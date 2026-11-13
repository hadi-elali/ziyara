import type { TextParagraph } from '@/domain/types';
import type { ReaderPreferences } from '@/features/storage/useReaderPreferences';
import { stripInlineFormatting } from '@/features/content-import/import-text';

export function visibleTranslations(paragraph: TextParagraph, preferences: ReaderPreferences) {
  if (!preferences.showTranslation) return [];
  const de = paragraph.translation_de.trim();
  const en = paragraph.translation_en?.trim() ?? '';
  const mode = preferences.translationLanguage;
  if (mode === 'both') return [de && { language: 'de', text: de }, en && { language: 'en', text: en }].filter((v): v is { language: string; text: string } => Boolean(v));
  const language = mode === 'en' ? (en ? 'en' : 'de') : (de ? 'de' : 'en');
  const text = language === 'de' ? de : en;
  return text ? [{ language, text }] : [];
}

export function formatVisibleParagraphs(
  paragraphs: TextParagraph[],
  preferences: ReaderPreferences,
) {
  return paragraphs
    .map((paragraph) =>
      [
        preferences.showArabic ? paragraph.arabic : '',
        preferences.showTransliteration ? paragraph.transliteration : '',
        ...visibleTranslations(paragraph, preferences).map((item) => item.text),
      ]
        .map((value) => stripInlineFormatting(value.trim()))
        .filter(Boolean)
        .join('\n'),
    )
    .filter(Boolean)
    .join('\n\n');
}
