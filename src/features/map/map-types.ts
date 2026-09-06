export type MapCoordinate = {
  latitude: number;
  longitude: number;
};

export type MapRegion = MapCoordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MapPoint = {
  accessibilityLabel: string;
  color: string;
  coordinate: MapCoordinate;
  description?: string;
  id: string;
  title: string;
};

export const IRAQ_BOUNDS = {
  maxLatitude: 37.5,
  maxLongitude: 48.8,
  minLatitude: 29,
  minLongitude: 38.8,
} as const;

export const IRAQ_REGION: MapRegion = {
  latitude: 33.1,
  latitudeDelta: 7.5,
  longitude: 43.9,
  longitudeDelta: 7.5,
};

export function clampCoordinateToIraq(
  coordinate: MapCoordinate,
): MapCoordinate {
  return {
    latitude: Math.max(
      IRAQ_BOUNDS.minLatitude,
      Math.min(IRAQ_BOUNDS.maxLatitude, coordinate.latitude),
    ),
    longitude: Math.max(
      IRAQ_BOUNDS.minLongitude,
      Math.min(IRAQ_BOUNDS.maxLongitude, coordinate.longitude),
    ),
  };
}

export function zoomForRegion(region: MapRegion) {
  const largestDelta = Math.max(region.latitudeDelta, region.longitudeDelta);
  return Math.max(5, Math.min(18, Math.round(Math.log2(360 / largestDelta))));
}
