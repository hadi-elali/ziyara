import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { SourceReferenceList } from '@/components/source-reference-list';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { ThemedText } from '@/components/themed-text';
import { getSourceReferencesByIds } from '@/data/sourceReferences';
import { useI18n } from '@/features/i18n/i18n';
import {
  localizeReligiousContent,
  localizeSourceReferences,
} from '@/features/i18n/localizedData';
import { singleRouteParam } from '@/features/navigation/routes';
import { ReaderPreferenceControls } from '@/features/reader/ReaderPreferenceControls';
import { SegmentedReligiousText } from '@/features/reader/SegmentedReligiousText';
import { formatVisibleParagraphs } from '@/features/reader/religious-content-format';
import { useReligiousContent } from '@/features/reader/religious-content-source';
import { useBookmarks } from '@/features/storage/useBookmarks';
import { useReaderPreferences } from '@/features/storage/useReaderPreferences';
import { useReadingPosition } from '@/features/storage/useReadingPosition';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ReaderScreen() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = singleRouteParam(params.slug);
  const { content: rawContent, errorKind, errorMessage, isLoading, refresh } = useReligiousContent(slug);
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const { preferences } = useReaderPreferences();
  const { loaded: positionsLoaded, positions, saveReadingPosition } = useReadingPosition();
  const { language, t } = useI18n();
  const theme = useTheme();
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const content = rawContent ? localizeReligiousContent(rawContent, language) : undefined;
  const scrollViewRef = useRef<ScrollView>(null);
  const restoredSlugRef = useRef<string | null>(null);
  const initialReadingPosition = content ? (positions[content.slug] ?? 0) : 0;

  useEffect(() => {
    if (!content || !positionsLoaded || restoredSlugRef.current === content.slug) {
      return;
    }

    const slugToRestore = content.slug;
    const restoreTimeout = setTimeout(() => {
      restoredSlugRef.current = slugToRestore;
      scrollViewRef.current?.scrollTo({ animated: false, y: initialReadingPosition });
    }, 0);

    return () => clearTimeout(restoreTimeout);
  }, [content, initialReadingPosition, positionsLoaded]);

  if (!content && isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={theme.accent} size="large" />
        <ThemedText themeColor="textSecondary">{t('reader.loading')}</ThemedText>
      </Screen>
    );
  }

  if (!content && errorKind) {
    return (
      <Screen>
        <ThemedText type="heading">{t('reader.notFound')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {errorMessage}
        </ThemedText>
        <Button icon="refresh" label={t('reader.retry')} onPress={refresh} />
      </Screen>
    );
  }

  if (!content) {
    return (
      <Screen>
        <ThemedText type="heading">{t('reader.notFound')}</ThemedText>
        <Button icon="search" label={t('reader.findContent')} onPress={() => router.push('/search')} />
      </Screen>
    );
  }

  const bookmarkKey = `content:${content.slug}`;
  const sources = localizeSourceReferences(getSourceReferencesByIds(content.sourceReferences), language);
  const sourceText = sources.map((source) => source.title).join('\n');
  const visibleParagraphText = formatVisibleParagraphs(content.paragraphs, preferences);
  const readerText = [
    content.title,
    visibleParagraphText,
    content.notes,
    sourceText ? `${t('reader.sourcesShareTitle')}\n${sourceText}` : undefined,
  ]
    .filter(Boolean)
    .join('\n\n');

  return (
    <Screen
      contentStyle={styles.content}
      safeAreaEdges={['right', 'bottom', 'left']}
      scrollViewRef={scrollViewRef}
      onContentSizeChange={() => {
        if (!positionsLoaded || restoredSlugRef.current === content.slug) {
          return;
        }

        restoredSlugRef.current = content.slug;
        scrollViewRef.current?.scrollTo({
          animated: false,
          y: positions[content.slug] ?? 0,
        });
      }}
      onScroll={(event) => {
        if (restoredSlugRef.current === content.slug) {
          saveReadingPosition(content.slug, event.nativeEvent.contentOffset.y);
        }
      }}>
      <Stack.Screen options={{ title: content.title }} />

      <View
        style={[
          styles.actions,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}>
        <Button
          icon="bookmark"
          label={isBookmarked(bookmarkKey) ? t('common.saved') : t('common.save')}
          onPress={() => toggleBookmark(bookmarkKey)}
          style={styles.actionButton}
          variant={isBookmarked(bookmarkKey) ? 'primary' : 'ghost'}
        />
        <Button
          icon="copy"
          label={t('reader.copy')}
          onPress={() => void Clipboard.setStringAsync(readerText).catch(() => undefined)}
          style={styles.actionButton}
          variant="ghost"
        />
        <Button
          accessibilityState={{ expanded: showDisplaySettings }}
          icon="settings"
          label={t('reader.displaySettings')}
          onPress={() => setShowDisplaySettings((isVisible) => !isVisible)}
          style={styles.actionButton}
          variant={showDisplaySettings ? 'primary' : 'ghost'}
        />
      </View>

      {showDisplaySettings ? (
        <View style={styles.settingsSection}>
          <ThemedText type="heading">{t('reader.displaySettings')}</ThemedText>
          <ReaderPreferenceControls />
        </View>
      ) : null}

      <View style={styles.textSection}>
        <ThemedText type="subtitle">{t('reader.text')}</ThemedText>
        <SegmentedReligiousText paragraphs={content.paragraphs} preferences={preferences} />
      </View>

      <View
        style={[
          styles.infoCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}>
        <View style={styles.infoSection}>
          <ThemedText type="heading">{t('reader.notes')}</ThemedText>
          <ThemedText themeColor="textSecondary">{content.notes}</ThemedText>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.infoSection}>
          <ThemedText type="heading">{t('reader.sources')}</ThemedText>
          <SourceReferenceList showLastChecked={false} showUrl={false} sources={sources} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.four,
    paddingTop: Spacing.two,
  },
  actions: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    padding: Spacing.one,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: Spacing.one,
  },
  settingsSection: {
    gap: Spacing.three,
  },
  textSection: {
    gap: Spacing.three,
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.four,
    padding: Spacing.four,
  },
  infoSection: {
    gap: Spacing.two,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
