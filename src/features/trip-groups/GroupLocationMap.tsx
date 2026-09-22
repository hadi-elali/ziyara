import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { useI18n } from '@/features/i18n/i18n';
import type { GroupLocationMapProps } from '@/features/trip-groups/group-location-map-types';
import { regionForGroupLocations } from '@/features/trip-groups/group-location-map-types';
import { useTheme } from '@/hooks/use-theme';

export function GroupLocationMap({
  adminCoordinate,
  leaderCoordinate,
}: GroupLocationMapProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const mapRef = useRef<MapView>(null);
  const adminLatitude = adminCoordinate?.latitude;
  const adminLongitude = adminCoordinate?.longitude;
  const leaderLatitude = leaderCoordinate.latitude;
  const leaderLongitude = leaderCoordinate.longitude;
  const region = useMemo(
    () =>
      regionForGroupLocations(
        { latitude: leaderLatitude, longitude: leaderLongitude },
        adminLatitude === undefined || adminLongitude === undefined
          ? null
          : { latitude: adminLatitude, longitude: adminLongitude },
      ),
    [
      adminLatitude,
      adminLongitude,
      leaderLatitude,
      leaderLongitude,
    ],
  );

  useEffect(() => {
    mapRef.current?.animateToRegion(region as Region, 400);
  }, [region]);

  return (
    <View style={[styles.frame, { borderColor: theme.border }]}>
      <MapView
        accessibilityLabel={t('tripGroups.admin.locationMapLabel')}
        initialRegion={region}
        mapType="standard"
        pitchEnabled={false}
        ref={mapRef}
        rotateEnabled={false}
        showsBuildings={false}
        showsIndoors={false}
        showsPointsOfInterests={false}
        showsTraffic={false}
        style={styles.map}>
        <Marker
          accessibilityLabel={t('tripGroups.admin.leaderMarker')}
          coordinate={leaderCoordinate}
          pinColor={theme.accent}
          title={t('tripGroups.admin.leaderMarker')}
        />
        {adminCoordinate ? (
          <Marker
            accessibilityLabel={t('tripGroups.admin.adminMarker')}
            coordinate={adminCoordinate}
            pinColor={theme.location}
            title={t('tripGroups.admin.adminMarker')}
          />
        ) : null}
      </MapView>
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
