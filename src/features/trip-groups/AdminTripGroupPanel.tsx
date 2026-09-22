import * as Location from 'expo-location';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { Spacing } from '@/constants/theme';
import { useBusManagement } from '@/features/bus-management/bus-management-context';
import { useI18n } from '@/features/i18n/i18n';
import type { MapCoordinate } from '@/features/map/map-types';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { openNavigation } from '@/features/places/openNavigation';
import { GroupLocationMap } from '@/features/trip-groups/GroupLocationMap';
import { useTripGroups } from '@/features/trip-groups/trip-group-context';
import {
  isCurrentLocationResponse,
  type TripGroupState,
} from '@/features/trip-groups/trip-group-state';
import { useTheme } from '@/hooks/use-theme';

type ActionFeedback =
  | { kind: 'saved' | 'requested'; type: 'success' }
  | { message: string; type: 'error' };

type AdminLocationStatus = 'denied' | 'error' | 'idle' | 'loading';

export function AdminTripGroupPanel() {
  const theme = useTheme();
  const { isRTL, language, t } = useI18n();
  const { activeTrip, participants } = useBusManagement();
  const {
    deleteGroup,
    groups,
    hasSyncError,
    isLoading,
    refresh,
    requestLeaderLocation,
    saveGroup,
    syncErrorMessage,
  } = useTripGroups();
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState('');
  const [leaderSearch, setLeaderSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [leaderParticipantId, setLeaderParticipantId] = useState<number | null>(null);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<number>>(
    new Set(),
  );
  const [isWorking, setIsWorking] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [adminCoordinate, setAdminCoordinate] = useState<MapCoordinate | null>(null);
  const [adminLocationStatus, setAdminLocationStatus] =
    useState<AdminLocationStatus>('idle');

  const assignedGroupsByParticipant = useMemo(() => {
    const assignments = new Map<number, number>();
    for (const group of groups) {
      for (const member of group.members) assignments.set(member.participant_id, group.id);
    }
    return assignments;
  }, [groups]);
  const linkedLeaderCandidates = participants.filter(
    (participant) =>
      participant.profile_id !== null &&
      (assignedGroupsByParticipant.get(participant.id) ?? editingGroupId) === editingGroupId,
  );
  const normalizedLeaderSearch = leaderSearch.trim().toLocaleLowerCase(language);
  const normalizedMemberSearch = memberSearch.trim().toLocaleLowerCase(language);
  const matchingLeaderCandidates = normalizedLeaderSearch
    ? linkedLeaderCandidates
        .filter((participant) =>
          participant.display_name
            .toLocaleLowerCase(language)
            .includes(normalizedLeaderSearch),
        )
        .slice(0, 8)
    : [];
  const matchingMemberCandidates = normalizedMemberSearch
    ? participants
        .filter((participant) =>
          participant.display_name
            .toLocaleLowerCase(language)
            .includes(normalizedMemberSearch),
        )
        .slice(0, 8)
    : [];
  const selectedLeader = participants.find(
    (participant) => participant.id === leaderParticipantId,
  );
  const selectedParticipants = participants.filter((participant) =>
    selectedParticipantIds.has(participant.id),
  );

  const resetEditor = () => {
    setEditingGroupId(null);
    setGroupName('');
    setLeaderSearch('');
    setMemberSearch('');
    setLeaderParticipantId(null);
    setSelectedParticipantIds(new Set());
  };

  const editGroup = (group: TripGroupState) => {
    setFeedback(null);
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setLeaderSearch('');
    setMemberSearch('');
    setLeaderParticipantId(group.leader_participant_id);
    setSelectedParticipantIds(new Set(group.members.map((member) => member.participant_id)));
  };

  const selectLeader = (participantId: number) => {
    setLeaderParticipantId(participantId);
    setSelectedParticipantIds((current) => new Set(current).add(participantId));
    setLeaderSearch('');
  };

  const toggleMember = (participantId: number) => {
    if (participantId === leaderParticipantId) return;
    setSelectedParticipantIds((current) => {
      const next = new Set(current);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  };

  const runAction = async (
    action: () => Promise<{ error: unknown }>,
    success: 'requested' | 'saved',
    onSuccess?: () => void,
  ) => {
    if (isWorking) return;
    setFeedback(null);
    setIsWorking(true);
    try {
      const result = await action();
      if (result.error) {
        const message = getOriginalErrorMessage(result.error);
        if (message) setFeedback({ message, type: 'error' });
      } else {
        onSuccess?.();
        setFeedback({ kind: success, type: 'success' });
      }
    } catch (error) {
      const message = getOriginalErrorMessage(error);
      if (message) setFeedback({ message, type: 'error' });
    } finally {
      setIsWorking(false);
    }
  };

  const submitGroup = () => {
    if (!activeTrip || leaderParticipantId === null) return;
    void runAction(
      () =>
        saveGroup({
          groupId: editingGroupId,
          leaderParticipantId,
          memberParticipantIds: [...selectedParticipantIds],
          name: groupName.trim(),
        }),
      'saved',
      resetEditor,
    );
  };

  const locateAdmin = async () => {
    if (adminLocationStatus === 'loading') return;
    setAdminLocationStatus('loading');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setAdminLocationStatus('denied');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setAdminCoordinate({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setAdminLocationStatus('idle');
    } catch {
      setAdminLocationStatus('error');
    }
  };

  const confirmDelete = (group: TripGroupState) => {
    Alert.alert(
      t('tripGroups.admin.deleteTitle', { name: group.name }),
      t('tripGroups.admin.deleteBody'),
      [
        { style: 'cancel', text: t('tripGroups.admin.cancel') },
        {
          onPress: () =>
            void runAction(
              () => deleteGroup(group.id),
              'saved',
              editingGroupId === group.id ? resetEditor : undefined,
            ),
          style: 'destructive',
          text: t('tripGroups.admin.deleteConfirm'),
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <Card style={styles.stateCard}>
        <ActivityIndicator color={theme.accent} />
        <ThemedText themeColor="textSecondary">{t('tripGroups.loading')}</ThemedText>
      </Card>
    );
  }

  if (!activeTrip) {
    return (
      <Card style={styles.stateCard}>
        <ThemedText type="heading">{t('tripGroups.admin.tripRequiredTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {t('tripGroups.admin.tripRequiredBody')}
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
            label={t('tripGroups.retry')}
            onPress={() => void refresh()}
            variant="secondary"
          />
        </Card>
      ) : null}

      <Card style={styles.formCard}>
        <View style={styles.cardHeader}>
          <View style={styles.flexText}>
            <ThemedText type="heading">
              {t(
                editingGroupId === null
                  ? 'tripGroups.admin.createTitle'
                  : 'tripGroups.admin.editTitle',
              )}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('tripGroups.admin.editorBody')}
            </ThemedText>
          </View>
          {editingGroupId !== null ? (
            <Button
              icon="close"
              label={t('tripGroups.admin.cancel')}
              onPress={resetEditor}
              variant="ghost"
            />
          ) : null}
        </View>

        <View style={styles.field}>
          <ThemedText type="smallBold">{t('tripGroups.admin.name')}</ThemedText>
          <TextInput
            accessibilityLabel={t('tripGroups.admin.name')}
            onChangeText={setGroupName}
            placeholder={t('tripGroups.admin.namePlaceholder')}
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                color: theme.text,
                textAlign: isRTL ? 'right' : 'left',
                writingDirection: isRTL ? 'rtl' : 'ltr',
              },
            ]}
            value={groupName}
          />
        </View>

        <View style={styles.choiceSection}>
          <ThemedText type="smallBold">{t('tripGroups.admin.selectLeader')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('tripGroups.admin.selectLeaderBody')}
          </ThemedText>
          {linkedLeaderCandidates.length === 0 ? (
            <ThemedText type="small" themeColor="warning">
              {t('tripGroups.admin.noLeaderCandidates')}
            </ThemedText>
          ) : null}
          {selectedLeader ? (
            <SelectedPersonRow
              label={selectedLeader.display_name}
              note={t('tripGroups.admin.selectedLeader')}
            />
          ) : null}
          {linkedLeaderCandidates.length > 0 ? (
            <TextInput
              accessibilityLabel={t('tripGroups.admin.leaderSearch')}
              onChangeText={setLeaderSearch}
              placeholder={t('tripGroups.admin.searchPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  color: theme.text,
                  textAlign: isRTL ? 'right' : 'left',
                  writingDirection: isRTL ? 'rtl' : 'ltr',
                },
              ]}
              value={leaderSearch}
            />
          ) : null}
          {matchingLeaderCandidates.map((participant) => (
            <ChoiceRow
              key={participant.id}
              label={participant.display_name}
              onPress={() => selectLeader(participant.id)}
              selected={leaderParticipantId === participant.id}
              type="radio"
            />
          ))}
          {normalizedLeaderSearch && matchingLeaderCandidates.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('tripGroups.admin.noSearchResults')}
            </ThemedText>
          ) : null}
        </View>

        <View style={styles.choiceSection}>
          <ThemedText type="smallBold">{t('tripGroups.admin.selectMembers')}</ThemedText>
          {participants.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('tripGroups.admin.noParticipants')}
            </ThemedText>
          ) : (
            <>
              <TextInput
                accessibilityLabel={t('tripGroups.admin.memberSearch')}
                onChangeText={setMemberSearch}
                placeholder={t('tripGroups.admin.searchPlaceholder')}
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                    color: theme.text,
                    textAlign: isRTL ? 'right' : 'left',
                    writingDirection: isRTL ? 'rtl' : 'ltr',
                  },
                ]}
                value={memberSearch}
              />
              {selectedParticipants.length > 0 ? (
                <View style={styles.selectedMembers}>
                  <ThemedText type="tinyBold" themeColor="textSecondary">
                    {t('tripGroups.admin.selectedMembers', {
                      count: selectedParticipants.length,
                    })}
                  </ThemedText>
                  <View style={styles.memberChips}>
                    {selectedParticipants.map((participant) => {
                      const isLeader = participant.id === leaderParticipantId;
                      return (
                        <Pressable
                          accessibilityLabel={
                            isLeader
                              ? participant.display_name
                              : t('tripGroups.admin.removeMember', {
                                  name: participant.display_name,
                                })
                          }
                          accessibilityRole={isLeader ? 'text' : 'button'}
                          disabled={isLeader}
                          key={participant.id}
                          onPress={() => toggleMember(participant.id)}
                          style={({ pressed }) => [
                            styles.selectedMemberChip,
                            {
                              backgroundColor: theme.accentSoft,
                              borderColor: theme.accent,
                            },
                            pressed && styles.pressed,
                          ]}>
                          <ThemedText type="tinyBold" themeColor="accent">
                            {participant.display_name}
                          </ThemedText>
                          <SymbolIcon
                            color={theme.accent}
                            name={isLeader ? 'account' : 'close'}
                            size={16}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </>
          )}
          {matchingMemberCandidates.map((participant) => {
            const assignedGroupId = assignedGroupsByParticipant.get(participant.id);
            const disabled =
              assignedGroupId !== undefined && assignedGroupId !== editingGroupId;
            return (
              <ChoiceRow
                disabled={disabled || participant.id === leaderParticipantId}
                key={participant.id}
                label={participant.display_name}
                note={
                  disabled
                    ? t('tripGroups.admin.alreadyAssigned')
                    : participant.id === leaderParticipantId
                      ? t('tripGroups.admin.leaderIsMember')
                      : undefined
                }
                onPress={() => {
                  toggleMember(participant.id);
                  setMemberSearch('');
                }}
                selected={selectedParticipantIds.has(participant.id)}
                type="checkbox"
              />
            );
          })}
          {normalizedMemberSearch && matchingMemberCandidates.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('tripGroups.admin.noSearchResults')}
            </ThemedText>
          ) : null}
        </View>

        <Button
          disabled={
            isWorking ||
            groupName.trim().length < 2 ||
            leaderParticipantId === null ||
            selectedParticipantIds.size === 0
          }
          icon={editingGroupId === null ? 'plus' : 'confirm'}
          label={t(
            editingGroupId === null
              ? 'tripGroups.admin.create'
              : 'tripGroups.admin.save',
          )}
          onPress={submitGroup}
        />
      </Card>

      <View style={styles.groupList}>
        {groups.length === 0 ? (
          <Card style={styles.stateCard}>
            <ThemedText type="heading">{t('tripGroups.admin.emptyTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {t('tripGroups.admin.emptyBody')}
            </ThemedText>
          </Card>
        ) : (
          groups.map((group) => {
            const request = group.location_request;
            const hasCurrentResponse = isCurrentLocationResponse(request);
            const canOpenLocation =
              request?.status === 'shared' &&
              hasCurrentResponse &&
              request.latitude !== null &&
              request.longitude !== null;
            return (
              <Card key={group.id} style={styles.groupCard}>
                <View style={styles.groupHeading}>
                  <View style={styles.flexText}>
                    <ThemedText type="heading">{group.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('tripGroups.admin.memberCount', { count: group.members.length })}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.actionGrid}>
                  <Button
                    disabled={isWorking}
                    icon="settings"
                    label={t('tripGroups.admin.edit')}
                    onPress={() => editGroup(group)}
                    style={styles.groupActionButton}
                    variant="secondary"
                  />
                  <Button
                    disabled={isWorking}
                    icon="close"
                    label={t('tripGroups.admin.delete')}
                    onPress={() => confirmDelete(group)}
                    style={styles.groupActionButton}
                    variant="danger"
                  />
                </View>

                <View style={styles.leaderRow}>
                  <SymbolIcon color={theme.accent} name="account" size={20} />
                  <View style={styles.flexText}>
                    <ThemedText type="smallBold">{t('tripGroups.leader')}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {group.leader
                        ? group.leader.display_name
                        : t('tripGroups.admin.leaderUnavailable')}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.memberChips}>
                  {group.members.map((member) => (
                    <View
                      key={member.participant_id}
                      style={[
                        styles.memberChip,
                        { backgroundColor: theme.backgroundElement },
                      ]}>
                      <ThemedText type="tinyBold">
                        {member.display_name}
                      </ThemedText>
                    </View>
                  ))}
                </View>

                <View style={[styles.locationBox, { borderColor: theme.border }]}>
                  <ThemedText type="smallBold">
                    {t('tripGroups.admin.locationTitle')}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {request?.status === 'pending'
                      ? t('tripGroups.admin.locationPending', {
                          date: formatDate(request.requested_at, language),
                        })
                      : request?.status === 'shared' && hasCurrentResponse
                        ? t('tripGroups.admin.locationShared', {
                            date: formatDate(request.responded_at ?? request.requested_at, language),
                          })
                        : request?.status === 'declined' && hasCurrentResponse
                          ? t('tripGroups.admin.locationDeclined')
                          : t('tripGroups.admin.locationIdle')}
                  </ThemedText>
                  {canOpenLocation ? (
                    <>
                      <GroupLocationMap
                        adminCoordinate={adminCoordinate}
                        leaderCoordinate={{
                          latitude: request.latitude as number,
                          longitude: request.longitude as number,
                        }}
                      />
                      <View style={styles.mapLegend}>
                        <View style={styles.legendItem}>
                          <View style={[styles.legendDot, { backgroundColor: theme.accent }]} />
                          <ThemedText type="tinyBold">
                            {t('tripGroups.admin.leaderMarker')}
                          </ThemedText>
                        </View>
                        {adminCoordinate ? (
                          <View style={styles.legendItem}>
                            <View
                              style={[styles.legendDot, { backgroundColor: theme.location }]}
                            />
                            <ThemedText type="tinyBold">
                              {t('tripGroups.admin.adminMarker')}
                            </ThemedText>
                          </View>
                        ) : null}
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {t('tripGroups.admin.adminLocationPrivacy')}
                      </ThemedText>
                    </>
                  ) : null}
                  <View style={styles.actionGrid}>
                    <Button
                      disabled={isWorking || group.leader === null}
                      icon="map"
                      label={t(
                        request?.status === 'pending'
                          ? 'tripGroups.admin.requestAgain'
                          : 'tripGroups.admin.requestLocation',
                      )}
                      onPress={() =>
                        void runAction(
                          () => requestLeaderLocation(group.id),
                          'requested',
                        )
                      }
                      style={styles.actionButton}
                      variant="secondary"
                    />
                    {canOpenLocation ? (
                      <>
                        <Button
                          disabled={adminLocationStatus === 'loading'}
                          icon="location"
                          label={t(
                            adminLocationStatus === 'loading'
                              ? 'tripGroups.admin.locatingAdmin'
                              : adminCoordinate
                                ? 'tripGroups.admin.refreshAdminLocation'
                                : 'tripGroups.admin.showAdminLocation',
                          )}
                          onPress={() => void locateAdmin()}
                          style={styles.actionButton}
                          variant="secondary"
                        />
                        <Button
                          icon="external-link"
                          label={t('tripGroups.admin.openLocation')}
                          onPress={() =>
                            void openNavigation({
                              latitude: request.latitude as number,
                              longitude: request.longitude as number,
                              name: group.name,
                            })
                          }
                          style={styles.actionButton}
                        />
                      </>
                    ) : null}
                  </View>
                  {canOpenLocation && adminLocationStatus === 'denied' ? (
                    <ThemedText type="small" themeColor="warning">
                      {t('tripGroups.admin.adminLocationDenied')}
                    </ThemedText>
                  ) : canOpenLocation && adminLocationStatus === 'error' ? (
                    <ThemedText type="small" themeColor="danger">
                      {t('tripGroups.admin.adminLocationError')}
                    </ThemedText>
                  ) : null}
                </View>
              </Card>
            );
          })
        )}
      </View>

      {isWorking ? <ActivityIndicator color={theme.accent} /> : null}
      {feedback ? (
        <ThemedText
          accessibilityLiveRegion="polite"
          type="small"
          themeColor={feedback.type === 'success' ? 'success' : 'danger'}>
          {feedback.type === 'error'
            ? feedback.message
            : t(
                feedback.kind === 'requested'
                  ? 'tripGroups.admin.requested'
                  : 'tripGroups.admin.saved',
              )}
        </ThemedText>
      ) : null}
    </View>
  );
}

function ChoiceRow({
  disabled = false,
  label,
  note,
  onPress,
  selected,
  type,
}: {
  disabled?: boolean;
  label: string;
  note?: string;
  onPress: () => void;
  selected: boolean;
  type: 'checkbox' | 'radio';
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={type}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceRow,
        {
          backgroundColor: selected ? theme.accentSoft : theme.background,
          borderColor: selected ? theme.accent : theme.border,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <SymbolIcon
        color={selected ? theme.accent : theme.textSecondary}
        name={selected ? 'confirm' : 'unchecked'}
        size={20}
      />
      <View style={styles.flexText}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {note ? (
          <ThemedText type="small" themeColor="textSecondary">
            {note}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

function SelectedPersonRow({ label, note }: { label: string; note: string }) {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel={`${label}. ${note}`}
      style={[
        styles.choiceRow,
        { backgroundColor: theme.accentSoft, borderColor: theme.accent },
      ]}>
      <SymbolIcon color={theme.accent} name="confirm" size={20} />
      <View style={styles.flexText}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {note}
        </ThemedText>
      </View>
    </View>
  );
}

function formatDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  actionButton: { flexBasis: 180, flexGrow: 1 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  container: { gap: Spacing.three },
  stateCard: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four },
  inlineState: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  formCard: { gap: Spacing.three },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  flexText: { flex: 1, gap: Spacing.half, minWidth: 160 },
  field: { gap: Spacing.one },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  choiceSection: { gap: Spacing.two },
  choiceRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: 48,
    padding: Spacing.two,
  },
  groupList: { gap: Spacing.three },
  groupCard: { gap: Spacing.three },
  groupActionButton: { flex: 1, minWidth: 120 },
  groupHeading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  leaderRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  legendDot: { borderRadius: 999, height: 10, width: 10 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  mapLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  memberChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  memberChip: { borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  locationBox: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  selectedMemberChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.one,
    minHeight: 36,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  selectedMembers: { gap: Spacing.one },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
});
