import * as Location from 'expo-location';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/features/i18n/i18n';
import { LeafletMapView } from '@/features/map/LeafletMapView';
import {
  clampCoordinateToIraq,
  IRAQ_BOUNDS,
  IRAQ_REGION,
  type MapPoint,
} from '@/features/map/map-types';
import type {
  MeetingPointCoordinate,
  MeetingPointPickerProps,
} from '@/features/trip-guidance/meeting-point-picker-types';
import { useTheme } from '@/hooks/use-theme';

type LocationStatus = 'denied' | 'error' | 'idle' | 'loading';

const EMPTY_POINTS: MapPoint[] = [];

export function MeetingPointPicker({
  coordinate,
  fallbackCoordinate,
  onChange,
}: MeetingPointPickerProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const center = coordinate ?? fallbackCoordinate;
  const centerLatitude = center?.latitude;
  const centerLongitude = center?.longitude;
  const visibleCenter = useMemo(
    () =>
      centerLatitude === undefined || centerLongitude === undefined
        ? IRAQ_REGION
        : clampCoordinateToIraq({
            latitude: centerLatitude,
            longitude: centerLongitude,
          }),
    [centerLatitude, centerLongitude],
  );
  const focusRequest = useMemo(
    () =>
      centerLatitude !== undefined && centerLongitude !== undefined
        ? {
            ...visibleCenter,
            key: `${centerLatitude}:${centerLongitude}`,
            zoom: 14,
          }
        : undefined,
    [centerLatitude, centerLongitude, visibleCenter],
  );

  const chooseCoordinate = (nextCoordinate: MeetingPointCoordinate) => {
    onChange(nextCoordinate);
  };

  const requestCurrentLocation = async () => {
    if (locationStatus === 'loading') return;
    setLocationStatus('loading');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationStatus('denied');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      chooseCoordinate({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setLocationStatus('idle');
    } catch {
      setLocationStatus('error');
    }
  };

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{t('guide.admin.mapPickerTitle')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('guide.admin.mapPickerBody')}
      </ThemedText>
      <View style={[styles.mapFrame, { borderColor: theme.border }]}>
        <LeafletMapView
          accessibilityLabel={t('guide.admin.mapPickerAccessibilityLabel')}
          backgroundColor={theme.backgroundElement}
          borderColor={theme.border}
          center={IRAQ_REGION}
          focusRequest={focusRequest}
          interactiveSelection
          maxBounds={IRAQ_BOUNDS}
          onCoordinateChange={chooseCoordinate}
          points={EMPTY_POINTS}
          selectedColor={theme.danger}
          selectedCoordinate={coordinate}
          selectedLabel={t('guide.admin.mapPickerMarkerLabel')}
          style={styles.map}
          surfaceColor={theme.surface}
          textColor={theme.text}
          tileErrorMessage={t('map.tilesUnavailable')}
          zoom={5}
          zoomInLabel={t('map.zoomIn')}
          zoomOutLabel={t('map.zoomOut')}
        />
      </View>
      <View style={styles.actions}>
        <Button
          disabled={locationStatus === 'loading'}
          icon="map"
          label={
            locationStatus === 'loading'
              ? t('guide.admin.mapPickerLocating')
              : t('guide.admin.mapPickerUseCurrent')
          }
          onPress={() => void requestCurrentLocation()}
          style={styles.action}
          variant="secondary"
        />
        {coordinate ? (
          <Button
            icon="close"
            label={t('guide.admin.mapPickerClear')}
            onPress={() => onChange(null)}
            style={styles.action}
            variant="ghost"
          />
        ) : null}
      </View>
      {locationStatus === 'denied' ? (
        <ThemedText accessibilityLiveRegion="polite" type="small" themeColor="warning">
          {t('guide.admin.mapPickerDenied')}
        </ThemedText>
      ) : locationStatus === 'error' ? (
        <ThemedText accessibilityLiveRegion="polite" type="small" themeColor="danger">
          {t('guide.admin.mapPickerError')}
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor={coordinate ? 'accent' : 'textSecondary'}>
        {coordinate
          ? t('guide.admin.mapPickerSelected', {
              latitude: coordinate.latitude.toFixed(6),
              longitude: coordinate.longitude.toFixed(6),
            })
          : t('guide.admin.mapPickerEmpty')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    flexGrow: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  container: {
    gap: Spacing.two,
  },
  map: {
    flex: 1,
  },
  mapFrame: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 320,
    overflow: 'hidden',
  },
});
