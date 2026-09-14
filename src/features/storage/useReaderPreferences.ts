import { useCallback } from 'react';

import { createPersistentState } from '@/features/storage/persistentState';

export type ReaderPreferences = {
  arabicFontScale: number;
  showArabic: boolean;
  showTranslation: boolean;
  showTransliteration: boolean;
  translationFontScale: number;
  transliterationFontScale: number;
};

export const defaultReaderPreferences: ReaderPreferences = {
  arabicFontScale: 1,
  showArabic: true,
  showTranslation: true,
  showTransliteration: true,
  translationFontScale: 1,
  transliterationFontScale: 1,
};

const minimumFontScale = 0.85;
const maximumFontScale = 1.6;

function parseOptionalBoolean(value: unknown, fallback: boolean) {
  return value === undefined ? fallback : typeof value === 'boolean' ? value : undefined;
}

function parseOptionalFontScale(value: unknown, fallback: number) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(maximumFontScale, Math.max(minimumFontScale, value));
}

export function parseReaderPreferences(value: unknown): ReaderPreferences | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<ReaderPreferences>;
  const arabicFontScale = parseOptionalFontScale(
    candidate.arabicFontScale,
    defaultReaderPreferences.arabicFontScale,
  );
  const transliterationFontScale = parseOptionalFontScale(
    candidate.transliterationFontScale,
    defaultReaderPreferences.transliterationFontScale,
  );
  const translationFontScale = parseOptionalFontScale(
    candidate.translationFontScale,
    defaultReaderPreferences.translationFontScale,
  );
  const showArabic = parseOptionalBoolean(
    candidate.showArabic,
    defaultReaderPreferences.showArabic,
  );
  const showTransliteration = parseOptionalBoolean(
    candidate.showTransliteration,
    defaultReaderPreferences.showTransliteration,
  );
  const showTranslation = parseOptionalBoolean(
    candidate.showTranslation,
    defaultReaderPreferences.showTranslation,
  );

  if (
    arabicFontScale === undefined ||
    transliterationFontScale === undefined ||
    translationFontScale === undefined ||
    showArabic === undefined ||
    showTransliteration === undefined ||
    showTranslation === undefined
  ) {
    return undefined;
  }

  return {
    arabicFontScale,
    showArabic,
    showTranslation,
    showTransliteration,
    translationFontScale,
    transliterationFontScale,
  };
}

const useReaderPreferencesState = createPersistentState(
  'ziyara.reader.preferences',
  defaultReaderPreferences,
  parseReaderPreferences,
);

export function useReaderPreferences() {
  const [preferences, setPreferences] = useReaderPreferencesState();

  const setArabicFontScale = useCallback(
    (arabicFontScale: number) => {
      setPreferences((current) => ({ ...current, arabicFontScale }));
    },
    [setPreferences],
  );

  const setTransliterationFontScale = useCallback(
    (transliterationFontScale: number) => {
      setPreferences((current) => ({ ...current, transliterationFontScale }));
    },
    [setPreferences],
  );

  const setTranslationFontScale = useCallback(
    (translationFontScale: number) => {
      setPreferences((current) => ({ ...current, translationFontScale }));
    },
    [setPreferences],
  );

  const setShowArabic = useCallback(
    (showArabic: boolean) => {
      setPreferences((current) => ({ ...current, showArabic }));
    },
    [setPreferences],
  );

  const setShowTransliteration = useCallback(
    (showTransliteration: boolean) => {
      setPreferences((current) => ({ ...current, showTransliteration }));
    },
    [setPreferences],
  );

  const setShowTranslation = useCallback(
    (showTranslation: boolean) => {
      setPreferences((current) => ({ ...current, showTranslation }));
    },
    [setPreferences],
  );

  return {
    preferences,
    setArabicFontScale,
    setShowArabic,
    setShowTranslation,
    setShowTransliteration,
    setTranslationFontScale,
    setTransliterationFontScale,
  };
}
