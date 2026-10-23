import type { Session, SupportedStorage } from '@supabase/supabase-js';

export function getAuthStorageKey(supabaseUrl: string) {
  // Match Supabase's existing default so installed apps keep their sessions.
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredSession(value: unknown): value is Session {
  return (
    isRecord(value) &&
    typeof value.access_token === 'string' &&
    value.access_token.length > 0 &&
    typeof value.refresh_token === 'string' &&
    value.refresh_token.length > 0 &&
    typeof value.expires_at === 'number' &&
    Number.isFinite(value.expires_at) &&
    typeof value.expires_in === 'number' &&
    Number.isFinite(value.expires_in) &&
    typeof value.token_type === 'string' &&
    isRecord(value.user) &&
    typeof value.user.id === 'string' &&
    value.user.id.length > 0 &&
    typeof value.user.aud === 'string' &&
    typeof value.user.created_at === 'string' &&
    isRecord(value.user.app_metadata) &&
    isRecord(value.user.user_metadata)
  );
}

export async function readStoredSession(
  storage: Pick<SupportedStorage, 'getItem'>,
  storageKey: string,
): Promise<Session | null> {
  try {
    const serialized = await storage.getItem(storageKey);
    const value: unknown = serialized ? JSON.parse(serialized) : null;
    return isStoredSession(value) ? value : null;
  } catch {
    return null;
  }
}
