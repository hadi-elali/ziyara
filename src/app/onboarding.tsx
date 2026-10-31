import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { Fonts, OnboardingPalette, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { useGroupCheck } from '@/features/group-check/group-check-context';
import { languageOptions, useI18n } from '@/features/i18n/i18n';
import { isStartupNavigationPending } from '@/features/navigation/startup-state';
import { useOnboarding } from '@/features/onboarding/onboarding-state';
import { useTheme } from '@/hooks/use-theme';

// Metro resolves bundled local media through a static require expression.
const onboardingVideo = require('../../assets/videos/intro.mp4');
const onboardingLogo = require('../../assets/images/logo.png');

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const { hasSelectedLanguage, language, setLanguage, t } = useI18n();
  const { completeOnboarding } = useOnboarding();
  const { hasProfileError, isAdmin, isLoading: isAuthLoading, session } = useAuth();
  const { isLoading: isGroupCheckLoading } = useGroupCheck();
  const isStartupPending = isStartupNavigationPending({
    hasProfileError, hasSession: Boolean(session), isAdmin, isAuthLoading, isGroupCheckLoading,
  });
  const [showLanguageSelection] = useState(() => !hasSelectedLanguage);
  const [continueRequested, setContinueRequested] = useState(false);
  const hasCompleted = useRef(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [brandOpacity] = useState(() => new Animated.Value(0));
  const [languageOpacity] = useState(() => new Animated.Value(0));
  const player = useVideoPlayer(onboardingVideo, (videoPlayer) => {
    videoPlayer.audioMixingMode = 'doNotMix';
    videoPlayer.loop = false;
    videoPlayer.muted = false;
    videoPlayer.volume = 1;
    videoPlayer.play();
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') {
      setVideoUnavailable(true);
    }
  });

  useEventListener(player, 'playToEnd', () => {
    // Never dismiss the one-time language choice before it is confirmed.
    if (!showLanguageSelection) setContinueRequested(true);
  });

  useEffect(() => {
    if (!continueRequested || isStartupPending || hasCompleted.current) return;
    hasCompleted.current = true;
    if (!hasSelectedLanguage) setLanguage(language);
    player.pause();
    // Removing the intro guard selects Home/check-in in one navigation update.
    completeOnboarding();
  }, [completeOnboarding, continueRequested, hasSelectedLanguage, isStartupPending, language, player, setLanguage]);

  useEffect(() => {
    if (!showLanguageSelection) return;

    const entranceAnimation = Animated.parallel([
      Animated.sequence([
        Animated.delay(1650),
        Animated.timing(brandOpacity, {
          duration: 450,
          toValue: 1,
          useNativeDriver: false,
        }),
      ]),
      Animated.sequence([
        Animated.delay(1650),
        Animated.timing(languageOpacity, {
          duration: 450,
          toValue: 1,
          useNativeDriver: false,
        }),
      ]),
    ]);

    entranceAnimation.start();

    return () => entranceAnimation.stop();
  }, [brandOpacity, languageOpacity, showLanguageSelection]);

  const continueToHome = () => {
    player.pause();
    setContinueRequested(true);
  };

  const logoSize = Math.min(172, Math.max(122, width * 0.38));
  const titleSize = Math.min(54, Math.max(42, width * 0.125));

  return (
    <View style={[styles.root, { backgroundColor: videoUnavailable ? OnboardingPalette.background : theme.background }]}>
      {videoUnavailable ? null : (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <VideoView
            accessibilityLabel={t('onboarding.videoLabel')}
            contentFit="cover"
            nativeControls={false}
            player={player}
            playsInline
            style={styles.backgroundVideo}
            surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
          />
        </View>
      )}
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            !showLanguageSelection && styles.returningScrollContent,
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.container}>
            {showLanguageSelection ? (
              <Animated.View style={[styles.brand, { opacity: brandOpacity }]}>
                <Image
                  accessible={false}
                  contentFit="contain"
                  source={onboardingLogo}
                  style={{ height: logoSize, width: logoSize }}
                />
                <ThemedText
                  numberOfLines={1}
                  style={[styles.centeredText, styles.brandName, { fontSize: titleSize }]}>
                  {t('onboarding.brandName')}
                </ThemedText>
                <View style={styles.brandSubtitleRow}>
                  <View style={styles.brandLine} />
                  <ThemedText style={[styles.centeredText, styles.brandSubtitle]}>
                    {t('onboarding.brandSubtitle')}
                  </ThemedText>
                  <View style={styles.brandLine} />
                </View>
                <ThemedText style={[styles.centeredText, styles.tagline]}>
                  {t('onboarding.tagline')}
                </ThemedText>
              </Animated.View>
            ) : null}

            {showLanguageSelection ? (
              <Animated.View style={[styles.languageSection, { opacity: languageOpacity }]}>
                <ThemedText style={[styles.centeredText, styles.languageTitle]} type="heading">
                  {t('onboarding.title')}
                </ThemedText>

                <View style={styles.languageList}>
                  {languageOptions.map((option) => {
                    const isSelected = option.value === language;

                    return (
                      <Pressable
                        accessibilityHint={t('onboarding.languageHint')}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        key={option.value}
                        onPress={() => setLanguage(option.value)}
                        style={({ pressed }) => [
                          styles.languageButton,
                          isSelected && styles.languageButtonSelected,
                          pressed && styles.languageButtonPressed,
                        ]}>
                        <SymbolIcon
                          color={isSelected ? OnboardingPalette.background : OnboardingPalette.text}
                          name="globe"
                          size={22}
                        />
                        <ThemedText
                          numberOfLines={1}
                          style={[
                            styles.languageLabel,
                            isSelected && styles.languageLabelSelected,
                          ]}
                          type="smallBold">
                          {option.nativeLabel}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityState={{ busy: continueRequested, disabled: continueRequested }}
                accessibilityRole="button"
                disabled={continueRequested}
                onPress={continueToHome}
                style={({ pressed }) => [
                  styles.continueButton,
                  pressed && styles.languageButtonPressed,
                ]}>
                {continueRequested ? <ActivityIndicator color={OnboardingPalette.background} size="small" /> : null}
                <ThemedText style={styles.continueLabel} type="smallBold">
                  {t('onboarding.continue')}
                </ThemedText>
              </Pressable>

              {videoUnavailable ? (
                <ThemedText style={[styles.centeredText, styles.videoUnavailable]} type="small">
                  {t('onboarding.videoUnavailable')}
                </ThemedText>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backgroundVideo: {
    flex: 1,
    height: '100%',
    width: '100%',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.three,
  },
  returningScrollContent: {
    justifyContent: 'flex-end',
  },
  container: {
    gap: Spacing.five,
    maxWidth: 560,
    paddingBottom: Spacing.four,
    paddingTop: Spacing.three,
    width: '100%',
  },
  brand: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  centeredText: {
    textAlign: 'center',
    writingDirection: 'auto',
  },
  brandName: {
    color: OnboardingPalette.text,
    fontFamily: Fonts.serif,
    fontWeight: '500',
    lineHeight: 62,
    marginTop: -Spacing.two,
  },
  brandSubtitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    maxWidth: 390,
    width: '86%',
  },
  brandLine: {
    backgroundColor: OnboardingPalette.gold,
    flex: 1,
    height: StyleSheet.hairlineWidth,
    maxWidth: 62,
  },
  brandSubtitle: {
    color: OnboardingPalette.brandGreen,
    fontSize: 23,
    fontWeight: '500',
    letterSpacing: 1.2,
    lineHeight: 30,
  },
  tagline: {
    color: OnboardingPalette.textSecondary,
    fontSize: 17,
    lineHeight: 25,
    marginTop: Spacing.two,
  },
  languageSection: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  languageTitle: {
    color: OnboardingPalette.text,
  },
  languageList: {
    flexDirection: 'row',
    gap: Spacing.two,
    width: '100%',
  },
  languageButton: {
    alignItems: 'center',
    borderColor: OnboardingPalette.border,
    borderRadius: 18,
    borderWidth: 1.5,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  languageButtonSelected: {
    backgroundColor: OnboardingPalette.gold,
    borderColor: OnboardingPalette.gold,
  },
  languageButtonPressed: {
    backgroundColor: OnboardingPalette.goldPressed,
    borderColor: OnboardingPalette.goldPressed,
    opacity: 0.82,
  },
  languageLabel: {
    color: OnboardingPalette.text,
    textAlign: 'center',
    writingDirection: 'auto',
  },
  languageLabelSelected: {
    color: OnboardingPalette.background,
  },
  continueButton: {
    alignItems: 'center',
    backgroundColor: OnboardingPalette.gold,
    borderRadius: 18,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 56,
    padding: Spacing.two,
    width: '100%',
  },
  actions: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  continueLabel: {
    color: OnboardingPalette.background,
    textAlign: 'center',
    writingDirection: 'auto',
  },
  videoUnavailable: {
    color: OnboardingPalette.textSecondary,
    maxWidth: 420,
  },
});
