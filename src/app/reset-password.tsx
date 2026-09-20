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
import { forgotPasswordRoute, loginRoute } from '@/features/navigation/routes';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { useTheme } from '@/hooks/use-theme';

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const {
    completePasswordRecovery,
    hasCheckedPasswordRecoveryLink,
    passwordRecoveryError,
    passwordRecoveryStatus,
  } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const submit = async () => {
    Keyboard.dismiss();
    setFeedback(null);

    if (newPassword.length < 8) {
      setFeedback(t('auth.validation.password'));
      return;
    }

    if (!/\p{L}/u.test(newPassword) || !/\p{N}/u.test(newPassword)) {
      setFeedback(t('auth.validation.passwordPattern'));
      return;
    }

    if (newPassword !== passwordConfirmation) {
      setFeedback(t('auth.validation.passwordMatch'));
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await completePasswordRecovery(newPassword);

      if (error) {
        setFeedback(error.message);
      } else {
        setNewPassword('');
        setPasswordConfirmation('');
        setIsComplete(true);
      }
    } catch (error) {
      setFeedback(getOriginalErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isChecking =
    !hasCheckedPasswordRecoveryLink || passwordRecoveryStatus === 'processing';

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.container}>
        {isChecking ? (
          <View accessibilityLiveRegion="polite" style={styles.loading}>
            <ActivityIndicator color={theme.accent} size="large" />
            <ThemedText themeColor="textSecondary">
              {t('recovery.checkingLink')}
            </ThemedText>
          </View>
        ) : isComplete ? (
          <RecoveryMessage
            actionLabel={t('recovery.goToLogin')}
            body={t('recovery.resetSuccess')}
            onAction={() => router.replace(loginRoute())}
            title={t('recovery.resetSuccessTitle')}
            tone="success"
          />
        ) : passwordRecoveryStatus !== 'ready' ? (
          <RecoveryMessage
            actionLabel={t('recovery.requestNew')}
            body={passwordRecoveryError?.message ?? ''}
            onAction={() => router.replace(forgotPasswordRoute())}
            secondaryActionLabel={t('recovery.backToLogin')}
            onSecondaryAction={() => router.replace(loginRoute())}
            title={t('recovery.invalidTitle')}
            tone="danger"
          />
        ) : (
          <>
            <View style={styles.intro}>
              <ThemedText type="title">{t('recovery.resetTitle')}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {t('recovery.resetBody')}
              </ThemedText>
            </View>

            <ThemedView type="surface" style={[styles.card, { borderColor: theme.border }]}>
              <View style={styles.field}>
                <ThemedText type="smallBold">{t('account.newPassword')}</ThemedText>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={!isSubmitting}
                  onChangeText={setNewPassword}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  textContentType="newPassword"
                  value={newPassword}
                />
                <ThemedText type="small" themeColor="textSecondary">
                  {t('auth.passwordHint')}
                </ThemedText>
              </View>

              <View style={styles.field}>
                <ThemedText type="smallBold">{t('auth.passwordConfirm')}</ThemedText>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={!isSubmitting}
                  onChangeText={setPasswordConfirmation}
                  onSubmitEditing={() => void submit()}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  textContentType="newPassword"
                  value={passwordConfirmation}
                />
              </View>

              {feedback ? (
                <View
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  style={[
                    styles.feedback,
                    { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
                  ]}>
                  <ThemedText type="small" themeColor="danger">
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
                    {t('recovery.savePassword')}
                  </ThemedText>
                )}
              </Pressable>
            </ThemedView>
          </>
        )}
      </View>
    </Screen>
  );
}

function RecoveryMessage({
  actionLabel,
  body,
  onAction,
  onSecondaryAction,
  secondaryActionLabel,
  title,
  tone,
}: {
  actionLabel: string;
  body: string;
  onAction: () => void;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
  title: string;
  tone: 'danger' | 'success';
}) {
  const theme = useTheme();

  return (
    <ThemedView
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      type="surface"
      style={[
        styles.card,
        {
          backgroundColor: tone === 'danger' ? theme.dangerSoft : theme.successSoft,
          borderColor: tone === 'danger' ? theme.danger : theme.success,
        },
      ]}>
      <ThemedText type="subtitle" themeColor={tone}>
        {title}
      </ThemedText>
      <ThemedText>{body}</ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={onAction}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: theme.accent },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold" style={{ color: theme.background }}>
          {actionLabel}
        </ThemedText>
      </Pressable>
      {secondaryActionLabel && onSecondaryAction ? (
        <Pressable
          accessibilityRole="link"
          onPress={onSecondaryAction}
          style={({ pressed }) => [styles.secondaryLink, pressed && styles.pressed]}>
          <ThemedText type="smallBold" themeColor="accent">
            {secondaryActionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </ThemedView>
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
  loading: {
    alignItems: 'center',
    gap: Spacing.three,
    justifyContent: 'center',
    minHeight: 240,
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
