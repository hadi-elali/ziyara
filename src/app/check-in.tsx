import { Redirect, type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useGroupCheck } from '@/features/group-check/group-check-context';
import { useI18n } from '@/features/i18n/i18n';
import { getProtectedReturnRoute } from '@/features/navigation/routes';
import { supabaseReadFailureTranslationKey } from '@/features/network/supabase-read';
import { useTheme } from '@/hooks/use-theme';

export default function CheckInScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const safeReturnTo = getProtectedReturnRoute(returnTo);

  return (
    <RequireAuth returnTo="/check-in">
      <CheckInContent returnTo={safeReturnTo === '/check-in' ? '/' : safeReturnTo} />
    </RequireAuth>
  );
}

function CheckInContent({ returnTo }: { returnTo: ReturnType<typeof getProtectedReturnRoute> }) {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();
  const {
    continueWithoutAccount,
    hasProfileError,
    isAdmin,
    refreshProfile,
  } = useAuth();
  const {
    activeCheck,
    currentResponse,
    hasSyncError,
    isLoading,
    refresh,
    respond,
    syncErrorKind,
  } = useGroupCheck();
  const [continueWithoutAccountError, setContinueWithoutAccountError] = useState(false);
  const [isContinuingWithoutAccount, setIsContinuingWithoutAccount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const handleContinueWithoutAccount = async () => {
    if (isContinuingWithoutAccount) {
      return;
    }

    setContinueWithoutAccountError(false);
    setIsContinuingWithoutAccount(true);

    try {
      const { error } = await continueWithoutAccount();

      if (error) {
        setContinueWithoutAccountError(true);
        return;
      }

      router.replace('/');
    } catch {
      setContinueWithoutAccountError(true);
    } finally {
      setIsContinuingWithoutAccount(false);
    }
  };

  const submitAnswer = async (answer: boolean) => {
    if (!activeCheck || isSubmitting) {
      return;
    }

    setSubmitError(false);
    setIsSubmitting(true);

    try {
      const { error } = await respond(activeCheck.id, answer);
      setSubmitError(Boolean(error));

      if (!error && !isAdmin) {
        router.replace(returnTo as Href);
      }
    } catch {
      setSubmitError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasProfileError || !activeCheck) {
    if (!hasProfileError && !isLoading && !hasSyncError) {
      return <Redirect href={returnTo as Href} />;
    }

    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <View style={styles.centeredContent}>
          {hasProfileError || hasSyncError ? (
            <Card style={styles.statusCard}>
              <ThemedText type="heading">
                {t(hasProfileError ? 'auth.profileErrorTitle' : 'groupCheck.syncErrorTitle')}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {t(
                  hasProfileError
                    ? 'auth.profileErrorBody'
                    : supabaseReadFailureTranslationKey(syncErrorKind ?? 'server'),
                )}
              </ThemedText>
              <Button
                disabled={isContinuingWithoutAccount}
                icon="refresh"
                label={t(hasProfileError ? 'auth.profileRetry' : 'groupCheck.retry')}
                onPress={() => void (hasProfileError ? refreshProfile() : refresh())}
              />
              {hasProfileError ? (
                <Button
                  disabled={isContinuingWithoutAccount}
                  icon="logout"
                  label={t('auth.signOutAndContinueWithoutAccount')}
                  onPress={() => void handleContinueWithoutAccount()}
                  variant="secondary"
                />
              ) : null}
              {isContinuingWithoutAccount ? (
                <ActivityIndicator color={theme.accent} />
              ) : null}
              {continueWithoutAccountError ? (
                <ThemedText
                  accessibilityLiveRegion="polite"
                  themeColor="danger"
                  type="small">
                  {t('auth.continueWithoutAccountError')}
                </ThemedText>
              ) : null}
            </Card>
          ) : (
            <ActivityIndicator color={theme.accent} size="large" />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={[styles.statusDot, { backgroundColor: theme.warning }]} />
        <ThemedText type="smallBold" themeColor="warning">
          {t('groupCheck.activeLabel')}
        </ThemedText>

        <Card style={styles.questionCard}>
          <ThemedText type="title" style={styles.question}>
            {activeCheck.question}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.description}>
            {t('groupCheck.userBody')}
          </ThemedText>

          <View style={styles.answers}>
            <AnswerButton
              answer
              disabled={isSubmitting}
              label={t('groupCheck.yes')}
              onPress={() => void submitAnswer(true)}
              selected={currentResponse === true}
            />
            <AnswerButton
              answer={false}
              disabled={isSubmitting}
              label={t('groupCheck.no')}
              onPress={() => void submitAnswer(false)}
              selected={currentResponse === false}
            />
          </View>

          {isSubmitting ? <ActivityIndicator color={theme.accent} /> : null}

          {submitError ? (
            <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
              {t('groupCheck.submitError')}
            </ThemedText>
          ) : currentResponse !== null ? (
            <ThemedText type="smallBold" themeColor="success" accessibilityLiveRegion="polite">
              {t('groupCheck.answerSaved')}
            </ThemedText>
          ) : null}
        </Card>

        <ThemedText type="small" themeColor="textSecondary" style={styles.waitingText}>
          {t(
            currentResponse !== null
              ? 'groupCheck.answeredBody'
              : isAdmin
                ? 'groupCheck.adminParticipantBody'
                : 'groupCheck.lockedBody',
          )}
        </ThemedText>

        {currentResponse !== null ? (
          <Button
            icon="home"
            label={t('groupCheck.returnToApp')}
            onPress={() => router.replace(returnTo as Href)}
            style={styles.returnButton}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function AnswerButton({
  answer,
  disabled,
  label,
  onPress,
  selected,
}: {
  answer: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const theme = useTheme();
  const color = answer ? theme.success : theme.danger;
  const backgroundColor = answer ? theme.successSoft : theme.dangerSoft;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.answerButton,
        {
          backgroundColor,
          borderColor: color,
          borderWidth: selected ? 3 : StyleSheet.hairlineWidth,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <SymbolIcon color={color} name={answer ? 'confirm' : 'decline'} size={32} />
      <ThemedText type="heading" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  centeredContent: {
    alignSelf: 'center',
    flex: 1,
    justifyContent: 'center',
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    width: '100%',
  },
  content: {
    alignItems: 'center',
    alignSelf: 'center',
    flex: 1,
    justifyContent: 'center',
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    width: '100%',
  },
  statusCard: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  statusDot: {
    borderRadius: 6,
    height: 12,
    marginBottom: Spacing.two,
    width: 12,
  },
  questionCard: {
    alignItems: 'stretch',
    gap: Spacing.four,
    marginTop: Spacing.three,
    padding: Spacing.four,
    width: '100%',
  },
  question: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
  },
  answers: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  answerButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 120,
    padding: Spacing.three,
  },
  waitingText: {
    marginTop: Spacing.three,
    maxWidth: 520,
    textAlign: 'center',
  },
  returnButton: {
    marginTop: Spacing.three,
    maxWidth: 520,
    width: '100%',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.55,
  },
});
