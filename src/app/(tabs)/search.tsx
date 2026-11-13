import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { searchCatalog, type SearchFilter, type SearchResult } from '@/data/catalog';
import { getPlaceBySlug } from '@/data/places';
import { useI18n } from '@/features/i18n/i18n';
import { localizePlace } from '@/features/i18n/localizedData';
import { placeRoute, readerRoute, singleRouteParam } from '@/features/navigation/routes';
import { PlaceImageCard } from '@/features/places/PlaceImageCard';
import { useTheme } from '@/hooks/use-theme';
import { useImportedContentCatalog } from '@/features/reader/imported-content-catalog';
import { Button } from '@/components/ui/button';

const filters: SearchFilter[] = ['all', 'places', 'content', 'acts'];

export default function SearchScreen() {
  const params = useLocalSearchParams<{ city?: string | string[] }>();
  const [query, setQuery] = useState(singleRouteParam(params.city) ?? '');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const theme = useTheme();
  const { isRTL, language, t } = useI18n();
  const { contents, error, refresh } = useImportedContentCatalog();

  const results = useMemo(() => searchCatalog(query, filter, language, contents), [filter, language, query, contents]);

  return (
    <Screen>
      <Section title={t('search.title')}>
        <TextInput
          accessibilityLabel={t('search.searchA11y')}
          autoCapitalize="none"
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          placeholderTextColor={theme.textSecondary}
          returnKeyType="search"
          style={[
            styles.searchInput,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              color: theme.text,
              textAlign: isRTL ? 'right' : 'left',
              writingDirection: isRTL ? 'rtl' : 'ltr',
            },
          ]}
          value={query}
        />
        <View accessibilityRole="radiogroup" style={styles.filters}>
          {filters.map((item) => {
            const selected = item === filter;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={item}
                onPress={() => setFilter(item)}
                style={({ pressed }) => [
                  styles.filter,
                  {
                    backgroundColor: selected ? theme.accent : theme.backgroundElement,
                    borderColor: selected ? theme.accent : theme.border,
                  },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={selected && { color: theme.background }}>
                  {t(`labels.searchFilter.${item}`)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </Section>

      {error ? <View><ThemedText type="small" themeColor="danger">{error}</ThemedText>
        <Button label={t('reader.retry')} variant="secondary" onPress={() => void refresh()} /></View> : null}
      <Section
        title={t(results.length === 1 ? 'search.resultCount.one' : 'search.resultCount.many', {
          count: results.length,
        })}>
        <View style={styles.results}>
          {results.map((result) => (
            <SearchResultCard key={`${result.kind}-${result.id}`} result={result} />
          ))}
          {results.length === 0 && (
            <View style={[styles.empty, { borderColor: theme.border }]}>
              <ThemedText type="smallBold">{t('search.emptyTitle')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('search.emptyBody')}
              </ThemedText>
            </View>
          )}
        </View>
      </Section>
    </Screen>
  );
}

function SearchResultCard({ result }: { result: SearchResult }) {
  const { language } = useI18n();

  if (result.kind === 'place') {
    const place = getPlaceBySlug(result.slug);

    if (place) {
      return <PlaceImageCard place={localizePlace(place, language)} />;
    }
  }

  const route =
    result.kind === 'place'
      ? placeRoute(result.slug)
      : result.slug
        ? readerRoute(result.slug)
        : undefined;

  return (
    <Card onPress={route ? () => router.push(route) : undefined}>
      <View style={styles.resultHeader}>
        <View style={styles.resultTitle}>
          <ThemedText type="heading">{result.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {result.subtitle}
          </ThemedText>
        </View>
        <Badge status={result.verificationStatus} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {result.description}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  filter: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  results: {
    gap: Spacing.three,
  },
  resultHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  resultTitle: {
    flex: 1,
    gap: Spacing.half,
  },
  empty: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  pressed: {
    opacity: 0.72,
  },
});
