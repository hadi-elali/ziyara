import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { allPlaces } from '@/data/places';
import type { TripGuidanceStatus } from '@/domain/database';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useI18n } from '@/features/i18n/i18n';
import { placeRoute } from '@/features/navigation/routes';
import { supabaseReadFailureTranslationKey } from '@/features/network/supabase-read';
import { openNavigation, openNavigationQuery } from '@/features/places/openNavigation';
import { useTripGuidance } from '@/features/trip-guidance/trip-guidance-context';
import {
  distanceInMeters,
  getTripGuidanceSubmitFailureKind,
  type TripGuidanceParticipantState,
  type TripGuidanceSubmitFailureKind,
} from '@/features/trip-guidance/trip-guidance-state';
import { useTheme } from '@/hooks/use-theme';

const statusOptions: TripGuidanceStatus[] = [
  'on_way',
  'almost_there',
  'at_meeting_point',
  'problem',
  'lost',
  'medical_help',
];

type DistanceState =
  | { kind: 'denied' | 'error' | 'idle' | 'loading' }
  | { kind: 'ready'; meters: number };

export default function GuideScreen() {
  return (
    <RequireAuth returnTo="/guide">
      <GuideContent />
    </RequireAuth>
  );
}

function GuideContent() {
  const theme = useTheme();
  const { language, t } = useI18n();
  const {
    activeGuidance,
    activeTrip,
    hasSyncError,
    isLoading,
    isRefreshing,
    participants,
    pendingCount,
    refresh,
    retryPending,
    setStatus,
    syncErrorKind,
  } = useTripGuidance();
  const [submittingParticipantId, setSubmittingParticipantId] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<{
    kind: TripGuidanceSubmitFailureKind;
    participantId: number;
  } | null>(null);
  const [distanceState, setDistanceState] = useState<DistanceState>({ kind: 'idle' });

  const departureLabel = activeGuidance
    ? new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(activeGuidance.departure_at))
    : null;

  const currentPlace = activeGuidance?.current_place_slug
    ? allPlaces.find((place) => place.slug === activeGuidance.current_place_slug)
    : undefined;

  const openCurrentPlace = () => {
    if (!activeGuidance) return;
    if (currentPlace) {
      router.push(placeRoute(currentPlace.slug));
      return;
    }
    if (
      activeGuidance.current_latitude !== null &&
      activeGuidance.current_longitude !== null
    ) {
      void openNavigation({
        latitude: activeGuidance.current_latitude,
        longitude: activeGuidance.current_longitude,
        name: activeGuidance.current_place_name,
      });
      return;
    }
    void openNavigationQuery(activeGuidance.current_place_name);
  };

  const openMeetingPoint = () => {
    if (
      !activeGuidance
    ) {
      return;
    }
    if (
      activeGuidance.meeting_latitude !== null &&
      activeGuidance.meeting_longitude !== null
    ) {
      void openNavigation({
        latitude: activeGuidance.meeting_latitude,
        longitude: activeGuidance.meeting_longitude,
        name: activeGuidance.meeting_point,
      });
      return;
    }
    void openNavigationQuery(activeGuidance.meeting_point);
  };

  const calculateDistance = async () => {
    if (
      !activeGuidance ||
      activeGuidance.meeting_latitude === null ||
      activeGuidance.meeting_longitude === null ||
      distanceState.kind === 'loading'
    ) {
      return;
    }
    setDistanceState({ kind: 'loading' });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setDistanceState({ kind: 'denied' });
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setDistanceState({
        kind: 'ready',
        meters: distanceInMeters(position.coords, {
          latitude: activeGuidance.meeting_latitude,
          longitude: activeGuidance.meeting_longitude,
        }),
      });
    } catch {
      setDistanceState({ kind: 'error' });
    }
  };

  const submitStatus = async (participantId: number, status: TripGuidanceStatus) => {
    if (!activeGuidance || submittingParticipantId !== null) return;
    setSubmitError(null);
    setSubmittingParticipantId(participantId);
    try {
      const result = await setStatus(activeGuidance.id, participantId, status);
      if (result.error) {
        setSubmitError({
          kind: getTripGuidanceSubmitFailureKind(result.error),
          participantId,
        });
      }
    } catch {
      setSubmitError({ kind: 'server', participantId });
    } finally {
      setSubmittingParticipantId(null);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.accent} size="large" />
          <ThemedText themeColor="textSecondary">{t('guide.loading')}</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (hasSyncError && !activeTrip) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <View style={styles.centered}>
          <Card style={styles.stateCard}>
            <ThemedText type="heading">{t('guide.syncErrorTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {t(supabaseReadFailureTranslationKey(syncErrorKind ?? 'server'))}
            </ThemedText>
            <Button icon="refresh" label={t('guide.retry')} onPress={() => void refresh()} />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.heading}>
            <View style={styles.headingText}>
              <ThemedText type="title">{t('guide.title')}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {activeTrip?.name ?? t('guide.noAssignmentTitle')}
              </ThemedText>
            </View>
            {isRefreshing ? <ActivityIndicator color={theme.accent} /> : null}
          </View>

          {hasSyncError ? (
            <Card style={[styles.inlineState, { borderColor: theme.warning }]}>
              <ThemedText type="small" themeColor="warning">
                {t(supabaseReadFailureTranslationKey(syncErrorKind ?? 'server'))}
              </ThemedText>
              <Button
                icon="refresh"
                label={t('guide.retry')}
                onPress={() => void refresh()}
                variant="secondary"
              />
            </Card>
          ) : null}

          {pendingCount > 0 ? (
            <Card
              accessibilityLiveRegion="polite"
              style={[styles.inlineState, { borderColor: theme.warning }]}>
              <View style={styles.flexText}>
                <ThemedText type="smallBold" themeColor="warning">
                  {t('guide.pendingTitle')}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('guide.pendingBody')}
                </ThemedText>
              </View>
              <Button
                icon="refresh"
                label={t('guide.pendingRetry')}
                onPress={() => void retryPending()}
                variant="secondary"
              />
            </Card>
          ) : null}

          {!activeTrip || participants.length === 0 ? (
            <Card style={styles.stateCard}>
              <ThemedText type="heading">{t('guide.noAssignmentTitle')}</ThemedText>
              <ThemedText themeColor="textSecondary">{t('guide.noAssignmentBody')}</ThemedText>
            </Card>
          ) : !activeGuidance ? (
            <Card style={styles.stateCard}>
              <ThemedText type="heading">{t('guide.noUpdateTitle')}</ThemedText>
              <ThemedText themeColor="textSecondary">{t('guide.noUpdateBody')}</ThemedText>
            </Card>
          ) : (
            <>
              <Card style={[styles.programCard, { borderColor: theme.accent }]}>
                <ThemedText type="smallBold" themeColor="accent">
                  {t('guide.currentLabel')}
                </ThemedText>
                <ThemedText type="title">{activeGuidance.current_place_name}</ThemedText>
                <Button
                  icon={currentPlace ? 'info' : 'map'}
                  label={t(currentPlace ? 'guide.openPlace' : 'guide.openNavigation')}
                  onPress={openCurrentPlace}
                  variant="secondary"
                />
              </Card>

              <View style={styles.infoGrid}>
                <InfoCard label={t('guide.nextProgram')} value={activeGuidance.next_program_name} />
                <InfoCard label={t('guide.departure')} value={departureLabel ?? '—'} />
                <InfoCard label={t('guide.meetingPoint')} value={activeGuidance.meeting_point} />
                <InfoCard
                  label={t('guide.relevantGate')}
                  value={activeGuidance.relevant_gate ?? t('guide.notSpecified')}
                />
              </View>

              <Card style={styles.detailCard}>
                <ThemedText type="heading">{t('guide.distance')}</ThemedText>
                {activeGuidance.distance_hint ? (
                  <ThemedText>{activeGuidance.distance_hint}</ThemedText>
                ) : null}
                {distanceState.kind === 'ready' ? (
                  <ThemedText type="smallBold" themeColor="accent">
                    {formatDistance(distanceState.meters, language)}
                  </ThemedText>
                ) : distanceState.kind === 'denied' ? (
                  <ThemedText type="small" themeColor="warning">
                    {t('guide.distanceDenied')}
                  </ThemedText>
                ) : distanceState.kind === 'error' ? (
                  <ThemedText type="small" themeColor="danger">
                    {t('guide.distanceError')}
                  </ThemedText>
                ) : null}
                <View style={styles.actions}>
                  {activeGuidance.meeting_latitude !== null &&
                  activeGuidance.meeting_longitude !== null ? (
                    <Button
                      disabled={distanceState.kind === 'loading'}
                      icon="map"
                      label={
                        distanceState.kind === 'loading'
                          ? t('guide.distanceLoading')
                          : t('guide.calculateDistance')
                      }
                      onPress={() => void calculateDistance()}
                      style={styles.actionButton}
                      variant="secondary"
                    />
                  ) : null}
                  <Button
                    icon="external-link"
                    label={t('guide.openNavigation')}
                    onPress={openMeetingPoint}
                    style={styles.actionButton}
                  />
                </View>
                {activeGuidance.meeting_latitude === null ||
                activeGuidance.meeting_longitude === null ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('guide.noCoordinatesDistance')}
                  </ThemedText>
                ) : null}
                <ThemedText type="small" themeColor="textSecondary">
                  {t('guide.noTracking')}
                </ThemedText>
              </Card>

              <Card style={styles.detailCard}>
                <ThemedText type="heading">{t('guide.description')}</ThemedText>
                <ThemedText themeColor={activeGuidance.description ? 'text' : 'textSecondary'}>
                  {activeGuidance.description ?? t('guide.notSpecified')}
                </ThemedText>
              </Card>

              <Card style={styles.detailCard}>
                <ThemedText type="heading">{t('guide.acts')}</ThemedText>
                <ThemedText themeColor={activeGuidance.acts ? 'text' : 'textSecondary'}>
                  {activeGuidance.acts ?? t('guide.notSpecified')}
                </ThemedText>
              </Card>

              <View style={styles.statusSection}>
                <View style={styles.headingText}>
                  <ThemedText type="heading">{t('guide.statusTitle')}</ThemedText>
                  <ThemedText themeColor="textSecondary">{t('guide.statusBody')}</ThemedText>
                </View>
                {participants.map((participant) => (
                  <ParticipantStatusCard
                    disabled={submittingParticipantId !== null}
                    isSubmitting={submittingParticipantId === participant.id}
                    key={participant.id}
                    onStatus={(status) => void submitStatus(participant.id, status)}
                    participant={participant}
                    submitErrorKind={
                      submitError?.participantId === participant.id ? submitError.kind : null
                    }
                  />
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.infoCard}>
      <ThemedText type="smallBold" themeColor="accent">
        {label}
      </ThemedText>
      <ThemedText type="heading">{value}</ThemedText>
    </Card>
  );
}

function ParticipantStatusCard({
  disabled,
  isSubmitting,
  onStatus,
  participant,
  submitErrorKind,
}: {
  disabled: boolean;
  isSubmitting: boolean;
  onStatus: (status: TripGuidanceStatus) => void;
  participant: TripGuidanceParticipantState;
  submitErrorKind: TripGuidanceSubmitFailureKind | null;
}) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Card style={styles.participantCard}>
      <View style={styles.participantHeading}>
        <View style={styles.flexText}>
          <ThemedText type="heading">{participant.display_name}</ThemedText>
        </View>
        {participant.status ? (
          <View
            style={[
              styles.statusBadge,
              { borderColor: statusColor(participant.status, theme) },
            ]}>
            <ThemedText
              type="smallBold"
              style={{ color: statusColor(participant.status, theme) }}>
              {t(`guide.status.${participant.status}`)}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View accessibilityRole="radiogroup" style={styles.statusButtons}>
        {statusOptions.map((status) => {
          const selected = participant.status === status;
          const color = statusColor(status, theme);
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              key={status}
              onPress={() => onStatus(status)}
              style={({ pressed }) => [
                styles.statusButton,
                {
                  backgroundColor: selected ? color : theme.backgroundElement,
                  borderColor: color,
                },
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}>
              <ThemedText
                type="smallBold"
                style={selected ? { color: theme.background } : { color }}>
                {t(`guide.status.${status}`)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {isSubmitting ? <ActivityIndicator color={theme.accent} /> : null}
      {submitErrorKind ? (
        <ThemedText accessibilityLiveRegion="polite" themeColor="danger" type="small">
          {t(`guide.submitError.${submitErrorKind}`)}
        </ThemedText>
      ) : participant.isPending ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.pendingStatus, { backgroundColor: theme.warningSoft }]}>
          <ThemedText type="smallBold" themeColor="warning">
            {t('guide.statusPending')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('guide.statusPendingBody')}
          </ThemedText>
        </View>
      ) : participant.status === 'problem' &&
        participant.response?.acknowledged_by_display_name ? (
        <ThemedText accessibilityLiveRegion="polite" themeColor="success" type="smallBold">
          {t('guide.problemAcknowledged', {
            name: participant.response.acknowledged_by_display_name,
          })}
        </ThemedText>
      ) : participant.status ? (
        <ThemedText accessibilityLiveRegion="polite" themeColor="success" type="small">
          {t('guide.statusSaved')}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function statusColor(status: TripGuidanceStatus, theme: ReturnType<typeof useTheme>) {
  if (status === 'at_meeting_point') return theme.success;
  if (status === 'problem' || status === 'lost' || status === 'medical_help') return theme.danger;
  if (status === 'almost_there') return theme.warning;
  return theme.accent;
}

function formatDistance(meters: number, language: string) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}

const styles = StyleSheet.create({
  actionButton: {
    flexGrow: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.three,
    justifyContent: 'center',
    padding: Spacing.three,
  },
  content: {
    alignSelf: 'center',
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    width: '100%',
  },
  detailCard: {
    gap: Spacing.two,
  },
  disabled: {
    opacity: 0.48,
  },
  flexText: {
    flex: 1,
    gap: Spacing.half,
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  headingText: {
    gap: Spacing.half,
  },
  infoCard: {
    flexGrow: 1,
    gap: Spacing.one,
    minWidth: 220,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  inlineState: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  participantCard: {
    gap: Spacing.three,
  },
  participantHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  pendingStatus: {
    borderRadius: 8,
    gap: Spacing.half,
    padding: Spacing.two,
  },
  pressed: {
    opacity: 0.72,
  },
  programCard: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  stateCard: {
    gap: Spacing.two,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  statusButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 130,
    paddingHorizontal: Spacing.two,
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statusSection: {
    gap: Spacing.three,
  },
});
