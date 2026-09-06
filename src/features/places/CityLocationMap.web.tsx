import { createElement, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/features/i18n/i18n';
import { localizeCountryName } from '@/features/i18n/localizedData';
import { useTheme } from '@/hooks/use-theme';

import type { MapRegion } from '@/features/map/map-types';

import type { CityLocationMapProps } from './city-location-map-types';

function osmEmbedUrl(region: MapRegion) {
  const latitudeDelta = Math.max(0.006, region.latitudeDelta);
  const longitudeDelta = Math.max(0.006, region.longitudeDelta);
  const west = region.longitude - longitudeDelta / 2;
  const east = region.longitude + longitudeDelta / 2;
  const south = region.latitude - latitudeDelta / 2;
  const north = region.latitude + latitudeDelta / 2;

  return `https://www.openstreetmap.org/export/embed.html?bbox=${west},${south},${east},${north}&layer=mapnik&marker=${region.latitude},${region.longitude}`;
}

export function CityLocationMap({ city, placeCount, region }: CityLocationMapProps) {
  const theme = useTheme();
  const { language, t } = useI18n();
  const mapUrl = useMemo(() => osmEmbedUrl(region), [region]);

  return (
    <View style={styles.container}>
      <View
        accessibilityLabel={`${t('nav.map')}: ${city}`}
        style={[styles.mapFrame, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {createElement('iframe', {
          loading: 'lazy',
          referrerPolicy: 'no-referrer-when-downgrade',
          src: mapUrl,
          style: styles.iframe,
          title: `${t('nav.map')}: ${city}`,
        })}
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
  mapFrame: {
    aspectRatio: 1.85,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  iframe: {
    borderWidth: 0,
    height: '100%',
    width: '100%',
  },
});
