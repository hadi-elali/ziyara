import type { TripNavigationDestination } from '@/domain/database';
import { createPersistentState } from '@/features/storage/persistentState';

export type TripNavigationCache = {
  destinations: TripNavigationDestination[];
  userId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isTripNavigationDestination(value: unknown): value is TripNavigationDestination {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    isNullableNumber(value.trip_id) &&
    typeof value.name === 'string' &&
    isNullableString(value.details) &&
    typeof value.latitude === 'number' &&
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    typeof value.longitude === 'number' &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180 &&
    typeof value.sort_order === 'number' &&
    Number.isFinite(value.sort_order) &&
    isNullableNumber(value.created_by_profile_id) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    isNullableString(value.archived_at)
  );
}

export function parseTripNavigationCache(value: unknown): TripNavigationCache | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  const { destinations, userId } = value;
  if (
    typeof userId !== 'string' ||
    userId.length === 0 ||
    !Array.isArray(destinations) ||
    !destinations.every(
      (destination) =>
        isTripNavigationDestination(destination) && destination.archived_at === null,
    )
  ) {
    return undefined;
  }

  return { destinations, userId };
}

export const useTripNavigationCache = createPersistentState<TripNavigationCache | null>(
  'ziyara.trip-navigation-destinations.v2',
  null,
  parseTripNavigationCache,
);
