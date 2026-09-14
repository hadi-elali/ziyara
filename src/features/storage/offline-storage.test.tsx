import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useBookmarks } from '@/features/storage/useBookmarks';
import { useReaderPreferences } from '@/features/storage/useReaderPreferences';

const actEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null;
let storageState: {
  bookmarks: string[];
  arabicScale: number;
  setArabicScale: (value: number) => void;
  setShowTranslation: (value: boolean) => void;
  setTranslationScale: (value: number) => void;
  setTransliterationScale: (value: number) => void;
  showTranslation: boolean;
  translationScale: number;
  transliterationScale: number;
  toggleBookmark: (key: string) => void;
} | null;

function StorageProbe() {
  const { bookmarks, toggleBookmark } = useBookmarks();
  const {
    preferences,
    setArabicFontScale,
    setShowTranslation,
    setTranslationFontScale,
    setTransliterationFontScale,
  } = useReaderPreferences();

  useEffect(() => {
    storageState = {
      bookmarks,
      arabicScale: preferences.arabicFontScale,
      setArabicScale: setArabicFontScale,
      setShowTranslation,
      setTranslationScale: setTranslationFontScale,
      setTransliterationScale: setTransliterationFontScale,
      showTranslation: preferences.showTranslation,
      translationScale: preferences.translationFontScale,
      transliterationScale: preferences.transliterationFontScale,
      toggleBookmark,
    };
  }, [
    bookmarks,
    preferences.arabicFontScale,
    preferences.showTranslation,
    preferences.translationFontScale,
    preferences.transliterationFontScale,
    setArabicFontScale,
    setShowTranslation,
    setTranslationFontScale,
    setTransliterationFontScale,
    toggleBookmark,
  ]);

  return null;
}

function getStorageState() {
  if (!storageState) {
    throw new Error('Der lokale Speicherzustand wurde noch nicht gerendert.');
  }

  return storageState;
}

describe('offline storage', () => {
  beforeAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(async () => {
    renderer = null;
    storageState = null;
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer?.unmount());
    }
  });

  afterAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  it('speichert Lesezeichen und Reader-Einstellungen ausschließlich lokal', async () => {
    await act(async () => {
      renderer = create(<StorageProbe />);
      await Promise.resolve();
    });

    await act(async () => {
      getStorageState().toggleBookmark('place:shrine-imam-hussain');
      getStorageState().setArabicScale(1.3);
      getStorageState().setTransliterationScale(1.2);
      getStorageState().setTranslationScale(1.1);
      getStorageState().setShowTranslation(false);
      await Promise.resolve();
    });

    expect(getStorageState()).toMatchObject({
      bookmarks: ['place:shrine-imam-hussain'],
      arabicScale: 1.3,
      showTranslation: false,
      translationScale: 1.1,
      transliterationScale: 1.2,
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'ziyara.bookmarks',
      JSON.stringify(['place:shrine-imam-hussain']),
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'ziyara.reader.preferences',
      JSON.stringify({
        arabicFontScale: 1.3,
        showArabic: true,
        showTranslation: false,
        showTransliteration: true,
        translationFontScale: 1.1,
        transliterationFontScale: 1.2,
      }),
    );
  });
});
