import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { useI18n } from '@/features/i18n/i18n';
import { readerRoute } from '@/features/navigation/routes';
import { useTheme } from '@/hooks/use-theme';
import { useImportedContentCatalog } from './imported-content-catalog';

export function PlaceRecommendedActs({ placeId, children }: { placeId: string; children?: ReactNode }) {
  const { contents, isLoading, error, refresh } = useImportedContentCatalog();
  const { t } = useI18n();
  const theme = useTheme();
  const visible = contents.filter((item) => item.placeIds?.includes(placeId));
  const hasVisibleContent = visible.length > 0 || Boolean(children);
  if (!visible.length && !children && !isLoading && !error) return null;
  return <Section title={t('place.recommendedActs')}>
    {isLoading && !hasVisibleContent ? <ActivityIndicator color={theme.accent} /> : null}
    {error ? <>
      <ThemedText type="small" themeColor="danger">{error}</ThemedText>
      <Button label={t('reader.retry')} disabled={isLoading} variant="secondary" onPress={() => void refresh()} />
    </> : null}
    {visible.map((content) => <Card key={content.id} onPress={() => router.push(readerRoute(content.slug))}>
      <ThemedText type="heading">{content.title}</ThemedText>
      {content.notes ? <ThemedText type="small" themeColor="textSecondary">{content.notes}</ThemedText> : null}
    </Card>)}
    {children}
  </Section>;
}
