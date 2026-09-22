import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/features/i18n/i18n';
import type { MapCoordinate } from '@/features/map/map-types';
import type { GroupLocationMapProps } from '@/features/trip-groups/group-location-map-types';
import { useTheme } from '@/hooks/use-theme';

function markerPosition(
  coordinate: MapCoordinate,
  leaderCoordinate: MapCoordinate,
  adminCoordinate: MapCoordinate | null,
) {
  const coordinates = adminCoordinate
    ? [leaderCoordinate, adminCoordinate]
    : [leaderCoordinate];
  const latitudes = coordinates.map((item) => item.latitude);
  const longitudes = coordinates.map((item) => item.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeSpan = Math.max(maxLatitude - minLatitude, 0.002);
  const longitudeSpan = Math.max(maxLongitude - minLongitude, 0.002);

  return {
    left: `${15 + ((coordinate.longitude - minLongitude) / longitudeSpan) * 70}%` as `${number}%`,
    top: `${15 + ((maxLatitude - coordinate.latitude) / latitudeSpan) * 70}%` as `${number}%`,
  };
}

export function GroupLocationMap({
  adminCoordinate,
  leaderCoordinate,
}: GroupLocationMapProps) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <View
      accessibilityLabel={t('tripGroups.admin.locationMapLabel')}
      style={[
        styles.frame,
        { backgroundColor: theme.accentSoft, borderColor: theme.border },
      ]}>
      <View style={[styles.horizontalLine, { borderColor: theme.border }]} />
      <View style={[styles.verticalLine, { borderColor: theme.border }]} />
      <ThemedText style={styles.mapLabel} themeColor="textSecondary" type="tinyBold">
        {t('tripGroups.admin.locationMapLabel')}
      </ThemedText>
      <View
        accessibilityLabel={t('tripGroups.admin.leaderMarker')}
        style={[
          styles.marker,
          markerPosition(leaderCoordinate, leaderCoordinate, adminCoordinate),
          { backgroundColor: theme.accent, borderColor: theme.surface },
        ]}
      />
      {adminCoordinate ? (
        <View
          accessibilityLabel={t('tripGroups.admin.adminMarker')}
          style={[
            styles.marker,
            markerPosition(adminCoordinate, leaderCoordinate, adminCoordinate),
            styles.adminMarker,
            { backgroundColor: theme.location, borderColor: theme.surface },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  adminMarker: { height: 20, marginLeft: -10, marginTop: -10, width: 20 },
  frame: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 190,
    overflow: 'hidden',
    position: 'relative',
  },
  horizontalLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    left: 0,
    position: 'absolute',
    right: 0,
    top: '50%',
  },
  mapLabel: { left: Spacing.two, position: 'absolute', top: Spacing.two },
  marker: {
    borderRadius: 999,
    borderWidth: 3,
    height: 24,
    marginLeft: -12,
    marginTop: -12,
    position: 'absolute',
    width: 24,
  },
  verticalLine: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    left: '50%',
    position: 'absolute',
    top: 0,
  },
});
