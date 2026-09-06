import { type Ref, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { LeafletMapView } from '@/features/map/LeafletMapView';
import {
  clampCoordinateToIraq,
  IRAQ_BOUNDS,
  type MapRegion,
  zoomForRegion,
} from '@/features/map/map-types';
import { useTheme } from '@/hooks/use-theme';

import type { MapCanvasHandle, MapCanvasProps } from './MapCanvas';

export function MapCanvas({
  accessibilityLabel,
  initialRegion,
  onPointPress,
  points,
  ref,
  tileErrorMessage,
  zoomInLabel,
  zoomOutLabel,
}: MapCanvasProps & { ref?: Ref<MapCanvasHandle> }) {
  const theme = useTheme();
  const [focusRequest, setFocusRequest] = useState<
    | (Pick<MapRegion, 'latitude' | 'longitude'> & {
        key: string;
        zoom: number;
      })
    | undefined
  >();
  const focusSequence = useRef(0);
  const initialZoom = useMemo(() => zoomForRegion(initialRegion), [initialRegion]);

  useImperativeHandle(
    ref,
    () => ({
      animateToRegion: (region) => {
        const coordinate = clampCoordinateToIraq(region);
        focusSequence.current += 1;
        setFocusRequest({
          key: String(focusSequence.current),
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          zoom: zoomForRegion(region),
        });
      },
    }),
    [],
  );

  return (
    <LeafletMapView
      accessibilityLabel={accessibilityLabel}
      backgroundColor={theme.backgroundElement}
      borderColor={theme.border}
      center={initialRegion}
      focusRequest={focusRequest}
      maxBounds={IRAQ_BOUNDS}
      onPointPress={onPointPress}
      points={points}
      style={styles.map}
      surfaceColor={theme.surface}
      textColor={theme.text}
      tileErrorMessage={tileErrorMessage}
      zoom={initialZoom}
      zoomInLabel={zoomInLabel}
      zoomOutLabel={zoomOutLabel}
    />
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
