import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useI18n } from '@/features/i18n/i18n';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { useTripGroups } from '@/features/trip-groups/trip-group-context';
import { isCurrentLocationResponse } from '@/features/trip-groups/trip-group-state';
import { useTheme } from '@/hooks/use-theme';

type LocationFeedback =
  | { kind: 'denied' | 'location_error' | 'shared'; requestId: number }
  | { kind: 'supabase_error'; message: string; requestId: number };

export default function GroupScreen() {
  return (
    <RequireAuth returnTo="/group">
      <GroupContent />
    </RequireAuth>
  );
}

function GroupContent() {
  const theme = useTheme();
  const { language, t } = useI18n();
  const {
    groups: allGroups,
    hasSyncError,
    isLoading,
    isRefreshing,
    refresh,
    respondToLocationRequest,
    syncErrorMessage,
  } = useTripGroups();
  const [submittingRequestId, setSubmittingRequestId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<LocationFeedback | null>(null);
  const groups = allGroups.filter((group) => group.is_current_user_member);

  const declineRequest = async (requestId: number) => {
    if (submittingRequestId !== null) return;
    setSubmittingRequestId(requestId);
    setFeedback(null);
    try {
      const result = await respondToLocationRequest({
        accuracyMeters: null,
        latitude: null,
        longitude: null,
        requestId,
        share: false,
      });
      if (result.error) {
        setFeedback({
          kind: 'supabase_error',
          message: result.error.message,
          requestId,
        });
      }
    } catch (error) {
      const message = getOriginalErrorMessage(error);

      if (message) setFeedback({ kind: 'supabase_error', message, requestId });
    } finally {
      setSubmittingRequestId(null);
    }
  };

  const shareLocation = async (requestId: number) => {
    if (submittingRequestId !== null) return;
    setSubmittingRequestId(requestId);
    setFeedback(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setFeedback({ kind: 'denied', requestId });
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const result = await respondToLocationRequest({
        accuracyMeters: position.coords.accuracy,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        requestId,
        share: true,
      });
      if (result.error) {
        setFeedback({
          kind: 'supabase_error',
          message: result.error.message,
          requestId,
        });
      } else {
        setFeedback({ kind: 'shared', requestId });
      }
    } catch {
      setFeedback({ kind: 'location_error', requestId });
    } finally {
      setSubmittingRequestId(null);
    }
  };

  if (isLoading) {
    return (
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator color={theme.accent} size="large" />
        <ThemedText themeColor="textSecondary">{t('tripGroups.loading')}</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <ThemedText type="title">{t('tripGroups.title')}</ThemedText>
          <ThemedText themeColor="textSecondary">{t('tripGroups.body')}</ThemedText>
        </View>
        {isRefreshing ? <ActivityIndicator color={theme.accent} /> : null}
      </View>

      {hasSyncError ? (
        <Card style={[styles.inlineState, { borderColor: theme.warning }]}>
          <ThemedText type="small" themeColor="warning">
            {syncErrorMessage}
          </ThemedText>
          <Button
            icon="refresh"
            label={t('tripGroups.retry')}
            onPress={() => void refresh()}
            variant="secondary"
          />
        </Card>
      ) : null}

      {groups.length === 0 ? (
        <Card style={styles.stateCard}>
          <ThemedText type="heading">{t('tripGroups.emptyTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">{t('tripGroups.emptyBody')}</ThemedText>
        </Card>
      ) : (
        groups.map((group) => {
          const request = group.location_request;
          const pendingRequest = request?.status === 'pending' ? request : null;
          const responseIsCurrent = isCurrentLocationResponse(request);
          const sharedFeedbackIsAlreadyVisible =
            feedback?.kind === 'shared' &&
            request?.status === 'shared' &&
            responseIsCurrent;
          return (
            <Card key={group.id} style={styles.groupCard}>
              <View style={styles.groupHeader}>
                <View style={styles.headingText}>
                  <ThemedText type="heading">{group.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('tripGroups.memberCount', { count: group.members.length })}
                  </ThemedText>
                </View>
                {group.is_current_user_leader ? (
                  <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
                    <ThemedText type="tinyBold" themeColor="accent">
                      {t('tripGroups.youAreLeader')}
                    </ThemedText>
                  </View>
                ) : null}
              </View>

              <View style={styles.members}>
                {group.members.map((member) => (
                  <View
                    key={member.participant_id}
                    style={[styles.member, { borderColor: theme.border }]}>
                    <ThemedText type="smallBold">
                      {member.display_name}
                    </ThemedText>
                    {member.is_leader ? (
                      <ThemedText type="tinyBold" themeColor="accent">
                        {t('tripGroups.leader')}
                      </ThemedText>
                    ) : null}
                  </View>
                ))}
              </View>

              {group.is_current_user_leader && pendingRequest ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={[
                    styles.locationRequest,
                    { backgroundColor: theme.warningSoft, borderColor: theme.warning },
                  ]}>
                  <ThemedText type="heading">{t('tripGroups.request.title')}</ThemedText>
                  <ThemedText themeColor="textSecondary">
                    {t('tripGroups.request.body', {
                      date: formatDate(pendingRequest.requested_at, language),
                    })}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('tripGroups.request.privacy')}
                  </ThemedText>
                  <View style={styles.actions}>
                    <Button
                      disabled={submittingRequestId !== null}
                      icon="map"
                      label={t('tripGroups.request.share')}
                      onPress={() => void shareLocation(pendingRequest.id)}
                    />
                    <Button
                      disabled={submittingRequestId !== null}
                      icon="decline"
                      label={t('tripGroups.request.decline')}
                      onPress={() => void declineRequest(pendingRequest.id)}
                      variant="secondary"
                    />
                  </View>
                  {submittingRequestId === pendingRequest.id ? (
                    <View style={styles.progress}>
                      <ActivityIndicator color={theme.accent} />
                      <ThemedText type="small" themeColor="textSecondary">
                        {t('tripGroups.request.locating')}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              ) : group.is_current_user_leader && request?.status === 'shared' && responseIsCurrent ? (
                <ThemedText type="small" themeColor="success">
                  {t('tripGroups.request.shared')}
                </ThemedText>
              ) : group.is_current_user_leader &&
                request?.status === 'declined' &&
                responseIsCurrent ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('tripGroups.request.declined')}
                </ThemedText>
              ) : null}

              {feedback &&
              feedback.requestId === request?.id &&
              !sharedFeedbackIsAlreadyVisible ? (
                <ThemedText
                  accessibilityLiveRegion="polite"
                  type="small"
                  themeColor={feedback.kind === 'shared' ? 'success' : 'danger'}>
                  {feedback.kind === 'supabase_error'
                    ? feedback.message
                    : t(
                        feedback.kind === 'shared'
                          ? 'tripGroups.request.shared'
                          : feedback.kind === 'denied'
                            ? 'tripGroups.request.permissionDenied'
                            : 'tripGroups.request.locationError',
                      )}
                </ThemedText>
              ) : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

function formatDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', minHeight: 320 },
  heading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  headingText: { flex: 1, gap: Spacing.one },
  inlineState: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  stateCard: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four },
  groupCard: { gap: Spacing.three },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  badge: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  members: { gap: Spacing.one },
  member: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: Spacing.one,
  },
  locationRequest: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  progress: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
});
