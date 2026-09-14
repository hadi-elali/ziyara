import { describe, expect, it } from '@jest/globals';

import {
  defaultReaderPreferences,
  parseReaderPreferences,
} from '@/features/storage/useReaderPreferences';

describe('reader preferences', () => {
  it('migrates the previous Arabic-scale and line-view format', () => {
    expect(parseReaderPreferences({ arabicFontScale: 1.3, lineByLine: false })).toEqual({
      ...defaultReaderPreferences,
      arabicFontScale: 1.3,
    });
  });

  it('validates and clamps every persisted font scale', () => {
    expect(
      parseReaderPreferences({
        ...defaultReaderPreferences,
        arabicFontScale: 5,
        translationFontScale: 0.1,
        transliterationFontScale: 1.25,
      }),
    ).toMatchObject({
      arabicFontScale: 1.6,
      translationFontScale: 0.85,
      transliterationFontScale: 1.25,
    });
    expect(
      parseReaderPreferences({ ...defaultReaderPreferences, showArabic: 'yes' }),
    ).toBeUndefined();
  });
});
