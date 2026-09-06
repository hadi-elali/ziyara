import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/features/i18n/i18n';
import { localizeCountryName } from '@/features/i18n/localizedData';
import { LeafletMapView } from '@/features/map/LeafletMapView';
import { IRAQ_BOUNDS, zoomForRegion } from '@/features/map/map-types';
import { useTheme } from '@/hooks/use-theme';

import type { CityLocationMapProps } from './city-location-map-types';

export function CityLocationMap({ city, placeCount, region }: CityLocationMapProps) {
  const theme = useTheme();
  const { language, t } = useI18n();
  const points = useMemo(
    () => [
      {
        accessibilityLabel: city,
        color: theme.accent,
        coordinate: region,
        id: `city:${city}`,
        title: city,
      },
    ],
    [city, region, theme.accent],
  );

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.mapFrame,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <LeafletMapView
          accessibilityLabel={`${t('nav.map')}: ${city}`}
          backgroundColor={theme.backgroundElement}
          borderColor={theme.border}
          center={region}
          interactive={false}
          maxBounds={IRAQ_BOUNDS}
          maxZoom={18}
          minZoom={5}
          points={points}
          style={styles.map}
          surfaceColor={theme.surface}
          textColor={theme.text}
          tileErrorMessage={t('map.tilesUnavailable')}
          zoom={zoomForRegion(region)}
          zoomInLabel={t('map.zoomIn')}
          zoomOutLabel={t('map.zoomOut')}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {city}, {localizeCountryName('Iraq', language)} ·{' '}
        {t(placeCount === 1 ? 'city.placeCount.one' : 'city.placeCount.many', {
          count: placeCount,
        })}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  map: {
    flex: 1,
  },
  mapFrame: {
    aspectRatio: 1.85,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: '100%',
  },
});
