import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import type { TripNavigationDestination } from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import { useI18n } from '@/features/i18n/i18n';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { openNavigation } from '@/features/places/openNavigation';
import { MeetingPointPicker } from '@/features/trip-guidance/MeetingPointPicker';
import type { MeetingPointCoordinate } from '@/features/trip-guidance/meeting-point-picker-types';
import { useTripGuidance } from '@/features/trip-guidance/trip-guidance-context';
import { useTheme } from '@/hooks/use-theme';

type DestinationForm = {
  details: string;
  latitude: string;
  longitude: string;
  name: string;
};

const emptyForm: DestinationForm = {
  details: '',
  latitude: '',
  longitude: '',
  name: '',
};

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

function formFromDestination(destination: TripNavigationDestination): DestinationForm {
  return {
    details: destination.details ?? '',
    latitude: destination.latitude.toString(),
    longitude: destination.longitude.toString(),
    name: destination.name,
  };
}

export function AdminMeetingPointPanel() {
  const theme = useTheme();
  const { t } = useI18n();
  const {
    activeTrip,
    hasSyncError,
    isLoading,
    navigationDestinations,
    refresh,
    syncErrorMessage,
  } = useTripGuidance();
  const [form, setForm] = useState<DestinationForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmingArchiveId, setConfirmingArchiveId] = useState<number | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const coordinate = coordinatePair(form.latitude, form.longitude);
  const formValid =
    form.name.trim().length >= 2 &&
    form.name.trim().length <= 120 &&
    form.details.trim().length <= 500 &&
    coordinate !== null;

  const updateForm = <Key extends keyof DestinationForm>(
    key: Key,
    value: DestinationForm[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSavedMessage(null);
  };

  const updateCoordinate = (nextCoordinate: MeetingPointCoordinate | null) => {
    setForm((current) => ({
      ...current,
      latitude: nextCoordinate?.latitude.toFixed(6) ?? '',
      longitude: nextCoordinate?.longitude.toFixed(6) ?? '',
    }));
    setSavedMessage(null);
  };

  const startNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setActionErrorMessage(null);
    setSavedMessage(null);
  };

  const startEditing = (destination: TripNavigationDestination) => {
    setEditingId(destination.id);
    setForm(formFromDestination(destination));
    setConfirmingArchiveId(null);
    setActionErrorMessage(null);
    setSavedMessage(null);
  };

  const save = async () => {
    if (!activeTrip || !coordinate || !formValid || isWorking) return;
    setIsWorking(true);
    setActionErrorMessage(null);
    setSavedMessage(null);
    const savedName = form.name.trim();
    try {
      const { error } = await supabase.rpc('admin_upsert_trip_navigation_destination', {
        p_destination_id: editingId,
        p_details: form.details.trim(),
        p_latitude: coordinate.latitude,
        p_longitude: coordinate.longitude,
        p_name: savedName,
        p_trip_id: activeTrip.id,
      });
      if (error) {
        setActionErrorMessage(error.message);
      } else {
        setEditingId(null);
        setForm(emptyForm);
        setSavedMessage(t('navigation.admin.saved', { name: savedName }));
      }
      await refresh();
    } catch (error) {
      setActionErrorMessage(getOriginalErrorMessage(error));
    } finally {
      setIsWorking(false);
    }
  };

  const archive = async (destination: TripNavigationDestination) => {
    if (isWorking) return;
    setIsWorking(true);
    setActionErrorMessage(null);
    setSavedMessage(null);
    try {
      const { error } = await supabase.rpc('admin_archive_trip_navigation_destination', {
        p_destination_id: destination.id,
      });
      if (error) {
        setActionErrorMessage(error.message);
      } else {
        if (editingId === destination.id) startNew();
        setConfirmingArchiveId(null);
        setSavedMessage(t('navigation.admin.removed', { name: destination.name }));
      }
      await refresh();
    } catch (error) {
      setActionErrorMessage(getOriginalErrorMessage(error));
    } finally {
      setIsWorking(false);
    }
  };

  if (isLoading) {
    return (
      <Card style={styles.stateCard}>
        <ActivityIndicator color={theme.accent} />
        <ThemedText themeColor="textSecondary">{t('navigation.admin.loading')}</ThemedText>
      </Card>
    );
  }

  if (hasSyncError && !activeTrip) {
    return (
      <Card style={styles.stateCard}>
        <ThemedText type="heading">{t('navigation.admin.unavailableTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {syncErrorMessage}
        </ThemedText>
        <Button icon="refresh" label={t('guide.retry')} onPress={() => void refresh()} />
      </Card>
    );
  }

  if (!activeTrip) {
    return (
      <Card style={styles.stateCard}>
        <ThemedText type="heading">{t('navigation.admin.tripRequiredTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {t('navigation.admin.tripRequiredBody')}
        </ThemedText>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      {hasSyncError ? (
        <Card style={[styles.inlineState, { borderColor: theme.warning }]}>
          <ThemedText type="small" themeColor="warning">
            {syncErrorMessage}
          </ThemedText>
          <Button
            icon="refresh"
            label={t('guide.retry')}
            onPress={() => void refresh()}
            variant="secondary"
          />
        </Card>
      ) : null}

      <Card style={styles.overviewCard}>
        <View style={styles.overviewHeading}>
          <View style={styles.flexText}>
            <ThemedText type="heading">{t('navigation.admin.listTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {t('navigation.admin.count', { count: navigationDestinations.length })}
            </ThemedText>
          </View>
        </View>

        {navigationDestinations.length === 0 ? (
          <ThemedText themeColor="textSecondary">
            {t('navigation.admin.emptyBody')}
          </ThemedText>
        ) : (
          <View style={styles.destinationList}>
            {navigationDestinations.map((destination) => (
              <View
                key={destination.id}
                style={[styles.destinationCard, { borderColor: theme.border }]}>
                <View style={styles.flexText}>
                  <ThemedText type="heading">{destination.name}</ThemedText>
                  {destination.details ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {destination.details}
                    </ThemedText>
                  ) : null}
                  <ThemedText type="tinyBold" themeColor="textSecondary">
                    {destination.latitude.toFixed(6)}, {destination.longitude.toFixed(6)}
                  </ThemedText>
                </View>
                <View style={styles.actions}>
                  <Button
                    icon="external-link"
                    label={t('navigation.admin.preview')}
                    onPress={() => void openNavigation(destination)}
                    style={styles.action}
                    variant="ghost"
                  />
                  <Button
                    icon="settings"
                    label={t('navigation.admin.edit')}
                    onPress={() => startEditing(destination)}
                    style={styles.action}
                    variant="secondary"
                  />
                  <Button
                    icon="close"
                    label={t('navigation.admin.remove')}
                    onPress={() => setConfirmingArchiveId(destination.id)}
                    style={styles.action}
                    variant="ghost"
                  />
                </View>
                {confirmingArchiveId === destination.id ? (
                  <View
                    accessibilityRole="alert"
                    style={[styles.removeConfirmation, { backgroundColor: theme.dangerSoft }]}>
                    <ThemedText type="smallBold" themeColor="danger">
                      {t('navigation.admin.removeConfirmTitle', { name: destination.name })}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('navigation.admin.removeConfirmBody')}
                    </ThemedText>
                    <View style={styles.actions}>
                      <Button
                        icon="close"
                        label={t('guide.admin.cancelNew')}
                        onPress={() => setConfirmingArchiveId(null)}
                        style={styles.action}
                        variant="ghost"
                      />
                      <Button
                        disabled={isWorking}
                        icon="warning"
                        label={t('navigation.admin.removeConfirm')}
                        onPress={() => void archive(destination)}
                        style={styles.action}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card style={styles.formCard}>
        <View style={styles.overviewHeading}>
          <View style={styles.flexText}>
            <ThemedText type="heading">
              {t(editingId === null ? 'navigation.admin.addTitle' : 'navigation.admin.editTitle')}
            </ThemedText>
            <ThemedText themeColor="textSecondary">{t('navigation.admin.body')}</ThemedText>
          </View>
          {editingId !== null ? (
            <Button
              icon="close"
              label={t('guide.admin.cancelNew')}
              onPress={startNew}
              variant="ghost"
            />
          ) : null}
        </View>

        <LabeledInput
          label={t('navigation.admin.name')}
          onChangeText={(name) => updateForm('name', name)}
          placeholder={t('navigation.admin.namePlaceholder')}
          value={form.name}
        />
        <LabeledInput
          label={t('navigation.admin.details')}
          multiline
          onChangeText={(details) => updateForm('details', details)}
          placeholder={t('navigation.admin.detailsPlaceholder')}
          value={form.details}
        />

        <MeetingPointPicker
          coordinate={coordinate}
          fallbackCoordinate={navigationDestinations[0] ?? null}
          onChange={updateCoordinate}
        />

        <View style={styles.twoColumns}>
          <CoordinateInput
            label={t('guide.admin.meetingLatitude')}
            onChangeText={(latitude) => updateForm('latitude', latitude)}
            placeholder="32.616"
            value={form.latitude}
          />
          <CoordinateInput
            label={t('guide.admin.meetingLongitude')}
            onChangeText={(longitude) => updateForm('longitude', longitude)}
            placeholder="44.032"
            value={form.longitude}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('navigation.admin.coordinatesHint')}
        </ThemedText>

        {form.latitude.trim() && form.longitude.trim() && !coordinate ? (
          <ThemedText type="small" themeColor="danger">
            {t('guide.admin.coordinateError')}
          </ThemedText>
        ) : null}
        <Button
          disabled={!formValid || isWorking}
          icon={editingId === null ? 'plus' : 'confirm'}
          label={t(editingId === null ? 'navigation.admin.create' : 'navigation.admin.save')}
          onPress={() => void save()}
        />
        {isWorking ? <ActivityIndicator color={theme.accent} /> : null}
        {savedMessage ? (
          <ThemedText accessibilityLiveRegion="polite" type="smallBold" themeColor="success">
            {savedMessage}
          </ThemedText>
        ) : null}
        {actionErrorMessage ? (
          <ThemedText accessibilityLiveRegion="polite" type="small" themeColor="danger">
            {actionErrorMessage}
          </ThemedText>
        ) : null}
      </Card>
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

function CoordinateInput({
  label,
  onChangeText,
  placeholder,
  value,
}: {
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.flexField}>
      <LabeledInput
        keyboardType="decimal-pad"
        label={label}
        onChangeText={onChangeText}
        placeholder={placeholder}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    flexGrow: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  container: {
    gap: Spacing.three,
  },
  destinationCard: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  destinationList: {
    gap: Spacing.two,
  },
  field: {
    gap: Spacing.one,
  },
  flexField: {
    flex: 1,
    minWidth: 220,
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
    minHeight: 96,
  },
  overviewCard: {
    gap: Spacing.three,
  },
  overviewHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  removeConfirmation: {
    borderRadius: 8,
    gap: Spacing.two,
    padding: Spacing.two,
  },
  stateCard: {
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 160,
  },
  twoColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
