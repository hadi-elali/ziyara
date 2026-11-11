import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SymbolIcon, type SymbolIconName } from '@/components/ui/symbol-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
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
  const { isRTL, t } = useI18n();
  const { fontScale, width } = useWindowDimensions();
  const stackActions = width / fontScale < 360;
  const {
    hasSyncError,
    isLoading,
    navigationDestinations,
    refresh,
    syncErrorMessage,
  } = useTripGuidance();
  const [form, setForm] = useState<DestinationForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
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
    if (isWorking) return;
    setForm((current) => ({ ...current, [key]: value }));
    setSavedMessage(null);
  };

  const updateCoordinate = (nextCoordinate: MeetingPointCoordinate | null) => {
    if (isWorking) return;
    setForm((current) => ({
      ...current,
      latitude: nextCoordinate?.latitude.toFixed(6) ?? '',
      longitude: nextCoordinate?.longitude.toFixed(6) ?? '',
    }));
    setSavedMessage(null);
  };

  const startNew = () => {
    if (isWorking) return;
    setEditingId(null);
    setIsEditorOpen(true);
    setConfirmingArchiveId(null);
    setForm(emptyForm);
    setActionErrorMessage(null);
    setSavedMessage(null);
  };

  const startEditing = (destination: TripNavigationDestination) => {
    if (isWorking) return;
    setEditingId(destination.id);
    setIsEditorOpen(true);
    setForm(formFromDestination(destination));
    setConfirmingArchiveId(null);
    setActionErrorMessage(null);
    setSavedMessage(null);
  };

  const closeEditor = () => {
    if (isWorking) return;
    setIsEditorOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setActionErrorMessage(null);
  };

  const save = async () => {
    if (!coordinate || !formValid || isWorking) return;
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
        p_trip_id: null,
      });
      if (error) {
        setActionErrorMessage(error.message);
      } else {
        setIsEditorOpen(false);
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

      <View style={[styles.overviewHeading, isRTL && styles.rowRTL]}>
        <View style={styles.flexText}>
          <ThemedText accessibilityRole="header" type="heading">
            {t('navigation.admin.listTitle')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t(navigationDestinations.length === 1 ? 'navigation.admin.countOne' : 'navigation.admin.count', {
              count: navigationDestinations.length,
            })}
          </ThemedText>
        </View>
        <Button
          disabled={isWorking}
          icon="plus"
          label={t('navigation.admin.add')}
          onPress={startNew}
        />
      </View>

      {savedMessage ? (
        <View style={[styles.feedback, { backgroundColor: theme.successSoft }]}>
          <ThemedText accessibilityLiveRegion="polite" type="small" themeColor="success">
            {savedMessage}
          </ThemedText>
        </View>
      ) : null}
      {actionErrorMessage && !isEditorOpen && confirmingArchiveId === null ? (
        <ThemedText accessibilityRole="alert" type="small" themeColor="danger">
          {actionErrorMessage}
        </ThemedText>
      ) : null}

      {navigationDestinations.length === 0 ? (
        <Card style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.accentSoft }]}>
            <SymbolIcon color={theme.accent} name="map" size={28} />
          </View>
          <ThemedText type="heading" style={styles.centerText}>
            {t('navigation.admin.emptyTitle')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            {t('navigation.admin.emptyBody')}
          </ThemedText>
        </Card>
      ) : (
        <View style={styles.destinationList}>
          {navigationDestinations.map((destination) => (
            <Card
              key={destination.id}
              style={[
                styles.destinationCard,
                { backgroundColor: theme.accentSoft, borderColor: theme.accent },
              ]}>
              <View style={[styles.destinationHeading, isRTL && styles.rowRTL]}>
                <View style={[styles.markerIcon, { backgroundColor: theme.dangerSoft }]}>
                  <SymbolIcon color={theme.danger} name="map-pin" size={20} />
                </View>
                <View style={styles.flexText}>
                  <ThemedText type="heading" style={styles.destinationName}>
                    {destination.name}
                  </ThemedText>
                  {destination.details ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {destination.details}
                    </ThemedText>
                  ) : null}
                  <ThemedText selectable type="small" themeColor="textSecondary" style={styles.coordinates}>
                    {destination.latitude.toFixed(6)}, {destination.longitude.toFixed(6)}
                  </ThemedText>
                </View>
              </View>
              <View style={[
                styles.destinationActions,
                { borderColor: theme.border },
                isRTL && styles.rowRTL,
                stackActions && styles.stackedActions,
              ]}>
                <DestinationAction
                  accessibilityLabel={`${t('navigation.admin.preview')}: ${destination.name}`}
                  disabled={isWorking}
                  icon="location"
                  label={t('navigation.admin.navigate')}
                  onPress={() => void openNavigation(destination)}
                  variant="navigation"
                />
                <DestinationAction
                  accessibilityLabel={`${t('navigation.admin.edit')}: ${destination.name}`}
                  disabled={isWorking}
                  icon="edit"
                  label={t('navigation.admin.edit')}
                  onPress={() => startEditing(destination)}
                />
                <DestinationAction
                  accessibilityLabel={`${t('navigation.admin.remove')}: ${destination.name}`}
                  disabled={isWorking}
                  icon="trash"
                  label={stackActions ? t('navigation.admin.remove') : undefined}
                  onPress={() => {
                    setActionErrorMessage(null);
                    setSavedMessage(null);
                    setConfirmingArchiveId(destination.id);
                  }}
                  variant="remove"
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
                  {actionErrorMessage ? (
                    <ThemedText accessibilityRole="alert" type="small" themeColor="danger">
                      {actionErrorMessage}
                    </ThemedText>
                  ) : null}
                  <View style={styles.actions}>
                    <Button
                      disabled={isWorking}
                      icon="close"
                      label={t('guide.admin.cancelNew')}
                      onPress={() => {
                        setConfirmingArchiveId(null);
                        setActionErrorMessage(null);
                      }}
                      style={styles.action}
                      variant="ghost"
                    />
                    <Button
                      accessibilityState={{ busy: isWorking }}
                      disabled={isWorking}
                      icon="trash"
                      label={t('navigation.admin.removeConfirm')}
                      onPress={() => void archive(destination)}
                      style={styles.action}
                      variant="danger-solid"
                    />
                  </View>
                  {isWorking ? <ActivityIndicator color={theme.danger} /> : null}
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <Modal
        animationType="slide"
        onRequestClose={closeEditor}
        presentationStyle="pageSheet"
        visible={isEditorOpen}>
        <SafeAreaView style={[styles.editor, { backgroundColor: theme.background }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.editor}>
            <View style={[styles.editorHeader, { borderColor: theme.border }, isRTL && styles.rowRTL]}>
              <ThemedText accessibilityRole="header" type="heading" style={styles.flexText}>
                {t(editingId === null ? 'navigation.admin.addTitle' : 'navigation.admin.editTitle')}
              </ThemedText>
              <Button
                disabled={isWorking}
                icon="close"
                label={t('guide.admin.cancelNew')}
                onPress={closeEditor}
                size="compact"
                variant="ghost"
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.editorContent}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled">
              <ThemedText type="small" themeColor="textSecondary">
                {t('navigation.admin.body')}
              </ThemedText>
              <LabeledInput
                editable={!isWorking}
                label={t('navigation.admin.name')}
                onChangeText={(name) => updateForm('name', name)}
                placeholder={t('navigation.admin.namePlaceholder')}
                value={form.name}
              />
              <LabeledInput
                editable={!isWorking}
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

              <View style={[styles.twoColumns, isRTL && styles.rowRTL]}>
                <CoordinateInput
                  editable={!isWorking}
                  label={t('guide.admin.meetingLatitude')}
                  onChangeText={(latitude) => updateForm('latitude', latitude)}
                  placeholder="32.616"
                  value={form.latitude}
                />
                <CoordinateInput
                  editable={!isWorking}
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
                <ThemedText accessibilityRole="alert" type="small" themeColor="danger">
                  {t('guide.admin.coordinateError')}
                </ThemedText>
              ) : null}
            </ScrollView>
            <View style={[styles.editorFooter, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {actionErrorMessage ? (
                <ThemedText accessibilityRole="alert" type="small" themeColor="danger">
                  {actionErrorMessage}
                </ThemedText>
              ) : null}
              {isWorking ? <ActivityIndicator color={theme.accent} /> : null}
              <Button
                accessibilityState={{ busy: isWorking }}
                disabled={!formValid || isWorking}
                icon={editingId === null ? 'plus' : 'confirm'}
                label={t(editingId === null ? 'navigation.admin.create' : 'navigation.admin.save')}
                onPress={() => void save()}
              />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function DestinationAction({
  accessibilityLabel,
  disabled,
  icon,
  label,
  onPress,
  variant = 'edit',
}: {
  accessibilityLabel: string;
  disabled: boolean;
  icon: SymbolIconName;
  label?: string;
  onPress: () => void;
  variant?: 'edit' | 'navigation' | 'remove';
}) {
  const theme = useTheme();
  const { isRTL } = useI18n();
  const color = variant === 'navigation' ? theme.background : variant === 'remove' ? theme.danger : theme.text;
  const backgroundColor = variant === 'navigation'
    ? theme.accent
    : variant === 'remove'
      ? theme.background
      : theme.surface;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.destinationAction,
        label ? styles.labeledAction : styles.iconAction,
        { backgroundColor },
        isRTL && styles.rowRTL,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <SymbolIcon color={color} name={icon} size={18} />
      {label ? (
        <ThemedText type="smallBold" style={[styles.actionLabel, { color }]}>
          {label}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

function LabeledInput({
  editable = true,
  keyboardType = 'default',
  label,
  multiline = false,
  onChangeText,
  placeholder,
  value,
}: {
  editable?: boolean;
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
        editable={editable}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
            textAlign: isRTL && keyboardType !== 'decimal-pad' ? 'right' : 'left',
            writingDirection: isRTL && keyboardType !== 'decimal-pad' ? 'rtl' : 'ltr',
          },
        ]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

function CoordinateInput({
  editable,
  label,
  onChangeText,
  placeholder,
  value,
}: {
  editable: boolean;
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.flexField}>
      <LabeledInput
        editable={editable}
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
  actionLabel: {
    flexShrink: 1,
    textAlign: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  container: {
    gap: Spacing.three,
  },
  coordinates: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    lineHeight: 18,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  destinationAction: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: Spacing.one,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  destinationActions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  destinationCard: {
    borderRadius: 14,
    borderWidth: 1,
    gap: Spacing.two,
  },
  destinationHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  destinationList: {
    gap: Spacing.two,
  },
  destinationName: {
    fontSize: 17,
  },
  editor: {
    flex: 1,
  },
  editorContent: {
    alignSelf: 'center',
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    width: '100%',
  },
  editorFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  editorHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 60,
    justifyContent: 'center',
    marginBottom: Spacing.two,
    width: 60,
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: Spacing.five,
  },
  feedback: {
    borderRadius: 10,
    padding: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  flexField: {
    flexBasis: 140,
    flexGrow: 1,
  },
  flexText: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  iconAction: {
    width: 44,
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
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  labeledAction: {
    flex: 1,
    minWidth: 0,
  },
  markerIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  multilineInput: {
    minHeight: 88,
  },
  overviewHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  removeConfirmation: {
    borderRadius: 10,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.55,
  },
  stateCard: {
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 160,
  },
  stackedActions: {
    flexDirection: 'column',
  },
  twoColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
