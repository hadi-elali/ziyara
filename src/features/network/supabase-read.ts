export const supabaseReadTimeoutMs = 10_000;

export type SupabaseReadFailureKind = 'offline' | 'server' | 'timeout';

export class SupabaseReadTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Supabase read timed out after ${timeoutMs} ms.`);
    this.name = 'SupabaseReadTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export async function withSupabaseReadTimeout<T>(
  read: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = supabaseReadTimeoutMs,
) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new SupabaseReadTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => read(controller.signal)),
      timeoutPromise,
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function getSupabaseReadFailureKind(error: unknown): SupabaseReadFailureKind {
  if (
    error instanceof SupabaseReadTimeoutError ||
    (error instanceof Error && error.name === 'AbortError')
  ) {
    return 'timeout';
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'offline';
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof error.message === 'string'
        ? error.message
        : '';

  return /failed to fetch|fetch failed|load failed|network (?:error|request failed)|networkerror/i.test(
    message,
  )
    ? 'offline'
    : 'server';
}

export function getOriginalErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return typeof error === 'string' ? error : null;
}
