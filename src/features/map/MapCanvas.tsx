import { type Ref, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import {
  clampCoordinateToIraq,
  type MapPoint,
  type MapRegion,
} from '@/features/map/map-types';

export type MapCanvasHandle = {
  animateToRegion: (region: MapRegion, duration?: number) => void;
};

export type MapCanvasProps = {
  accessibilityLabel: string;
  initialRegion: MapRegion;
  onPointPress: (id: string) => void;
  points: MapPoint[];
  ref?: Ref<MapCanvasHandle>;
  tileErrorMessage: string;
  zoomInLabel: string;
  zoomOutLabel: string;
};

export function MapCanvas({
  accessibilityLabel,
  initialRegion,
  onPointPress,
  points,
  ref,
}: MapCanvasProps) {
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(
    ref,
    () => ({
      animateToRegion: (region, duration = 650) => {
        mapRef.current?.animateToRegion(
          { ...region, ...clampCoordinateToIraq(region) } as Region,
          duration,
        );
      },
    }),
    [],
  );

  return (
    <MapView
      accessibilityLabel={accessibilityLabel}
      initialRegion={initialRegion}
      mapType="standard"
      maxDelta={10}
      minDelta={0.006}
      onRegionChangeComplete={(region) => {
        const clamped = clampCoordinateToIraq(region);
        if (
          clamped.latitude !== region.latitude ||
          clamped.longitude !== region.longitude
        ) {
          mapRef.current?.animateToRegion({ ...region, ...clamped }, 200);
        }
      }}
      pitchEnabled={false}
      ref={mapRef}
      rotateEnabled={false}
      showsBuildings={false}
      showsIndoors={false}
      showsPointsOfInterests={false}
      showsTraffic={false}
      style={styles.map}>
      {points.map((point) => (
        <Marker
          accessibilityLabel={point.accessibilityLabel}
          coordinate={point.coordinate}
          description={point.description}
          key={point.id}
          onPress={() => onPointPress(point.id)}
          pinColor={point.color}
          title={point.title}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
