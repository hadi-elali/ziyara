import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthClient, createClient, processLock } from '@supabase/supabase-js';
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
const verificationUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
const verificationHeaders = { apikey: supabasePublishableKey };
let verificationRequestId = 0;

export async function verifySessionUser(accessToken: string, signal: AbortSignal) {
  // The shared client's getUser() holds its auth lock during the network read
  // and may clear its current session on session_not_found. Isolate this check
  // so a timed-out or obsolete token cannot block or revoke a newer sign-in.
  const verifier = new AuthClient({
    url: verificationUrl,
    headers: verificationHeaders,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
    skipAutoInitialize: true,
    storageKey: `${authStorageKey}-verification-${++verificationRequestId}`,
    fetch: (input, init) => fetch(input, { ...init, signal }),
  });

  try {
    return await verifier.getUser(accessToken);
  } finally {
    await verifier.dispose();
  }
}

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
