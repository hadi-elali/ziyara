import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  getOriginalErrorMessage,
  getSupabaseReadFailureKind,
  SupabaseReadTimeoutError,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';

describe('Supabase read timeouts', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('liefert erfolgreiche Leseergebnisse unverändert zurück', async () => {
    await expect(
      withSupabaseReadTimeout(async (signal) => ({ aborted: signal.aborted, value: 42 }), 50),
    ).resolves.toEqual({ aborted: false, value: 42 });
  });

  it('bricht eine zu lange Leseoperation definiert ab', async () => {
    jest.useFakeTimers();
    const readSignals: AbortSignal[] = [];
    const read = withSupabaseReadTimeout(
      (signal) => {
        readSignals.push(signal);
        return new Promise<never>(() => undefined);
      },
      100,
    );
    const rejection = expect(read).rejects.toBeInstanceOf(SupabaseReadTimeoutError);

    await Promise.resolve();
    jest.advanceTimersByTime(100);

    await rejection;
    expect(readSignals[0]?.aborted).toBe(true);
  });

  it('unterscheidet Offline-, Timeout- und Serverfehler', () => {
    expect(getSupabaseReadFailureKind(new TypeError('Network request failed'))).toBe('offline');
    expect(getSupabaseReadFailureKind(new SupabaseReadTimeoutError(100))).toBe('timeout');
    expect(getSupabaseReadFailureKind(new Error('permission denied'))).toBe('server');
  });

  it('gibt die originale Fehlermeldung ohne Ersatztext zurück', () => {
    expect(getOriginalErrorMessage(new Error('original Supabase message'))).toBe(
      'original Supabase message',
    );
    expect(getOriginalErrorMessage({ message: 'raw PostgREST message' })).toBe(
      'raw PostgREST message',
    );
    expect(getOriginalErrorMessage(null)).toBeNull();
  });
});
