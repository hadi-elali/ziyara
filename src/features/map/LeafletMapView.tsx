import * as Linking from 'expo-linking';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import {
  createLeafletFocusScript,
  createLeafletMapHtml,
  createLeafletMapUpdateScript,
  type LeafletFocusRequest,
  type LeafletMapBounds,
  type LeafletMapData,
} from '@/features/map/leaflet-map-html';
import type { MapCoordinate, MapPoint } from '@/features/map/map-types';

export type LeafletMapViewProps = {
  accessibilityLabel: string;
  backgroundColor: string;
  borderColor: string;
  center: MapCoordinate;
  focusRequest?: LeafletFocusRequest;
  interactive?: boolean;
  interactiveSelection?: boolean;
  maxBounds: LeafletMapBounds;
  maxZoom?: number;
  minZoom?: number;
  onCoordinateChange?: (coordinate: MapCoordinate) => void;
  onPointPress?: (id: string) => void;
  points: MapPoint[];
  selectedColor?: string;
  selectedCoordinate?: MapCoordinate | null;
  selectedLabel?: string;
  style?: StyleProp<ViewStyle>;
  surfaceColor: string;
  textColor: string;
  tileErrorMessage: string;
  zoom: number;
  zoomInLabel: string;
  zoomOutLabel: string;
};

type LeafletMapMessage =
  | { type: 'attributionPress' }
  | { coordinate: MapCoordinate; type: 'coordinateChange' }
  | { id: string; type: 'pointPress' }
  | { type: 'ready' };

function isCoordinate(value: unknown): value is MapCoordinate {
  if (!value || typeof value !== 'object') return false;
  const coordinate = value as Partial<MapCoordinate>;
  return (
    typeof coordinate.latitude === 'number' &&
    Number.isFinite(coordinate.latitude) &&
    typeof coordinate.longitude === 'number' &&
    Number.isFinite(coordinate.longitude)
  );
}

function parseMessage(value: string): LeafletMapMessage | null {
  try {
    const message = JSON.parse(value) as Record<string, unknown>;
    if (message.type === 'ready' || message.type === 'attributionPress') {
      return { type: message.type };
    }
    if (message.type === 'pointPress' && typeof message.id === 'string') {
      return { id: message.id, type: 'pointPress' };
    }
    if (message.type === 'coordinateChange' && isCoordinate(message.coordinate)) {
      return { coordinate: message.coordinate, type: 'coordinateChange' };
    }
  } catch {
    // Ignore messages not emitted by the embedded map bridge.
  }
  return null;
}

export function LeafletMapView({
  accessibilityLabel,
  backgroundColor,
  borderColor,
  center,
  focusRequest,
  interactive = true,
  interactiveSelection = false,
  maxBounds,
  maxZoom = 18,
  minZoom = 5,
  onCoordinateChange,
  onPointPress,
  points,
  selectedColor = '#B14B45',
  selectedCoordinate,
  selectedLabel,
  style,
  surfaceColor,
  textColor,
  tileErrorMessage,
  zoom,
  zoomInLabel,
  zoomOutLabel,
}: LeafletMapViewProps) {
  const webViewRef = useRef<WebView>(null);
  const loadedRef = useRef(false);
  const data = useMemo<LeafletMapData>(
    () => ({ points, selectedColor, selectedCoordinate, selectedLabel }),
    [points, selectedColor, selectedCoordinate, selectedLabel],
  );
  const [initialData] = useState(data);
  const pointIds = useMemo(() => new Set(points.map((point) => point.id)), [points]);

  const html = useMemo(
    () =>
      createLeafletMapHtml(
        {
          accessibilityLabel,
          backgroundColor,
          borderColor,
          center,
          interactive,
          interactiveSelection,
          maxBounds,
          maxZoom,
          minZoom,
          surfaceColor,
          textColor,
          tileErrorMessage,
          zoom,
          zoomInLabel,
          zoomOutLabel,
        },
        initialData,
      ),
    [
      accessibilityLabel,
      backgroundColor,
      borderColor,
      center,
      interactive,
      interactiveSelection,
      initialData,
      maxBounds,
      maxZoom,
      minZoom,
      surfaceColor,
      textColor,
      tileErrorMessage,
      zoom,
      zoomInLabel,
      zoomOutLabel,
    ],
  );
  const source = useMemo(() => ({ html }), [html]);

  const synchronizeMap = useCallback(() => {
    if (!loadedRef.current) return;
    webViewRef.current?.injectJavaScript(createLeafletMapUpdateScript(data));
    webViewRef.current?.injectJavaScript(
      createLeafletFocusScript(focusRequest),
    );
  }, [data, focusRequest]);

  useEffect(() => {
    if (!loadedRef.current) return;
    webViewRef.current?.injectJavaScript(createLeafletMapUpdateScript(data));
  }, [data]);

  useEffect(() => {
    if (!loadedRef.current) return;
    webViewRef.current?.injectJavaScript(createLeafletFocusScript(focusRequest));
  }, [focusRequest]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseMessage(event.nativeEvent.data);
      if (!message) return;
      if (message.type === 'ready') {
        loadedRef.current = true;
        synchronizeMap();
      } else if (message.type === 'attributionPress') {
        void Linking.openURL('https://www.openstreetmap.org/copyright');
      } else if (message.type === 'pointPress') {
        if (pointIds.has(message.id)) onPointPress?.(message.id);
      } else if (message.type === 'coordinateChange') {
        onCoordinateChange?.({
          latitude: Math.max(
            maxBounds.minLatitude,
            Math.min(maxBounds.maxLatitude, message.coordinate.latitude),
          ),
          longitude: Math.max(
            maxBounds.minLongitude,
            Math.min(maxBounds.maxLongitude, message.coordinate.longitude),
          ),
        });
      }
    },
    [maxBounds, onCoordinateChange, onPointPress, pointIds, synchronizeMap],
  );

  return (
    <View style={[styles.container, style]}>
      <WebView
        accessibilityLabel={accessibilityLabel}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        applicationNameForUserAgent="Ziyara/1.0"
        cacheEnabled
        cacheMode="LOAD_DEFAULT"
        containerStyle={styles.fill}
        javaScriptEnabled
        mixedContentMode="never"
        onLoadStart={() => {
          loadedRef.current = false;
        }}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === 'about:blank' || request.url.startsWith('data:text/html')) {
            return true;
          }
          void Linking.openURL(request.url);
          return false;
        }}
        originWhitelist={['*']}
        overScrollMode="never"
        ref={webViewRef}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        source={source}
        style={[styles.fill, { backgroundColor }]}
        thirdPartyCookiesEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  fill: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
