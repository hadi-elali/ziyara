import { Zoomable } from '@likashefqet/react-native-image-zoom';
import { Image, type ImageSource } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { SymbolIcon, type SymbolIconName } from '@/components/ui/symbol-icon';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/features/i18n/i18n';
import { useHomeTourState } from '@/features/onboarding/home-tour-state';
import { useTheme } from '@/hooks/use-theme';

const slides: {
  id: string;
  screenshot: ImageSource;
  features: SymbolIconName[];
  requiresAccount?: boolean;
}[] = [
  {
    id: 'home',
    screenshot: require('../../../assets/images/onboarding/home.png'),
    features: ['clock', 'alarm', 'people'],
    requiresAccount: true,
  },
  {
    id: 'program',
    screenshot: require('../../../assets/images/onboarding/daily-program.png'),
    features: ['clock', 'info'],
    requiresAccount: true,
  },
  {
    id: 'map',
    screenshot: require('../../../assets/images/onboarding/map.png'),
    features: ['map', 'location'],
  },
  {
    id: 'place',
    screenshot: require('../../../assets/images/onboarding/place.png'),
    features: ['bookmark', 'location', 'book'],
  },
  {
    id: 'settings',
    screenshot: require('../../../assets/images/onboarding/settings.png'),
    features: ['settings', 'globe', 'alarm'],
  },
  {
    id: 'help',
    screenshot: require('../../../assets/images/onboarding/emergency.png'),
    features: ['alarm', 'location'],
    requiresAccount: true,
  },
];

export function HomeFeatureTour({ available }: { available: boolean }) {
  const [completed, setCompleted, loaded] = useHomeTourState();

  return available && loaded && !completed
    ? <FeatureTourSlides onDismiss={() => setCompleted(true)} />
    : null;
}

/** Mounted afresh for automatic first use and for each replay from Settings. */
export function FeatureTourSlides({ onDismiss }: { onDismiss: () => void }) {
  const theme = useTheme();
  const { isRTL, t } = useI18n();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [screenshotExpanded, setScreenshotExpanded] = useState(false);
  const pager = useRef<ScrollView>(null);
  const activeSlide = useRef(0);
  const cardWidth = Math.min(520, width - Spacing.five);
  const cardHeight = Math.min(740, height - insets.top - insets.bottom - Spacing.five);
  const screenshotHeight = Math.min(320, Math.max(200, cardHeight * 0.42));
  const viewerWidth = width - Spacing.five;
  const viewerHeight = Math.max(200, height - insets.top - insets.bottom - 140);
  const isLastSlide = currentSlide === slides.length - 1;
  const selectedSlide = slides[currentSlide];

  useEffect(() => {
    pager.current?.scrollTo({ x: activeSlide.current * cardWidth, animated: false });
  }, [cardWidth, screenshotExpanded]);

  const finishScroll = (offset: number) => {
    const index = Math.max(0, Math.min(slides.length - 1, Math.round(offset / cardWidth)));
    activeSlide.current = index;
    setCurrentSlide(index);
  };

  const goToSlide = (index: number) => {
    activeSlide.current = index;
    setCurrentSlide(index);
    pager.current?.scrollTo({ x: index * cardWidth, animated: true });
  };

  return (
    <Modal
      accessibilityViewIsModal
      animationType="fade"
      onRequestClose={screenshotExpanded ? () => setScreenshotExpanded(false) : onDismiss}
      statusBarTranslucent
      transparent
      visible>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaView style={[
          styles.backdrop,
          screenshotExpanded && { backgroundColor: theme.background },
        ]}>
          {screenshotExpanded ? (
            <View style={styles.viewer} testID="home-tour-screenshot-viewer">
              <View style={[styles.viewerToolbar, isRTL && styles.rtlRow]}>
                <ThemedText style={styles.headerTitle} type="smallBold">
                  {t(`homeTour.${selectedSlide.id}.title`)}
                </ThemedText>
                <Button
                  icon="close"
                  label={t('homeTour.screenshot.close')}
                  onPress={() => setScreenshotExpanded(false)}
                  variant="secondary"
                />
              </View>
              <Zoomable
                doubleTapScale={2.5}
                isDoubleTapEnabled
                isPanEnabled
                isPinchEnabled
                maxScale={4}
                style={styles.viewerImage}>
                <Image
                  accessibilityLabel={t('homeTour.screenshot.label', { screen: t(`homeTour.${selectedSlide.id}.title`) })}
                  contentFit="contain"
                  source={selectedSlide.screenshot}
                  style={{ height: viewerHeight, width: viewerWidth }}
                />
              </Zoomable>
              <ThemedText style={styles.centered} themeColor="textSecondary" type="small">
                {t('homeTour.screenshot.zoomHint')}
              </ThemedText>
            </View>
          ) : (
            <View
              accessibilityLabel={t('homeTour.label')}
              accessibilityViewIsModal
              style={[styles.card, { backgroundColor: theme.surface, height: cardHeight, width: cardWidth }]}
              testID="home-feature-tour">
              <View style={[styles.header, isRTL && styles.rtlRow]}>
                <ThemedText type="smallBold" themeColor="accent" style={styles.headerTitle}>
                  {t('homeTour.label')}
                </ThemedText>
                <Button icon="close" label={t('homeTour.skip')} onPress={onDismiss} variant="ghost" size="compact" />
              </View>

              <ScrollView
                // Keep physical page offsets stable; text and controls use the app's RTL setting.
                decelerationRate="fast"
                horizontal
                onMomentumScrollEnd={({ nativeEvent }) => finishScroll(nativeEvent.contentOffset.x)}
                pagingEnabled
                ref={pager}
                showsHorizontalScrollIndicator={false}
                style={styles.pager}
                testID="home-tour-pager">
                {slides.map((slide, index) => (
                  <ScrollView
                    accessibilityElementsHidden={index !== currentSlide}
                    importantForAccessibility={index === currentSlide ? 'auto' : 'no-hide-descendants'}
                    contentContainerStyle={styles.slide}
                    key={slide.id}
                    showsVerticalScrollIndicator={false}
                    style={{ width: cardWidth }}>
                    <ThemedText accessibilityRole="header" style={styles.title} type="title">
                      {t(`homeTour.${slide.id}.title`)}
                    </ThemedText>
                    <ThemedText themeColor="textSecondary" style={styles.centered}>
                      {t(`homeTour.${slide.id}.body`)}
                    </ThemedText>
                    <Pressable
                      accessibilityHint={t('homeTour.screenshot.openHint')}
                      accessibilityLabel={t('homeTour.screenshot.open', { screen: t(`homeTour.${slide.id}.title`) })}
                      accessibilityRole="button"
                      onPress={() => {
                        activeSlide.current = index;
                        setCurrentSlide(index);
                        setScreenshotExpanded(true);
                      }}
                      style={({ pressed }) => [styles.screenshotButton, pressed && styles.pressed]}>
                      <View style={[styles.screenshotFrame, { borderColor: theme.border }]}>
                        <Image
                          accessibilityElementsHidden
                          contentFit="contain"
                          importantForAccessibility="no-hide-descendants"
                          source={slide.screenshot}
                          style={{ height: screenshotHeight, width: screenshotHeight * (942 / 2048) }}
                        />
                      </View>
                      <View style={[styles.screenshotCaption, isRTL && styles.rtlRow]}>
                        <SymbolIcon color={theme.accent} name="external-link" size={15} />
                        <ThemedText themeColor="accent" type="smallBold">
                          {t('homeTour.screenshot.enlarge')}
                        </ThemedText>
                      </View>
                    </Pressable>
                    <View style={styles.features}>
                      {slide.features.map((icon, featureIndex) => (
                        <View key={icon} style={[styles.feature, isRTL && styles.rtlRow]}>
                          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                            style={[styles.featureIcon, { backgroundColor: theme.accentSoft }]}>
                            <SymbolIcon color={theme.accent} name={icon} size={20} />
                          </View>
                          <ThemedText style={styles.featureText} type="small">
                            {t(`homeTour.${slide.id}.feature${featureIndex + 1}`)}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                    {slide.requiresAccount ? (
                      <ThemedText style={styles.centered} themeColor="textSecondary" type="small">
                        {t('homeTour.accountHint')}
                      </ThemedText>
                    ) : null}
                  </ScrollView>
                ))}
              </ScrollView>

              <View style={[styles.footer, { borderTopColor: theme.border }]}>
                <View accessibilityLiveRegion="polite" style={styles.progress}>
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.dots}>
                    {slides.map((slide, index) => (
                      <View key={slide.id} style={[styles.dot, {
                        backgroundColor: index === currentSlide ? theme.accent : theme.border,
                        width: index === currentSlide ? 22 : 7,
                      }]} />
                    ))}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('homeTour.progress', { current: currentSlide + 1, total: slides.length })}
                  </ThemedText>
                </View>
                <View style={[styles.actions, isRTL && styles.rtlRow]}>
                  {currentSlide > 0 ? (
                    <Button icon={isRTL ? 'chevron' : 'back'} label={t('common.back')}
                      onPress={() => goToSlide(currentSlide - 1)} variant="secondary" />
                  ) : null}
                  <Button
                    icon={isLastSlide ? 'confirm' : isRTL ? 'back' : 'chevron'}
                    label={t(isLastSlide ? 'homeTour.finish' : 'onboarding.continue')}
                    onPress={isLastSlide ? onDismiss : () => goToSlide(currentSlide + 1)}
                    style={styles.nextButton} />
                </View>
              </View>
            </View>
          )}
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.48)', flex: 1, justifyContent: 'center', padding: Spacing.three },
  card: { borderRadius: 24, overflow: 'hidden' },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  headerTitle: { flex: 1 },
  pager: { direction: 'ltr', flex: 1 },
  slide: { alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  screenshotButton: { alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
  screenshotFrame: { backgroundColor: '#F2F2F2', borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  screenshotCaption: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: 32 },
  pressed: { opacity: 0.75 },
  viewer: { flex: 1, gap: Spacing.three, width: '100%' },
  viewerToolbar: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three },
  viewerImage: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  title: { fontSize: 28, lineHeight: 34, textAlign: 'center' },
  centered: { textAlign: 'center' },
  features: { alignSelf: 'stretch', gap: Spacing.three, marginVertical: Spacing.two },
  feature: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three },
  featureIcon: { alignItems: 'center', borderRadius: 14, height: 42, justifyContent: 'center', width: 42 },
  featureText: { flex: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.three, padding: Spacing.three },
  progress: { alignItems: 'center', gap: Spacing.two },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { borderRadius: 4, height: 7 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  nextButton: { flex: 1 },
  rtlRow: { flexDirection: 'row-reverse' },
});
