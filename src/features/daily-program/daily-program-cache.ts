import type { DailyProgram, DailyProgramItem } from '@/domain/database';
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

function isOptionalTimestamp(value: unknown) {
  return value === undefined || value === null ||
    (typeof value === 'string' && Number.isFinite(Date.parse(value)));
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
    isOptionalTimestamp(value.push_scheduled_at) &&
    isOptionalTimestamp(value.push_started_at) &&
    (value.items === undefined || (Array.isArray(value.items) &&
      value.items.every((item) => isDailyProgramItem(item) && item.program_id === value.id))) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string'
  );
}

function isDailyProgramItem(value: unknown): value is DailyProgramItem {
  return isRecord(value) &&
    typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0 &&
    typeof value.program_id === 'number' && Number.isSafeInteger(value.program_id) &&
    typeof value.position === 'number' && Number.isSafeInteger(value.position) && value.position >= 0 &&
    typeof value.details === 'string' && value.details.trim().length > 0 &&
    isNullableString(value.push_scheduled_at) && isOptionalTimestamp(value.push_scheduled_at) &&
    isNullableString(value.push_started_at) && isOptionalTimestamp(value.push_started_at);
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

  return {
    programs: programs.map((program) => ({
      ...program,
      push_scheduled_at: program.push_scheduled_at ?? null,
      push_started_at: program.push_started_at ?? null,
      items: program.items ?? [],
    })),
    userId,
  };
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
