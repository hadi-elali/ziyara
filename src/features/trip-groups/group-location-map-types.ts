import type { MapCoordinate, MapRegion } from '@/features/map/map-types';

export type GroupLocationMapProps = {
  adminCoordinate: MapCoordinate | null;
  leaderCoordinate: MapCoordinate;
};

export function regionForGroupLocations(
  leaderCoordinate: MapCoordinate,
  adminCoordinate: MapCoordinate | null,
): MapRegion {
  if (!adminCoordinate) {
    return {
      ...leaderCoordinate,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    };
  }

  const latitudeDelta = Math.max(
    0.012,
    Math.abs(leaderCoordinate.latitude - adminCoordinate.latitude) * 1.7,
  );
  const longitudeDelta = Math.max(
    0.012,
    Math.abs(leaderCoordinate.longitude - adminCoordinate.longitude) * 1.7,
  );

  return {
    latitude: (leaderCoordinate.latitude + adminCoordinate.latitude) / 2,
    latitudeDelta,
    longitude: (leaderCoordinate.longitude + adminCoordinate.longitude) / 2,
    longitudeDelta,
  };
}
