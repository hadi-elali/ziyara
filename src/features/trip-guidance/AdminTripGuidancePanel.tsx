import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { allPlaces } from '@/data/places';
import type { TripGuidanceStatus, TripGuidanceUpdate } from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import { useI18n } from '@/features/i18n/i18n';
import { localizePlace } from '@/features/i18n/localizedData';
import { supabaseReadFailureTranslationKey } from '@/features/network/supabase-read';
import type { MeetingPointCoordinate } from '@/features/trip-guidance/meeting-point-picker-types';
import { useTripGuidance } from '@/features/trip-guidance/trip-guidance-context';
import { useTheme } from '@/hooks/use-theme';

const departureMinuteOptions = [15, 30, 60, 90] as const;

type FormState = {
  acts: string;
  currentLatitude: string;
  currentLongitude: string;
  currentPlaceName: string;
  currentPlaceSlug: string;
  departureAt: string;
  description: string;
  distanceHint: string;
  meetingLatitude: string;
  meetingLongitude: string;
  meetingPoint: string;
  nextProgramName: string;
  relevantGate: string;
};

function emptyForm(): FormState {
  return {
    acts: '',
    currentLatitude: '',
    currentLongitude: '',
    currentPlaceName: '',
    currentPlaceSlug: '',
    departureAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    description: '',
    distanceHint: '',
    meetingLatitude: '',
    meetingLongitude: '',
    meetingPoint: '',
    nextProgramName: '',
    relevantGate: '',
  };
}

function formFromGuidance(guidance: TripGuidanceUpdate): FormState {
  return {
    acts: guidance.acts ?? '',
    currentLatitude: guidance.current_latitude?.toString() ?? '',
    currentLongitude: guidance.current_longitude?.toString() ?? '',
    currentPlaceName: guidance.current_place_name,
    currentPlaceSlug: guidance.current_place_slug ?? '',
    departureAt: guidance.departure_at,
    description: guidance.description ?? '',
    distanceHint: guidance.distance_hint ?? '',
    meetingLatitude: guidance.meeting_latitude?.toString() ?? '',
    meetingLongitude: guidance.meeting_longitude?.toString() ?? '',
    meetingPoint: guidance.meeting_point,
    nextProgramName: guidance.next_program_name,
    relevantGate: guidance.relevant_gate ?? '',
  };
}

function optionalCoordinate(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinatePair(
  latitudeValue: string,
  longitudeValue: string,
): MeetingPointCoordinate | null {
  const latitude = optionalCoordinate(latitudeValue);
  const longitude = optionalCoordinate(longitudeValue);
  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

export function AdminTripGuidancePanel() {
  const theme = useTheme();
  const { language, t } = useI18n();
  const {
    acknowledgeProblem,
    activeGuidance,
    activeTrip,
    hasSyncError,
    isLoading,
    participants,
    refresh,
    syncErrorKind,
  } = useTripGuidance();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [hasActionError, setHasActionError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [acknowledgingResponseId, setAcknowledgingResponseId] = useState<number | null>(null);
  const syncedFormVersionRef = useRef<string | null>(null);

  useEffect(() => {
    const syncTimeout = setTimeout(() => {
      if (isCreatingNew) return;
      const guidanceVersion = activeGuidance
        ? `${activeGuidance.id}:${activeGuidance.updated_at}`
        : 'none';
      if (syncedFormVersionRef.current === guidanceVersion) return;
      syncedFormVersionRef.current = guidanceVersion;

      if (activeGuidance) {
        setForm(formFromGuidance(activeGuidance));
      } else {
        setForm(emptyForm());
      }
    }, 0);

    return () => clearTimeout(syncTimeout);
  }, [activeGuidance, isCreatingNew]);

  const localizedPlaces = useMemo(
    () => allPlaces.map((place) => localizePlace(place, language)),
    [language],
  );
  const coordinatePairsValid =
    Boolean(form.currentLatitude.trim()) === Boolean(form.currentLongitude.trim());
  const currentCoordinate = coordinatePair(form.currentLatitude, form.currentLongitude);
  const coordinatesValid =
    coordinatePairsValid &&
    (form.currentLatitude.trim() === '' || currentCoordinate !== null);
  const formValid =
    form.currentPlaceName.trim().length >= 2 &&
    form.nextProgramName.trim().length >= 2 &&
    form.meetingPoint.trim().length >= 2 &&
    Number.isFinite(new Date(form.departureAt).getTime()) &&
    coordinatesValid;

  const updateForm = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const selectPlace = (slug: string) => {
    const place = localizedPlaces.find((candidate) => candidate.slug === slug);
    if (!place) return;
    setForm((current) => ({
      ...current,
      currentLatitude: place.latitude.toString(),
      currentLongitude: place.longitude.toString(),
      currentPlaceName: place.name,
      currentPlaceSlug: place.slug,
    }));
    setSaved(false);
  };

  const rpcArguments = () => ({
    p_acts: form.acts.trim(),
    p_current_latitude: optionalCoordinate(form.currentLatitude),
    p_current_longitude: optionalCoordinate(form.currentLongitude),
    p_current_place_name: form.currentPlaceName.trim(),
    p_current_place_slug: form.currentPlaceSlug.trim(),
    p_departure_at: form.departureAt,
    p_description: form.description.trim(),
    p_distance_hint: form.distanceHint.trim(),
    p_meeting_latitude: optionalCoordinate(form.meetingLatitude),
    p_meeting_longitude: optionalCoordinate(form.meetingLongitude),
    p_meeting_point: form.meetingPoint.trim(),
    p_next_program_name: form.nextProgramName.trim(),
    p_relevant_gate: form.relevantGate.trim(),
  });

  const saveGuidance = async () => {
    if (!activeTrip || !formValid || isWorking) return;
    setIsWorking(true);
    setHasActionError(false);
    setSaved(false);
    try {
      const result =
        activeGuidance && !isCreatingNew
          ? await supabase.rpc('admin_update_trip_guidance', {
              ...rpcArguments(),
              p_guidance_id: activeGuidance.id,
            })
          : await supabase.rpc('admin_publish_trip_guidance', {
              ...rpcArguments(),
              p_trip_id: activeTrip.id,
            });
      if (result.error) {
        setHasActionError(true);
      } else {
        setIsCreatingNew(false);
        setSaved(true);
      }
      await refresh();
    } catch {
      setHasActionError(true);
    } finally {
      setIsWorking(false);
    }
  };

  const takeProblem = async (responseId: number) => {
    if (acknowledgingResponseId !== null) return;
    setAcknowledgingResponseId(responseId);
    setHasActionError(false);
    try {
      const { error } = await acknowledgeProblem(responseId);
      if (error) setHasActionError(true);
    } catch {
      setHasActionError(true);
    } finally {
      setAcknowledgingResponseId(null);
    }
  };

  if (isLoading) {
    return (
      <Card style={styles.stateCard}>
        <ActivityIndicator color={theme.accent} />
        <ThemedText themeColor="textSecondary">{t('guide.loading')}</ThemedText>
      </Card>
    );
  }

  if (hasSyncError && !activeTrip) {
    return (
      <Card style={styles.stateCard}>
        <ThemedText type="heading">{t('guide.syncErrorTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {t(supabaseReadFailureTranslationKey(syncErrorKind ?? 'server'))}
        </ThemedText>
        <Button icon="refresh" label={t('guide.retry')} onPress={() => void refresh()} />
      </Card>
    );
  }

  if (!activeTrip) {
    return (
      <Card style={styles.stateCard}>
        <ThemedText type="heading">{t('guide.admin.tripRequiredTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">{t('guide.admin.tripRequiredBody')}</ThemedText>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
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

      {activeGuidance && !isCreatingNew ? (
        <Card style={[styles.activeCard, { borderColor: theme.accent }]}>
          <View style={styles.flexText}>
            <ThemedText type="smallBold" themeColor="accent">
              {t('guide.admin.published')}
            </ThemedText>
            <ThemedText type="heading">{activeGuidance.current_place_name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('guide.admin.liveHint')}
            </ThemedText>
          </View>
          <Button
            disabled={isWorking}
            icon="plus"
            label={t('guide.admin.prepareNew')}
            onPress={() => {
              setForm(emptyForm());
              setIsCreatingNew(true);
              setSaved(false);
            }}
            variant="secondary"
          />
        </Card>
      ) : null}

      {isCreatingNew && activeGuidance ? (
        <Card style={[styles.inlineState, { borderColor: theme.warning }]}>
          <View style={styles.flexText}>
            <ThemedText type="smallBold" themeColor="warning">
              {t('guide.admin.newPointTitle')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('guide.admin.newPointBody')}
            </ThemedText>
          </View>
          <Button
            icon="close"
            label={t('guide.admin.cancelNew')}
            onPress={() => {
              setForm(formFromGuidance(activeGuidance));
              setIsCreatingNew(false);
            }}
            variant="ghost"
          />
        </Card>
      ) : null}

      <Card style={styles.formCard}>
        <ThemedText type="heading">
          {activeGuidance && !isCreatingNew
            ? t('guide.admin.editTitle')
            : t('guide.admin.publishTitle')}
        </ThemedText>

        <ThemedText type="smallBold">{t('guide.admin.placeCatalog')}</ThemedText>
        <View style={styles.chips}>
          {localizedPlaces.map((place) => (
            <SelectionChip
              key={place.id}
              label={place.name}
              onPress={() => selectPlace(place.slug)}
              selected={form.currentPlaceSlug === place.slug}
            />
          ))}
        </View>

        <LabeledInput
          label={t('guide.admin.currentPlace')}
          onChangeText={(value) => {
            updateForm('currentPlaceName', value);
            if (form.currentPlaceSlug) updateForm('currentPlaceSlug', '');
          }}
          placeholder={t('guide.admin.currentPlacePlaceholder')}
          value={form.currentPlaceName}
        />

        <View style={styles.twoColumns}>
          <View style={styles.flexField}>
            <LabeledInput
              keyboardType="decimal-pad"
              label={t('guide.admin.currentLatitude')}
              onChangeText={(value) => updateForm('currentLatitude', value)}
              placeholder="32.616"
              value={form.currentLatitude}
            />
          </View>
          <View style={styles.flexField}>
            <LabeledInput
              keyboardType="decimal-pad"
              label={t('guide.admin.currentLongitude')}
              onChangeText={(value) => updateForm('currentLongitude', value)}
              placeholder="44.032"
              value={form.currentLongitude}
            />
          </View>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('guide.admin.coordinatesHint')}
        </ThemedText>

        <LabeledInput
          label={t('guide.admin.nextProgram')}
          onChangeText={(value) => updateForm('nextProgramName', value)}
          placeholder={t('guide.admin.nextProgramPlaceholder')}
          value={form.nextProgramName}
        />

        <ThemedText type="smallBold">{t('guide.admin.departureIn')}</ThemedText>
        <View accessibilityRole="radiogroup" style={styles.chips}>
          {departureMinuteOptions.map((minutes) => (
            <SelectionChip
              key={minutes}
              label={t('guide.admin.minutes', { count: minutes })}
              onPress={() =>
                updateForm(
                  'departureAt',
                  new Date(Date.now() + minutes * 60_000).toISOString(),
                )
              }
              selected={false}
            />
          ))}
        </View>
        <ThemedText type="small" themeColor="accent">
          {t('guide.admin.departurePreview', {
            date: new Intl.DateTimeFormat(language, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(form.departureAt)),
          })}
        </ThemedText>

        <LabeledInput
          label={t('guide.admin.meetingPoint')}
          onChangeText={(value) => updateForm('meetingPoint', value)}
          placeholder={t('guide.admin.meetingPointPlaceholder')}
          value={form.meetingPoint}
        />
        <View style={styles.twoColumns}>
          <View style={styles.flexField}>
            <LabeledInput
              label={t('guide.admin.relevantGate')}
              onChangeText={(value) => updateForm('relevantGate', value)}
              placeholder={t('guide.admin.relevantGatePlaceholder')}
              value={form.relevantGate}
            />
          </View>
          <View style={styles.flexField}>
            <LabeledInput
              label={t('guide.admin.distanceHint')}
              onChangeText={(value) => updateForm('distanceHint', value)}
              placeholder={t('guide.admin.distanceHintPlaceholder')}
              value={form.distanceHint}
            />
          </View>
        </View>

        <LabeledInput
          label={t('guide.admin.description')}
          multiline
          onChangeText={(value) => updateForm('description', value)}
          placeholder={t('guide.admin.descriptionPlaceholder')}
          value={form.description}
        />
        <LabeledInput
          label={t('guide.admin.acts')}
          multiline
          onChangeText={(value) => updateForm('acts', value)}
          placeholder={t('guide.admin.actsPlaceholder')}
          value={form.acts}
        />

        {!coordinatesValid ? (
          <ThemedText themeColor="danger" type="small">
            {t('guide.admin.coordinateError')}
          </ThemedText>
        ) : null}
        <Button
          disabled={!formValid || isWorking}
          icon={activeGuidance && !isCreatingNew ? 'confirm' : 'plus'}
          label={
            activeGuidance && !isCreatingNew
              ? t('guide.admin.saveChanges')
              : t('guide.admin.publish')
          }
          onPress={() => void saveGuidance()}
        />
        {isWorking ? <ActivityIndicator color={theme.accent} /> : null}
        {saved ? (
          <ThemedText accessibilityLiveRegion="polite" themeColor="success" type="smallBold">
            {t('guide.admin.saved')}
          </ThemedText>
        ) : null}
        {hasActionError ? (
          <ThemedText accessibilityLiveRegion="polite" themeColor="danger" type="small">
            {t('guide.admin.actionError')}
          </ThemedText>
        ) : null}
      </Card>

      {activeGuidance && !isCreatingNew ? (
        <View style={styles.responses}>
          <ThemedText type="heading">{t('guide.admin.responsesTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t('guide.admin.responsesBody')}
          </ThemedText>
          {participants.length === 0 ? (
            <Card style={styles.stateCard}>
              <ThemedText themeColor="textSecondary">
                {t('guide.admin.noParticipants')}
              </ThemedText>
            </Card>
          ) : (
            participants.map((participant) => {
              const response = participant.response;
              return (
                <Card key={participant.id} style={styles.responseCard}>
                  <View style={styles.responseHeading}>
                    <View style={styles.flexText}>
                      <ThemedText type="heading">{participant.display_name}</ThemedText>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { borderColor: adminStatusColor(participant.status, theme) },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={{ color: adminStatusColor(participant.status, theme) }}>
                        {t(
                          participant.status
                            ? `guide.status.${participant.status}`
                            : 'guide.status.not_reported',
                        )}
                      </ThemedText>
                    </View>
                  </View>
                  {response?.status === 'problem' ? (
                    response.acknowledged_by_display_name ? (
                      <ThemedText type="smallBold" themeColor="success">
                        {t('guide.admin.takenBy', {
                          name: response.acknowledged_by_display_name,
                        })}
                      </ThemedText>
                    ) : (
                      <Button
                        disabled={acknowledgingResponseId !== null}
                        icon="confirm"
                        label={t('guide.admin.takeProblem')}
                        onPress={() => void takeProblem(response.id)}
                        variant="secondary"
                      />
                    )
                  ) : null}
                </Card>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

function LabeledInput({
  keyboardType = 'default',
  label,
  multiline = false,
  onChangeText,
  placeholder,
  value,
}: {
  keyboardType?: 'decimal-pad' | 'default';
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const theme = useTheme();
  const { isRTL } = useI18n();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            color: theme.text,
            textAlign: isRTL ? 'right' : 'left',
            writingDirection: isRTL ? 'rtl' : 'ltr',
          },
        ]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

function SelectionChip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectionChip,
        {
          backgroundColor: selected ? theme.accent : theme.backgroundElement,
          borderColor: selected ? theme.accent : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={selected ? { color: theme.background } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function adminStatusColor(
  status: TripGuidanceStatus | null,
  theme: ReturnType<typeof useTheme>,
) {
  if (status === 'at_meeting_point') return theme.success;
  if (status === 'problem' || status === 'lost' || status === 'medical_help') return theme.danger;
  if (status === 'almost_there') return theme.warning;
  if (status === 'on_way') return theme.accent;
  return theme.textSecondary;
}

const styles = StyleSheet.create({
  activeCard: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  container: {
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  flexField: {
    flex: 1,
    minWidth: 180,
  },
  flexText: {
    flex: 1,
    gap: Spacing.half,
  },
  formCard: {
    gap: Spacing.three,
  },
  inlineState: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  multilineInput: {
    minHeight: 100,
  },
  pressed: {
    opacity: 0.72,
  },
  responseCard: {
    gap: Spacing.two,
  },
  responseHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  responses: {
    gap: Spacing.two,
  },
  selectionChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  stateCard: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  twoColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
