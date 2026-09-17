import { useEvent } from 'expo';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, MediaBackdrop, Spacing } from '@/constants/theme';
import { languageOptions, type Language, useI18n } from '@/features/i18n/i18n';
import { registerRoute } from '@/features/navigation/routes';
import { useOnboarding } from '@/features/onboarding/onboarding-state';
import { useTheme } from '@/hooks/use-theme';

// Metro resolves bundled local media through a static require expression.
const onboardingVideo = require('../../assets/videos/intro.mp4');

export default function OnboardingScreen() {
  const theme = useTheme();
  const { setLanguage, t } = useI18n();
  const { completeOnboarding } = useOnboarding();
  const player = useVideoPlayer(onboardingVideo, (videoPlayer) => {
    videoPlayer.audioMixingMode = 'mixWithOthers';
    videoPlayer.loop = true;
    videoPlayer.muted = false;
    videoPlayer.play();
  });
  const { status: videoStatus } = useEvent(player, 'statusChange', {
    status: player.status,
  });

  const chooseLanguage = (language: Language) => {
    setLanguage(language);
    completeOnboarding();
    router.replace(registerRoute());
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {videoStatus === 'error' ? null : (
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
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.container}>
            <View style={styles.intro}>
              <ThemedText style={[styles.centeredText, styles.primaryText]} type="title">
                Al Batoul
              </ThemedText>
              <ThemedText style={[styles.centeredText, styles.primaryText]} type="subtitle">
                Reiseapp
              </ThemedText>
              <View style={{marginBottom: 10}}/>
              <ThemedText style={[styles.centeredText, styles.eyebrow]} type="subtitle">
                {t('onboarding.title')}
              </ThemedText>
              <ThemedText style={[styles.centeredText, styles.secondaryText]}>
                {t('onboarding.body')}
              </ThemedText>
              
              {videoStatus === 'error' ? (
                <ThemedText style={[styles.centeredText, styles.secondaryText]} type="small">
                  {t('onboarding.videoUnavailable')}
                </ThemedText>
              ) : null}
            </View>

            <View style={styles.languageList}>
              {languageOptions.map((option) => (
                <Pressable
                  accessibilityHint={t('onboarding.languageHint')}
                  accessibilityRole="button"
                  key={option.value}
                  onPress={() => chooseLanguage(option.value)}
                  style={({ pressed }) => [
                    styles.languageButton,
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText style={styles.languageLabel} type="heading">
                    {option.nativeLabel}
                  </ThemedText>
                </Pressable>
              ))}
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
  scrim: {
    backgroundColor: MediaBackdrop.scrim,
  },
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.three,
  },
  container: {
    gap: Spacing.four,
    maxWidth: Math.min(MaxContentWidth, 560),
    paddingVertical: Spacing.three,
    width: '100%',
  },
  intro: {
    gap: Spacing.two,
  },
  centeredText: {
    textAlign: 'center',
  },
  eyebrow: {
    color: MediaBackdrop.textSecondary,
  },
  primaryText: {
    color: MediaBackdrop.text,
  },
  secondaryText: {
    color: MediaBackdrop.textSecondary,
  },
  languageList: {
    gap: Spacing.two,
  },
  languageButton: {
    alignItems: 'center',
    backgroundColor: MediaBackdrop.surface,
    borderRadius: 12,
    borderColor: MediaBackdrop.border,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  languageLabel: {
    color: MediaBackdrop.text,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
