import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import type { AdminGroupCheckResult } from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import { useGroupCheck } from '@/features/group-check/group-check-context';
import {
  parseAdminGroupCheckResults,
  summarizeGroupCheckResults,
  type GroupCheckResultGroup,
} from '@/features/group-check/group-check-results';
import { useI18n } from '@/features/i18n/i18n';
import {
  getOriginalErrorMessage,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';
import { useTheme } from '@/hooks/use-theme';

export function AdminGroupCheckPanel() {
  const theme = useTheme();
  const { isRTL, t } = useI18n();
  const {
    activeCheck,
    closeCheck,
    hasSyncError,
    refresh,
    startCheck,
    syncErrorMessage,
  } = useGroupCheck();
  const [results, setResults] = useState<AdminGroupCheckResult[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [resultsErrorMessage, setResultsErrorMessage] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [hasQuestionError, setHasQuestionError] = useState(false);
  const [resultsCheckId, setResultsCheckId] = useState<number | null>(null);
  const resultsRequestSequence = useRef(0);

  const checkId = activeCheck?.id ?? null;
  const displayedResults = resultsCheckId === checkId ? results : [];
  const isInitialResultsLoading = isLoadingResults && resultsCheckId !== checkId;

  const loadResults = useCallback(async () => {
    if (checkId === null) {
      setResults([]);
      setResultsCheckId(null);
      setResultsErrorMessage(null);
      setIsLoadingResults(false);
      return;
    }

    const requestedCheckId = checkId;
    const requestSequence = ++resultsRequestSequence.current;
    setIsLoadingResults(true);
    setResultsErrorMessage(null);

    try {
      const { data, error } = await withSupabaseReadTimeout((signal) =>
        supabase
          .rpc('admin_group_check_results', {
            p_check_id: checkId,
          })
          .abortSignal(signal),
      );

      if (error) {
        throw error;
      }

      const nextResults = parseAdminGroupCheckResults(data);

      if (!nextResults) {
        throw new Error('Die Gruppencheck-Ergebnisse entsprechen nicht dem erwarteten Schema.');
      }

      if (requestSequence === resultsRequestSequence.current) {
        setResults(nextResults);
        setResultsCheckId(requestedCheckId);
      }
    } catch (error) {
      if (requestSequence === resultsRequestSequence.current) {
        setResultsErrorMessage(getOriginalErrorMessage(error));
      }
    } finally {
      if (requestSequence === resultsRequestSequence.current) {
        setIsLoadingResults(false);
      }
    }
  }, [checkId]);

  useEffect(() => {
    if (checkId === null) {
      return;
    }

    const initialLoadTimeout = setTimeout(() => void loadResults(), 0);
    let realtimeRefreshTimeout: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(`admin-group-check-results:${checkId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `check_id=eq.${checkId}`,
          schema: 'public',
          table: 'group_check_responses',
        },
        () => {
          if (realtimeRefreshTimeout) {
            clearTimeout(realtimeRefreshTimeout);
          }

          realtimeRefreshTimeout = setTimeout(() => void loadResults(), 250);
        },
      )
      .subscribe();

    return () => {
      clearTimeout(initialLoadTimeout);
      if (realtimeRefreshTimeout) {
        clearTimeout(realtimeRefreshTimeout);
      }
      resultsRequestSequence.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [checkId, loadResults]);

  const handleStart = async () => {
    if (isWorking) {
      return;
    }

    const normalizedQuestion = question.trim();

    if (normalizedQuestion.length < 3) {
      setHasQuestionError(true);
      return;
    }

    setHasQuestionError(false);
    setActionErrorMessage(null);
    setIsWorking(true);

    try {
      const { error } = await startCheck(normalizedQuestion);
      setActionErrorMessage(error?.message ?? null);

      if (!error) {
        setQuestion('');
      }
    } catch (error) {
      setActionErrorMessage(getOriginalErrorMessage(error));
    } finally {
      setIsWorking(false);
    }
  };

  const handleClose = async () => {
    if (!activeCheck || isWorking) {
      return;
    }

    setActionErrorMessage(null);
    setIsWorking(true);

    try {
      const { error } = await closeCheck(activeCheck.id);
      setActionErrorMessage(error?.message ?? null);
    } catch (error) {
      setActionErrorMessage(getOriginalErrorMessage(error));
    } finally {
      setIsWorking(false);
    }
  };

  const resultSummary = summarizeGroupCheckResults(displayedResults);

  return (
    <Card style={styles.panel}>
      <ThemedText themeColor="textSecondary">
        {activeCheck ? t('groupCheck.adminActiveBody') : t('groupCheck.adminBody')}
      </ThemedText>

      {hasSyncError && !activeCheck ? (
        <View style={styles.errorBlock}>
          <ThemedText type="small" themeColor="danger">
            {syncErrorMessage}
          </ThemedText>
          <Button
            icon="refresh"
            label={t('groupCheck.retry')}
            onPress={() => void refresh()}
            variant="secondary"
          />
        </View>
      ) : activeCheck ? (
        <>
          <View
            style={[
              styles.activeQuestion,
              { backgroundColor: theme.warningSoft, borderColor: theme.warning },
            ]}>
            <ThemedText type="smallBold" themeColor="warning">
              {t('groupCheck.activeLabel')}
            </ThemedText>
            <ThemedText type="heading">{activeCheck.question}</ThemedText>
          </View>

          {isInitialResultsLoading ? (
            <ActivityIndicator color={theme.accent} />
          ) : resultsErrorMessage ? (
            <View style={styles.errorBlock}>
              <ThemedText type="small" themeColor="danger">
                {resultsErrorMessage}
              </ThemedText>
              <Button
                icon="refresh"
                label={t('groupCheck.retry')}
                onPress={() => void loadResults()}
                variant="secondary"
              />
            </View>
          ) : (
            <>
              <View
                style={[
                  styles.resultsOverview,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}>
                <ThemedText type="smallBold">
                  {t('groupCheck.accountCount', { count: resultSummary.totalAccounts })}
                </ThemedText>
                <ThemedText type="smallBold">
                  {t('groupCheck.representedPeopleCount', {
                    count: resultSummary.totalRepresentedPeople,
                  })}
                </ThemedText>
              </View>
              <View style={styles.resultsGrid}>
                <ResultColumn
                  color={theme.success}
                  emptyLabel={t('groupCheck.noConfirmed')}
                  group={resultSummary.yes}
                  title={t('groupCheck.resultYes')}
                />
                <ResultColumn
                  color={theme.danger}
                  emptyLabel={t('groupCheck.noDeclined')}
                  group={resultSummary.no}
                  title={t('groupCheck.resultNo')}
                />
                <ResultColumn
                  color={theme.warning}
                  emptyLabel={t('groupCheck.noOpen')}
                  group={resultSummary.open}
                  title={t('groupCheck.resultOpen')}
                />
              </View>
              {isLoadingResults ? <ActivityIndicator color={theme.accent} /> : null}
            </>
          )}

          <Button
            disabled={isWorking}
            icon="close"
            label={t('groupCheck.close')}
            onPress={() => void handleClose()}
            variant="secondary"
          />
        </>
      ) : (
        <View style={styles.actions}>
          <View style={styles.questionField}>
            <ThemedText type="smallBold">{t('groupCheck.questionLabel')}</ThemedText>
            <TextInput
              accessibilityLabel={t('groupCheck.questionLabel')}
              editable={!isWorking}
              maxLength={240}
              multiline
              onChangeText={(value) => {
                setQuestion(value);
                setHasQuestionError(false);
              }}
              placeholder={t('groupCheck.questionPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.questionInput,
                {
                  backgroundColor: theme.background,
                  borderColor: hasQuestionError ? theme.danger : theme.border,
                  color: theme.text,
                  textAlign: isRTL ? 'right' : 'left',
                },
              ]}
              textAlignVertical="top"
              value={question}
            />
            <View style={styles.questionMeta}>
              {hasQuestionError ? (
                <ThemedText type="small" themeColor="danger">
                  {t('groupCheck.questionValidation')}
                </ThemedText>
              ) : (
                <View />
              )}
              <ThemedText type="small" themeColor="textSecondary">
                {question.length}/240
              </ThemedText>
            </View>
          </View>
          <Button
            disabled={isWorking}
            icon="people"
            label={t('groupCheck.start')}
            onPress={() => void handleStart()}
          />
        </View>
      )}

      {isWorking ? <ActivityIndicator color={theme.accent} /> : null}
      {actionErrorMessage ? (
        <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
          {actionErrorMessage}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function ResultColumn({
  color,
  emptyLabel,
  group,
  title,
}: {
  color: string;
  emptyLabel: string;
  group: GroupCheckResultGroup;
  title: string;
}) {
  const { t } = useI18n();

  return (
    <View style={styles.resultColumn}>
      <ThemedText type="heading" style={{ color }}>
        {title}
      </ThemedText>
      <View style={styles.resultCounts}>
        <ThemedText type="tinyBold" themeColor="textSecondary">
          {t('groupCheck.accountCount', { count: group.accountCount })}
        </ThemedText>
        <ThemedText type="tinyBold" themeColor="textSecondary">
          {t('groupCheck.representedPeopleCount', { count: group.representedPeople })}
        </ThemedText>
      </View>
      {group.results.length > 0 ? (
        group.results.map((result, index) => (
          <View key={`${result.display_name}-${index}`} style={styles.name}>
            <ThemedText>{result.display_name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('groupCheck.accountPartySize', { count: result.party_size })}
            </ThemedText>
          </View>
        ))
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {emptyLabel}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.three,
  },
  activeQuestion: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  actions: {
    gap: Spacing.three,
  },
  questionField: {
    gap: Spacing.two,
  },
  questionInput: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 112,
    padding: Spacing.three,
  },
  questionMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  resultColumn: {
    flex: 1,
    gap: Spacing.two,
    minWidth: 180,
  },
  name: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.half,
    paddingBottom: Spacing.two,
  },
  resultCounts: {
    gap: Spacing.half,
  },
  resultsOverview: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  errorBlock: {
    gap: Spacing.two,
  },
});
