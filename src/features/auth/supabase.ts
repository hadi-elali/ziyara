import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import type { Database } from '@/domain/database';
import { getAuthStorageKey, readStoredSession } from '@/features/auth/session-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Supabase ist nicht konfiguriert. Setze EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in der .env-Datei.',
  );
}

const authStorageKey = getAuthStorageKey(supabaseUrl);

export async function readPersistedSession() {
  if (Platform.OS !== 'web') {
    return readStoredSession(AsyncStorage, authStorageKey);
  }

  // Access can throw when browser storage is disabled; match the SDK's fallback.
  try {
    return typeof window === 'undefined'
      ? null
      : await readStoredSession(window.localStorage, authStorageKey);
  } catch {
    return null;
  }
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    detectSessionInUrl: false,
    lock: processLock,
    persistSession: true,
    storageKey: authStorageKey,
  },
});
