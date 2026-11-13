import { describe, expect, it } from '@jest/globals';
import { applyGermanTranslation, importMixedText, normalizeImportedText } from './import-text';
import { formatVisibleParagraphs, visibleTranslations } from '@/features/reader/religious-content-format';
import { defaultReaderPreferences, parseReaderPreferences } from '@/features/storage/useReaderPreferences';

// Synthetic language samples, not devotional content.
describe('full-text reader import', () => {
  it('imports complete unformatted three-line sections with ordinary blank lines between them', () => {
    const samples = [
      { arabic: 'نص تجريبي أول', transliteration: "latin 'one", translation_en: 'First English sample?' },
      { arabic: 'نص تجريبي ثان', transliteration: "latin 'two", translation_en: 'Second English sample?' },
      { arabic: 'نص تجريبي ثالث', transliteration: 'latin `three', translation_en: 'Third English sample' },
      { arabic: 'نص تجريبي رابع', transliteration: 'latin four', translation_en: 'Fourth English sample?' },
    ];
    const raw = samples.map((p) => [p.arabic, p.transliteration, p.translation_en].join('\n')).join('\n\n');
    const result = importMixedText(raw);
    expect(result.issues).toEqual([]);
    expect(result.paragraphs).toHaveLength(4);
    expect(result.paragraphs).toMatchObject(samples);
  });
  it('uses the next Arabic line to begin a section without requiring any blank separator', () => {
    const result = importMixedText('نص تجريبي أول\nplain latin one\nEnglish one\nنص تجريبي ثان\nplain latin two\nEnglish two');
    expect(result.issues).toEqual([]);
    expect(result.paragraphs).toMatchObject([
      { arabic: 'نص تجريبي أول', transliteration: 'plain latin one', translation_en: 'English one' },
      { arabic: 'نص تجريبي ثان', transliteration: 'plain latin two', translation_en: 'English two' },
    ]);
  });
  it('preserves wrapped Arabic and English lines in an unformatted section', () => {
    const result = importMixedText('\r\n  نص تجريبي\r\nسطر آخر\r\nplain latin\r\nEnglish line one\r\nEnglish line two\r\n');
    expect(result.issues).toEqual([]);
    expect(result.paragraphs).toMatchObject([{
      arabic: 'نص تجريبي\nسطر آخر', transliteration: 'plain latin', translation_en: 'English line one\nEnglish line two',
    }]);
  });
  it('accepts plain and Markdown-formatted sections in the same source', () => {
    const result = importMixedText('نص تجريبي أول\n###### *marked latin*&#xA;English one\n\nنص تجريبي ثان\nplain latin\nEnglish two');
    expect(result.issues).toEqual([]);
    expect(result.paragraphs.map((p) => p.transliteration)).toEqual(['marked latin', 'plain latin']);
  });
  it('keeps an incomplete plain section visible and flags it for review', () => {
    const result = importMixedText('نص تجريبي أول\nA single Latin line\n\nنص تجريبي ثان\nplain latin two\nEnglish two');
    expect(result.issues).toEqual([{ index: 0, reason: 'missingTranslation' }]);
    expect(result.paragraphs).toMatchObject([
      { arabic: 'نص تجريبي أول', transliteration: 'A single Latin line', translation_en: '' },
      { arabic: 'نص تجريبي ثان', transliteration: 'plain latin two', translation_en: 'English two' },
    ]);
  });
  it('keeps the three source components together across blank lines and HTML newlines', () => {
    const imported = importMixedText("نص تجريبي أول\n\n###### *latin one*&#xA;English one\n\nنص تجريبي ثان\n\n###### *latin two* English two");
    expect(imported.issues).toEqual([]);
    expect(imported.paragraphs).toMatchObject([
      { arabic: 'نص تجريبي أول', transliteration: 'latin one', translation_en: 'English one' },
      { arabic: 'نص تجريبي ثان', transliteration: 'latin two', translation_en: 'English two' },
    ]);
  });
  it('preserves genuine line breaks within the same language', () => {
    const imported = importMixedText('نص تجريبي\nسطر تجريبي\n*latin*\nEnglish first line\nEnglish second line');
    expect(imported.paragraphs[0]).toMatchObject({ arabic: 'نص تجريبي\nسطر تجريبي', translation_en: 'English first line\nEnglish second line' });
  });
  it('preserves introductions and notes without guessing Latin language or role', () => {
    const imported = importMixedText('Introductory prose\n\nنص تجريبي\n*latin* English\n\n> **An editorial note**\n\n## A heading');
    expect(imported.issues).toEqual([{ index: 0, reason: 'unassigned' }]);
    expect(imported.paragraphs.map((p) => p.kind)).toEqual(['note', 'text', 'note', 'heading']);
    expect(imported.paragraphs[2].translation_en).toBe('**An editorial note**');
  });
  it('flags missing transliteration and ambiguous mixed-script lines without dropping text', () => {
    const imported = importMixedText('نص تجريبي\n\nUnclassified prose\n\nنص مع mixed Latin');
    expect(imported.issues).toEqual(expect.arrayContaining([
      { index: 0, reason: 'missingTransliteration' }, { index: 1, reason: 'unassigned' }, { index: 2, reason: 'unassigned' },
    ]));
    expect(imported.paragraphs[2].translation_en).toBe('نص مع mixed Latin');
  });
  it('does not crash or reinterpret malformed entities recursively', () => {
    expect(normalizeImportedText('a&#xA;b&#10;c<br/>d\r\ne&nbsp;&amp;#xA;&#x110000;')).toBe('a\nb\nc\nd\ne &#xA;&#x110000;');
    expect(normalizeImportedText('a&#13;b&#13;&#10;c')).toBe('a\nb\nc');
  });
  it('does not confuse bold source headings with italic transliteration', () => {
    const imported = importMixedText('###### **An editorial heading**');
    expect(imported.paragraphs[0]).toMatchObject({ kind: 'heading', translation_en: '**An editorial heading**', transliteration: '' });
  });
  it('never shifts translations when German paragraph counts differ', () => {
    const original = importMixedText('نص تجريبي\n*one* English one\n\nنص آخر\n*two* English two').paragraphs;
    expect(applyGermanTranslation(original, 'Nur ein Absatz')).toEqual({ paragraphs: original, matches: false, expected: 2, actual: 1 });
    expect(original.every((p) => p.translation_de === '')).toBe(true);
  });
  it('assigns whole German paragraphs while skipping introduction, heading and note blocks', () => {
    const original = importMixedText('## Heading\nنص تجريبي\n*one* English one\n> Note\nنص آخر\n*two* English two').paragraphs;
    const result = applyGermanTranslation(original, 'Deutsch eins\nzweite Zeile\n\nDeutsch zwei');
    expect(result.matches).toBe(true);
    expect(result.paragraphs.map((p) => p.translation_de)).toEqual(['', 'Deutsch eins\nzweite Zeile', '', 'Deutsch zwei']);
  });
});

describe('reader translations and copy', () => {
  const p = { arabic: 'نص تجريبي', transliteration: 'latin', translation_de: '**Deutsch**', translation_en: '*English*' };
  it('offers both translations and falls back to the one that exists', () => {
    expect(visibleTranslations(p, { ...defaultReaderPreferences, translationLanguage: 'both' }).map((v) => v.language)).toEqual(['de', 'en']);
    expect(visibleTranslations({ ...p, translation_de: '' }, defaultReaderPreferences)).toEqual([{ language: 'en', text: '*English*' }]);
  });
  it('copies only visible languages without Markdown delimiters', () => {
    expect(formatVisibleParagraphs([p], { ...defaultReaderPreferences, showArabic: false, showTransliteration: false, translationLanguage: 'en' })).toBe('English');
    expect(formatVisibleParagraphs([p], { ...defaultReaderPreferences, showArabic: false, showTransliteration: false, showTranslation: false })).toBe('');
  });
  it('migrates old settings and rejects an unknown translation mode', () => {
    expect(parseReaderPreferences({ arabicFontScale: 1 })).toMatchObject({ translationLanguage: 'de' });
    expect(parseReaderPreferences({ translationLanguage: 'unknown' })).toBeUndefined();
  });
});
