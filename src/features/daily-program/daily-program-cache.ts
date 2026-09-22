import type { DailyProgram } from '@/domain/database';
import { parseLocalISODate } from '@/features/daily-program/daily-program-state';
import { createPersistentState } from '@/features/storage/persistentState';

export type DailyProgramCache = {
  programs: DailyProgram[];
  userId: string;
};

const storageKey = 'ziyara.daily-program.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isDailyProgram(value: unknown): value is DailyProgram {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    typeof value.program_date === 'string' &&
    parseLocalISODate(value.program_date) !== null &&
    typeof value.details === 'string' &&
    isNullableString(value.title) &&
    isNullableFiniteNumber(value.published_by_profile_id) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string'
  );
}

export function parseDailyProgramCache(
  value: unknown,
): DailyProgramCache | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  const { programs, userId } = value;
  if (
    typeof userId !== 'string' ||
    userId.length === 0 ||
    !Array.isArray(programs) ||
    !programs.every(isDailyProgram)
  ) {
    return undefined;
  }

  return { programs, userId };
}

function readInitialWebCache() {
  if (typeof window === 'undefined') return null;

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (storedValue === null) return null;
    return parseDailyProgramCache(JSON.parse(storedValue) as unknown) ?? null;
  } catch {
    return null;
  }
}

export const useDailyProgramCache = createPersistentState<DailyProgramCache | null>(
  storageKey,
  readInitialWebCache(),
  parseDailyProgramCache,
);
