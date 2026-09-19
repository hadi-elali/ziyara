import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import {
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
import { languageOptions, type Language, useI18n } from '@/features/i18n/i18n';
import { registerRoute } from '@/features/navigation/routes';
import { useOnboarding } from '@/features/onboarding/onboarding-state';

// Metro resolves bundled local media through a static require expression.
const onboardingVideo = require('../../assets/videos/intro.mp4');
const onboardingLogo = require('../../assets/images/logo.png');

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const { language, setLanguage, t } = useI18n();
  const { completeOnboarding } = useOnboarding();
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const player = useVideoPlayer(onboardingVideo, (videoPlayer) => {
    videoPlayer.audioMixingMode = 'doNotMix';
    videoPlayer.loop = true;
    videoPlayer.muted = false;
    videoPlayer.volume = 1;
    videoPlayer.play();
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') {
      setVideoUnavailable(true);
    }
  });

  const chooseLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    completeOnboarding();
    router.replace(registerRoute());
  };

  const logoSize = Math.min(172, Math.max(122, width * 0.38));
  const titleSize = Math.min(54, Math.max(42, width * 0.125));

  return (
    <View style={styles.root}>
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
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.container}>
            <View style={styles.brand}>
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
            </View>

            <View style={styles.languageSection}>
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
                      key={option.value}
                      onPress={() => chooseLanguage(option.value)}
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
    backgroundColor: OnboardingPalette.background,
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
  videoUnavailable: {
    color: OnboardingPalette.textSecondary,
    maxWidth: 420,
  },
});
