import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '@/features/i18n/i18n';
import { LeafletMapView } from '@/features/map/LeafletMapView';
import type { MapPoint } from '@/features/map/map-types';
import type { GroupLocationMapProps } from '@/features/trip-groups/group-location-map-types';
import { regionForGroupLocations } from '@/features/trip-groups/group-location-map-types';
import { useTheme } from '@/hooks/use-theme';

const WORLD_BOUNDS = {
  maxLatitude: 85,
  maxLongitude: 180,
  minLatitude: -85,
  minLongitude: -180,
};

function zoomForDelta(delta: number) {
  return Math.max(2, Math.min(17, Math.floor(Math.log2(360 / Math.max(delta, 0.01))) - 1));
}

export function GroupLocationMap({
  adminCoordinate,
  leaderCoordinate,
}: GroupLocationMapProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const region = regionForGroupLocations(leaderCoordinate, adminCoordinate);
  const mapZoom = zoomForDelta(Math.max(region.latitudeDelta, region.longitudeDelta));
  const focusRequest = useMemo(
    () => ({
      key: `${region.latitude}:${region.longitude}:${mapZoom}`,
      latitude: region.latitude,
      longitude: region.longitude,
      zoom: mapZoom,
    }),
    [mapZoom, region.latitude, region.longitude],
  );
  const points = useMemo<MapPoint[]>(
    () => [
      {
        accessibilityLabel: t('tripGroups.admin.leaderMarker'),
        color: theme.accent,
        coordinate: leaderCoordinate,
        id: 'leader',
        title: t('tripGroups.admin.leaderMarker'),
      },
      ...(adminCoordinate
        ? [
            {
              accessibilityLabel: t('tripGroups.admin.adminMarker'),
              color: theme.location,
              coordinate: adminCoordinate,
              id: 'admin',
              title: t('tripGroups.admin.adminMarker'),
            },
          ]
        : []),
    ],
    [adminCoordinate, leaderCoordinate, t, theme.accent, theme.location],
  );

  return (
    <View style={[styles.frame, { borderColor: theme.border }]}>
      <LeafletMapView
        accessibilityLabel={t('tripGroups.admin.locationMapLabel')}
        backgroundColor={theme.backgroundElement}
        borderColor={theme.border}
        center={region}
        focusRequest={focusRequest}
        interactive={false}
        maxBounds={WORLD_BOUNDS}
        minZoom={2}
        points={points}
        style={styles.map}
        surfaceColor={theme.surface}
        textColor={theme.text}
        tileErrorMessage={t('map.tilesUnavailable')}
        zoom={mapZoom}
        zoomInLabel={t('map.zoomIn')}
        zoomOutLabel={t('map.zoomOut')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 190,
    overflow: 'hidden',
  },
  map: { flex: 1 },
});
