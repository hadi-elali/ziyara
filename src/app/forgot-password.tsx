import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen } from '@/components/ui/screen';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { useI18n } from '@/features/i18n/i18n';
import { loginRoute } from '@/features/navigation/routes';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { useTheme } from '@/hooks/use-theme';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    Keyboard.dismiss();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
      setFeedback(t('auth.validation.email'));
      setIsError(true);
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);

    try {
      const { error } = await requestPasswordReset(normalizedEmail);

      if (error) {
        setFeedback(error.message);
        setIsError(true);
      } else {
        // The same neutral response is shown for existing and unknown accounts.
        setEmail('');
        setFeedback(t('recovery.requestSuccess'));
        setIsError(false);
      }
    } catch (error) {
      const message = getOriginalErrorMessage(error);

      if (message) {
        setFeedback(message);
        setIsError(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.container}>
        <View style={styles.intro}>
          <ThemedText type="title">{t('recovery.forgotTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t('recovery.forgotBody')}
          </ThemedText>
        </View>

        <ThemedView type="surface" style={[styles.card, { borderColor: theme.border }]}>
          <View style={styles.field}>
            <ThemedText type="smallBold">{t('auth.email')}</ThemedText>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!isSubmitting}
              inputMode="email"
              keyboardType="email-address"
              maxLength={254}
              onChangeText={setEmail}
              onSubmitEditing={() => void submit()}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              textContentType="emailAddress"
              value={email}
            />
          </View>

          {feedback ? (
            <View
              accessibilityLiveRegion="polite"
              accessibilityRole={isError ? 'alert' : undefined}
              style={[
                styles.feedback,
                {
                  backgroundColor: isError ? theme.dangerSoft : theme.successSoft,
                  borderColor: isError ? theme.danger : theme.success,
                },
              ]}>
              <ThemedText type="small" themeColor={isError ? 'danger' : 'success'}>
                {feedback}
              </ThemedText>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
            disabled={isSubmitting}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.accent },
              pressed && styles.pressed,
              isSubmitting && styles.disabled,
            ]}>
            {isSubmitting ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                {t('recovery.sendLink')}
              </ThemedText>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="link"
            disabled={isSubmitting}
            onPress={() => router.replace(loginRoute())}
            style={({ pressed }) => [styles.secondaryLink, pressed && styles.pressed]}>
            <ThemedText type="smallBold" themeColor="accent">
              {t('recovery.backToLogin')}
            </ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
  },
  container: {
    alignSelf: 'center',
    gap: Spacing.four,
    maxWidth: Math.min(MaxContentWidth, 480),
    width: '100%',
  },
  intro: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
    padding: Spacing.four,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  feedback: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.three,
  },
  secondaryLink: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.6,
  },
});
