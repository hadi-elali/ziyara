import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useI18n } from '@/features/i18n/i18n';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { useQuestionRound } from '@/features/question-round/question-round-context';
import { useTheme } from '@/hooks/use-theme';

export default function QuestionRoundScreen() {
  return (
    <RequireAuth returnTo="/question-round">
      <QuestionRoundContent />
    </RequireAuth>
  );
}

function QuestionRoundContent() {
  const theme = useTheme();
  const { isRTL, t } = useI18n();
  const {
    activeRound,
    hasSyncError,
    isLoading,
    refresh,
    submitQuestion,
    syncErrorMessage,
  } = useQuestionRound();
  const [question, setQuestion] = useState('');
  const [feedback, setFeedback] = useState<'error' | 'limit' | 'success' | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const normalizedQuestion = question.trim();

  if (!activeRound && !isLoading && !hasSyncError) {
    return <Redirect href="/" />;
  }

  if (!activeRound) {
    return (
      <Screen safeAreaEdges={['right', 'bottom', 'left']}>
        <Card style={styles.card}>
          {hasSyncError ? (
            <>
              <ThemedText type="heading">{t('questionRound.syncErrorTitle')}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {syncErrorMessage}
              </ThemedText>
              <Button
                icon="refresh"
                label={t('groupCheck.retry')}
                onPress={() => void refresh()}
              />
            </>
          ) : (
            <ActivityIndicator color={theme.accent} size="large" />
          )}
        </Card>
      </Screen>
    );
  }

  const submit = async () => {
    if (!activeRound || isSubmitting) {
      return;
    }

    if (normalizedQuestion.length < 3) {
      setFeedback('error');
      return;
    }

    Keyboard.dismiss();
    setFeedback(null);
    setSubmitErrorMessage(null);
    setIsSubmitting(true);

    try {
      const { error } = await submitQuestion(activeRound.id, normalizedQuestion);

      if (error) {
        setFeedback('error');
        setSubmitErrorMessage(error.message);
      } else {
        setQuestion('');
        setFeedback('success');
      }
    } catch (error) {
      const message = getOriginalErrorMessage(error);

      if (message) {
        setFeedback('error');
        setSubmitErrorMessage(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen safeAreaEdges={['right', 'bottom', 'left']}>
      <View style={styles.intro}>
        <ThemedText type="title">{t('questionRound.userTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">{t('questionRound.userBody')}</ThemedText>
      </View>

      <Card style={styles.card}>
        <View
          style={[
            styles.privacyNotice,
            { backgroundColor: theme.accentSoft, borderColor: theme.accent },
          ]}>
          <ThemedText type="smallBold" themeColor="accent">
            {t('questionRound.anonymousTitle')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('questionRound.anonymousBody')}
          </ThemedText>
        </View>

        <View style={styles.field}>
          <ThemedText type="smallBold">{t('questionRound.questionLabel')}</ThemedText>
          <TextInput
            accessibilityLabel={t('questionRound.questionLabel')}
            editable={!isSubmitting}
            maxLength={500}
            multiline
            onChangeText={(value) => {
              setQuestion(value);
              setFeedback(null);
              setSubmitErrorMessage(null);
            }}
            placeholder={t('questionRound.questionPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              {
                backgroundColor: theme.background,
                borderColor: feedback === 'error' ? theme.danger : theme.border,
                color: theme.text,
                textAlign: isRTL ? 'right' : 'left',
              },
            ]}
            textAlignVertical="top"
            value={question}
          />
          <ThemedText type="small" themeColor="textSecondary" style={styles.characterCount}>
            {question.length}/500
          </ThemedText>
        </View>

        {feedback ? (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.feedback,
              {
                backgroundColor:
                  feedback === 'success' ? theme.successSoft : theme.dangerSoft,
                borderColor: feedback === 'success' ? theme.success : theme.danger,
              },
            ]}>
            <ThemedText
              type="small"
              themeColor={feedback === 'success' ? 'success' : 'danger'}>
              {submitErrorMessage ??
                t(
                  feedback === 'limit'
                    ? 'questionRound.submitLimit'
                    : feedback === 'error'
                      ? 'questionRound.validation'
                      : 'questionRound.submitSuccess',
                )}
            </ThemedText>
          </View>
        ) : null}

        <Button
          disabled={isSubmitting || !activeRound}
          icon="question"
          label={t('questionRound.submit')}
          onPress={() => void submit()}
        />
        {isSubmitting ? <ActivityIndicator color={theme.accent} /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.three,
  },
  privacyNotice: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 180,
    padding: Spacing.three,
  },
  characterCount: {
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  feedback: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
});
