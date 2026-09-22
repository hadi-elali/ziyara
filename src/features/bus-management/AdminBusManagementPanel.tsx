import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { Spacing } from '@/constants/theme';
import type { AccountFamily, AdminUserSummary, TripBus } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import { useBusManagement } from '@/features/bus-management/bus-management-context';
import { shouldRetryBusStatusAfterSessionRefresh } from '@/features/bus-management/bus-management-state';
import { useI18n } from '@/features/i18n/i18n';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { useTheme } from '@/hooks/use-theme';

type AssignmentChoice =
  | { familyId: number; kind: 'family' }
  | { kind: 'person'; userId: string };

type AdminBusManagementPanelProps = {
  families: AccountFamily[];
  users: AdminUserSummary[];
};

export function AdminBusManagementPanel({
  families,
  users,
}: AdminBusManagementPanelProps) {
  const theme = useTheme();
  const { language, t } = useI18n();
  const { session } = useAuth();
  const {
    activeBoarding,
    activeTrip,
    buses,
    hasSyncError,
    isLoading,
    participants,
    refresh,
    syncErrorMessage,
    trips,
  } = useBusManagement();
  const [tripName, setTripName] = useState('');
  const [templateTripId, setTemplateTripId] = useState<number | null>(null);
  const [tripExpanded, setTripExpanded] = useState(true);
  const [busName, setBusName] = useState('');
  const [leaderSearch, setLeaderSearch] = useState('');
  const [selectedLeaderUserId, setSelectedLeaderUserId] = useState<string | null>(null);
  const [editingLeaderBusId, setEditingLeaderBusId] = useState<number | null>(null);
  const [replacementLeaderSearch, setReplacementLeaderSearch] = useState('');
  const [replacementLeaderUserId, setReplacementLeaderUserId] = useState<string | null>(null);
  const [assignmentKind, setAssignmentKind] = useState<AssignmentChoice['kind']>('person');
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [assignmentChoice, setAssignmentChoice] = useState<AssignmentChoice | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<number | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);

  const archivedTrips = useMemo(
    () => trips.filter((trip) => trip.archived_at !== null),
    [trips],
  );
  const assignedFamilyIds = useMemo(
    () =>
      new Set(
        participants.flatMap((participant) =>
          participant.assignment_family_id === null
            ? []
            : [participant.assignment_family_id],
        ),
      ),
    [participants],
  );
  const assignmentUnitCount = useMemo(() => {
    const familyIds = new Set<number>();
    let people = 0;
    for (const participant of participants) {
      if (participant.assignment_family_id === null) people += 1;
      else familyIds.add(participant.assignment_family_id);
    }
    return people + familyIds.size;
  }, [participants]);
  const participantById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );
  const usersById = useMemo(
    () => new Map(users.map((user) => [user.user_id, user])),
    [users],
  );
  const familiesById = useMemo(
    () => new Map(families.map((family) => [family.id, family])),
    [families],
  );

  const matchingLeaders = useMemo(
    () => matchingUsers(users, leaderSearch, language),
    [language, leaderSearch, users],
  );
  const matchingReplacementLeaders = useMemo(
    () => matchingUsers(users, replacementLeaderSearch, language),
    [language, replacementLeaderSearch, users],
  );
  const matchingPeople = useMemo(() => {
    const visibleUsers = users.filter(
      (user) => user.family_id === null || !assignedFamilyIds.has(user.family_id),
    );
    return matchingUsers(visibleUsers, assignmentSearch, language);
  }, [assignedFamilyIds, assignmentSearch, language, users]);
  const matchingFamilies = useMemo(() => {
    const normalized = assignmentSearch.trim().toLocaleLowerCase(language);
    if (!normalized) return [];
    return families
      .filter((family) => users.some((user) => user.family_id === family.id))
      .filter(
        (family) =>
          family.name.toLocaleLowerCase(language).includes(normalized),
      )
      .slice(0, 8);
  }, [assignmentSearch, families, language, users]);

  const runAction = async (
    action: () => PromiseLike<{ error: unknown }>,
    onSuccess?: () => void,
  ) => {
    if (isWorking) return;
    setActionErrorMessage(null);
    setIsWorking(true);

    try {
      let result = await action();

      if (result.error && shouldRetryBusStatusAfterSessionRefresh(result.error)) {
        const refreshedSession = await supabase.auth.refreshSession();

        if (
          !refreshedSession.error &&
          refreshedSession.data.session?.user.id === session?.user.id
        ) {
          result = await action();
        }
      }

      if (result.error) {
        setActionErrorMessage(getOriginalErrorMessage(result.error));
        await refresh();
      } else {
        onSuccess?.();
        await refresh();
      }
    } catch (error) {
      setActionErrorMessage(getOriginalErrorMessage(error));
    } finally {
      setIsWorking(false);
    }
  };

  const createTrip = () => {
    const action =
      templateTripId === null
        ? () => supabase.rpc('admin_create_trip', { p_name: tripName.trim() })
        : () =>
            supabase.rpc('admin_copy_trip_bus_setup', {
              p_name: tripName.trim(),
              p_source_trip_id: templateTripId,
            });

    void runAction(action, () => {
      setTripName('');
      setTemplateTripId(null);
      setTripExpanded(true);
    });
  };

  const createBus = () => {
    if (!activeTrip || !selectedLeaderUserId) return;
    void runAction(
      () =>
        supabase.rpc('admin_create_trip_bus_with_leader', {
          p_leader_user_id: selectedLeaderUserId,
          p_name: busName.trim(),
          p_trip_id: activeTrip.id,
        }),
      () => {
        setBusName('');
        setLeaderSearch('');
        setSelectedLeaderUserId(null);
      },
    );
  };

  const saveBusLeader = (busId: number) => {
    if (!replacementLeaderUserId) return;
    void runAction(
      () =>
        supabase.rpc('admin_set_trip_bus_leader', {
          p_bus_id: busId,
          p_leader_user_id: replacementLeaderUserId,
        }),
      () => {
        setEditingLeaderBusId(null);
        setReplacementLeaderSearch('');
        setReplacementLeaderUserId(null);
      },
    );
  };

  const saveAssignment = () => {
    if (!activeTrip || selectedBusId === null || !assignmentChoice) return;
    const action =
      assignmentChoice.kind === 'person'
        ? () =>
            supabase.rpc('admin_assign_trip_person', {
              p_bus_id: selectedBusId,
              p_trip_id: activeTrip.id,
              p_user_id: assignmentChoice.userId,
            })
        : () =>
            supabase.rpc('admin_assign_trip_family', {
              p_bus_id: selectedBusId,
              p_family_id: assignmentChoice.familyId,
              p_trip_id: activeTrip.id,
            });

    void runAction(action, () => {
      setAssignmentSearch('');
      setAssignmentChoice(null);
      setSelectedBusId(null);
    });
  };

  const confirmCloseTrip = () => {
    if (!activeTrip) return;
    Alert.alert(t('bus.admin.archiveTitle'), t('bus.admin.archiveBody'), [
      { style: 'cancel', text: t('bus.admin.cancel') },
      {
        onPress: () =>
          void runAction(
            () => supabase.rpc('admin_archive_trip', { p_trip_id: activeTrip.id }),
            () => setTemplateTripId(activeTrip.id),
          ),
        style: 'destructive',
        text: t('bus.admin.archiveConfirm'),
      },
    ]);
  };

  if (isLoading) {
    return (
      <Card style={styles.stateCard}>
        <ActivityIndicator color={theme.accent} />
        <ThemedText themeColor="textSecondary">{t('bus.loading')}</ThemedText>
      </Card>
    );
  }

  if (hasSyncError && !activeTrip && trips.length === 0) {
    return (
      <Card style={styles.stateCard}>
        <ThemedText type="heading">{t('bus.syncErrorTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {syncErrorMessage}
        </ThemedText>
        <Button icon="refresh" label={t('bus.retry')} onPress={() => void refresh()} />
      </Card>
    );
  }

  if (!activeTrip) {
    return (
      <View style={styles.container}>
        <Card style={styles.formCard}>
          <ThemedText type="heading">{t('bus.admin.createTripTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t('bus.admin.createTripBody')}
          </ThemedText>
          <LabeledInput
            label={t('bus.admin.tripName')}
            onChangeText={setTripName}
            placeholder={t('bus.admin.tripNamePlaceholder')}
            value={tripName}
          />

          {archivedTrips.length > 0 ? (
            <View style={styles.field}>
              <ThemedText type="smallBold">{t('bus.admin.templateTitle')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('bus.admin.templateBody')}
              </ThemedText>
              <View accessibilityRole="radiogroup" style={styles.chips}>
                <SelectionChip
                  label={t('bus.admin.templateEmpty')}
                  onPress={() => setTemplateTripId(null)}
                  selected={templateTripId === null}
                />
                {archivedTrips.map((trip) => (
                  <SelectionChip
                    key={trip.id}
                    label={trip.name}
                    onPress={() => setTemplateTripId(trip.id)}
                    selected={templateTripId === trip.id}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <Button
            disabled={isWorking || tripName.trim().length < 3}
            icon="plus"
            label={t(
              templateTripId === null
                ? 'bus.admin.createTrip'
                : 'bus.admin.createTripFromTemplate',
            )}
            onPress={createTrip}
          />
          {isWorking ? <ActivityIndicator color={theme.accent} /> : null}
          {actionErrorMessage ? <ActionError message={actionErrorMessage} /> : null}
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Card style={styles.tripHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: tripExpanded }}
          onPress={() => setTripExpanded((current) => !current)}
          style={({ pressed }) => [styles.tripToggle, pressed && styles.pressed]}>
          <View style={styles.tripHeaderText}>
            <ThemedText type="heading">{activeTrip.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('bus.admin.tripSummary', {
                assignments: assignmentUnitCount,
                buses: buses.length,
              })}
            </ThemedText>
          </View>
          <View style={tripExpanded ? styles.chevronExpanded : undefined}>
            <SymbolIcon color={theme.textSecondary} name="chevron" size={22} />
          </View>
        </Pressable>
        <Button
          disabled={isWorking || Boolean(activeBoarding)}
          icon="close"
          label={t('bus.admin.archive')}
          onPress={confirmCloseTrip}
          variant="ghost"
        />
      </Card>

      {hasSyncError ? (
        <Card style={[styles.inlineError, { borderColor: theme.warning }]}>
          <ThemedText type="small" themeColor="warning">
            {syncErrorMessage}
          </ThemedText>
          <Button
            icon="refresh"
            label={t('bus.retry')}
            onPress={() => void refresh()}
            variant="secondary"
          />
        </Card>
      ) : null}

      {tripExpanded ? (
        <>
          <Card style={styles.formCard}>
            <ThemedText type="heading">{t('bus.admin.busesTitle')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('bus.admin.busLeaderRequired')}
            </ThemedText>
            <LabeledInput
              label={t('bus.admin.busName')}
              onChangeText={setBusName}
              placeholder={t('bus.admin.busNamePlaceholder')}
              value={busName}
            />
            <AccountSearch
              label={t('bus.admin.busLeader')}
              onSearchChange={(value) => {
                setLeaderSearch(value);
                setSelectedLeaderUserId(null);
              }}
              onSelect={setSelectedLeaderUserId}
              results={matchingLeaders}
              search={leaderSearch}
              selected={selectedLeaderUserId ? usersById.get(selectedLeaderUserId) ?? null : null}
            />
            <Button
              disabled={
                isWorking ||
                Boolean(activeBoarding) ||
                busName.trim().length < 2 ||
                selectedLeaderUserId === null
              }
              icon="plus"
              label={t('bus.admin.addBus')}
              onPress={createBus}
            />

            {buses.map((bus) => {
              const leader =
                bus.leader_participant_id === null
                  ? null
                  : participantById.get(bus.leader_participant_id) ?? null;
              const editingLeader = editingLeaderBusId === bus.id;
              return (
                <View
                  key={bus.id}
                  style={[styles.busCard, { borderColor: theme.border }]}>
                  <View style={styles.rowBetween}>
                    <View style={styles.flexText}>
                      <ThemedText type="heading">{bus.name}</ThemedText>
                      <ThemedText
                        type="smallBold"
                        themeColor={leader ? 'accent' : 'danger'}>
                        {leader
                          ? t('bus.admin.busLeaderName', { name: leader.display_name })
                          : t('bus.admin.busLeaderMissing')}
                      </ThemedText>
                    </View>
                    <Button
                      disabled={isWorking || Boolean(activeBoarding)}
                      icon="settings"
                      label={t(
                        leader
                          ? 'bus.admin.changeBusLeader'
                          : 'bus.admin.setBusLeader',
                      )}
                      onPress={() => {
                        setEditingLeaderBusId(editingLeader ? null : bus.id);
                        setReplacementLeaderSearch('');
                        setReplacementLeaderUserId(null);
                      }}
                      variant="secondary"
                    />
                  </View>
                  {editingLeader ? (
                    <View style={styles.leaderEditor}>
                      <AccountSearch
                        label={t('bus.admin.busLeader')}
                        onSearchChange={(value) => {
                          setReplacementLeaderSearch(value);
                          setReplacementLeaderUserId(null);
                        }}
                        onSelect={setReplacementLeaderUserId}
                        results={matchingReplacementLeaders}
                        search={replacementLeaderSearch}
                        selected={
                          replacementLeaderUserId
                            ? usersById.get(replacementLeaderUserId) ?? null
                            : null
                        }
                      />
                      <Button
                        disabled={isWorking || replacementLeaderUserId === null}
                        icon="confirm"
                        label={t('bus.admin.saveBusLeader')}
                        onPress={() => saveBusLeader(bus.id)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>

          <Card style={styles.formCard}>
            <ThemedText type="heading">{t('bus.admin.assignmentTitle')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('bus.admin.assignmentBody')}
            </ThemedText>
            <View accessibilityRole="radiogroup" style={styles.chips}>
              <SelectionChip
                label={t('bus.admin.person')}
                onPress={() => {
                  setAssignmentKind('person');
                  setAssignmentChoice(null);
                  setAssignmentSearch('');
                }}
                selected={assignmentKind === 'person'}
              />
              <SelectionChip
                label={t('bus.admin.family')}
                onPress={() => {
                  setAssignmentKind('family');
                  setAssignmentChoice(null);
                  setAssignmentSearch('');
                }}
                selected={assignmentKind === 'family'}
              />
            </View>

            <LabeledInput
              label={t(
                assignmentKind === 'person'
                  ? 'bus.admin.personSearch'
                  : 'bus.admin.familySearch',
              )}
              onChangeText={(value) => {
                setAssignmentSearch(value);
                setAssignmentChoice(null);
              }}
              placeholder={t(
                assignmentKind === 'person'
                  ? 'bus.admin.personSearchPlaceholder'
                  : 'bus.admin.familySearchPlaceholder',
              )}
              value={assignmentSearch}
            />

            <View style={styles.accountResults}>
              {assignmentKind === 'person'
                ? matchingPeople.map((user) => (
                    <ChoiceRow
                      key={user.user_id}
                      label={user.display_name}
                      note={t('bus.admin.accountPartySize', { count: user.party_size })}
                      onPress={() =>
                        setAssignmentChoice({ kind: 'person', userId: user.user_id })
                      }
                      selected={
                        assignmentChoice?.kind === 'person' &&
                        assignmentChoice.userId === user.user_id
                      }
                    />
                  ))
                : matchingFamilies.map((family) => {
                    const members = users.filter((user) => user.family_id === family.id);
                    return (
                      <ChoiceRow
                        key={family.id}
                        label={family.name}
                        note={t('bus.admin.familyMembers', {
                          count: members.length,
                          names: members.map((member) => member.display_name).join(', '),
                        })}
                        onPress={() =>
                          setAssignmentChoice({ familyId: family.id, kind: 'family' })
                        }
                        selected={
                          assignmentChoice?.kind === 'family' &&
                          assignmentChoice.familyId === family.id
                        }
                      />
                    );
                  })}
            </View>

            {assignmentSearch.trim() &&
            assignmentKind === 'person' &&
            matchingPeople.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('bus.admin.noPeopleAvailable')}
              </ThemedText>
            ) : null}
            {assignmentSearch.trim() &&
            assignmentKind === 'family' &&
            matchingFamilies.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('bus.admin.noFamiliesAvailable')}
              </ThemedText>
            ) : null}

            <ThemedText type="smallBold">{t('bus.admin.selectBus')}</ThemedText>
            <View accessibilityRole="radiogroup" style={styles.chips}>
              {buses.map((bus) => (
                <SelectionChip
                  key={bus.id}
                  label={bus.name}
                  onPress={() => setSelectedBusId(bus.id)}
                  selected={selectedBusId === bus.id}
                />
              ))}
            </View>

            <Button
              disabled={
                isWorking ||
                Boolean(activeBoarding) ||
                buses.length === 0 ||
                selectedBusId === null ||
                assignmentChoice === null
              }
              icon="confirm"
              label={t('bus.admin.saveAssignment')}
              onPress={saveAssignment}
            />
          </Card>

          <View style={styles.participantList}>
            {participants.length === 0 ? (
              <Card style={styles.stateCard}>
                <ThemedText type="heading">{t('bus.admin.noParticipantsTitle')}</ThemedText>
                <ThemedText themeColor="textSecondary">
                  {t('bus.admin.noParticipantsBody')}
                </ThemedText>
              </Card>
            ) : (
              buses.map((bus) => (
                <BusAssignments
                  bus={bus}
                  familiesById={familiesById}
                  key={bus.id}
                  participants={participants.filter((participant) => participant.bus_id === bus.id)}
                />
              ))
            )}
          </View>
        </>
      ) : null}

      {isWorking ? <ActivityIndicator color={theme.accent} /> : null}
      {actionErrorMessage ? <ActionError message={actionErrorMessage} /> : null}
    </View>
  );
}

function matchingUsers(users: AdminUserSummary[], search: string, language: string) {
  const normalized = search.trim().toLocaleLowerCase(language);
  if (!normalized) return [];
  return users
    .filter(
      (user) => user.display_name.toLocaleLowerCase(language).includes(normalized),
    )
    .sort((left, right) => left.display_name.localeCompare(right.display_name, language))
    .slice(0, 8);
}

function AccountSearch({
  label,
  onSearchChange,
  onSelect,
  results,
  search,
  selected,
}: {
  label: string;
  onSearchChange: (value: string) => void;
  onSelect: (userId: string) => void;
  results: AdminUserSummary[];
  search: string;
  selected: AdminUserSummary | null;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.field}>
      <LabeledInput
        label={label}
        onChangeText={onSearchChange}
        placeholder={t('bus.admin.personSearchPlaceholder')}
        value={search}
      />
      {selected ? (
        <ThemedText type="smallBold" themeColor="success">
          {t('bus.admin.selectedPerson', { name: selected.display_name })}
        </ThemedText>
      ) : null}
      <View style={styles.accountResults}>
        {results.map((user) => (
          <ChoiceRow
            key={user.user_id}
            label={user.display_name}
            note={t('bus.admin.accountPartySize', { count: user.party_size })}
            onPress={() => onSelect(user.user_id)}
            selected={selected?.user_id === user.user_id}
          />
        ))}
      </View>
    </View>
  );
}

function BusAssignments({
  bus,
  familiesById,
  participants,
}: {
  bus: TripBus;
  familiesById: Map<number, AccountFamily>;
  participants: ReturnType<typeof useBusManagement>['participants'];
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const familyGroups = new Map<number, typeof participants>();
  const people = [] as typeof participants;

  for (const participant of participants) {
    if (participant.assignment_family_id === null) {
      people.push(participant);
    } else {
      familyGroups.set(participant.assignment_family_id, [
        ...(familyGroups.get(participant.assignment_family_id) ?? []),
        participant,
      ]);
    }
  }

  return (
    <Card style={styles.assignmentCard}>
      <ThemedText type="heading">{bus.name}</ThemedText>
      {participants.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('bus.admin.busEmpty')}
        </ThemedText>
      ) : (
        <View style={styles.assignmentRows}>
          {[...familyGroups.entries()].map(([familyId, members]) => (
            <View
              key={`family:${familyId}`}
              style={[styles.assignmentRow, { borderColor: theme.border }]}>
              <SymbolIcon color={theme.accent} name="people" size={20} />
              <View style={styles.flexText}>
                <ThemedText type="smallBold">
                  {familiesById.get(familyId)?.name ?? t('bus.admin.unknownFamily')}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {members.map((member) => member.display_name).join(', ')}
                </ThemedText>
              </View>
            </View>
          ))}
          {people.map((participant) => (
            <View
              key={participant.id}
              style={[styles.assignmentRow, { borderColor: theme.border }]}>
              <SymbolIcon color={theme.accent} name="account" size={20} />
              <ThemedText type="smallBold" style={styles.flexText}>
                {participant.display_name}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function LabeledInput({
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
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
        value={value}
      />
    </View>
  );
}

function ChoiceRow({
  label,
  note,
  onPress,
  selected,
}: {
  label: string;
  note: string;
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
        styles.accountResult,
        {
          backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
          borderColor: selected ? theme.accent : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {note}
      </ThemedText>
    </Pressable>
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
      <ThemedText
        type="smallBold"
        style={selected ? { color: theme.background } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function ActionError({ message }: { message: string }) {
  return (
    <ThemedText accessibilityLiveRegion="polite" themeColor="danger" type="small">
      {message}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  accountResult: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.half,
    padding: Spacing.two,
  },
  accountResults: {
    gap: Spacing.one,
  },
  assignmentCard: {
    gap: Spacing.two,
  },
  assignmentRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  assignmentRows: {
    gap: Spacing.one,
  },
  busCard: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    padding: Spacing.two,
  },
  chevronExpanded: {
    transform: [{ rotate: '90deg' }],
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
  flexText: {
    flex: 1,
    gap: Spacing.half,
  },
  formCard: {
    gap: Spacing.three,
  },
  inlineError: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
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
  leaderEditor: {
    gap: Spacing.two,
  },
  participantList: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.72,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
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
  tripHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tripHeaderText: {
    flex: 1,
    gap: Spacing.half,
  },
  tripToggle: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    minWidth: 220,
  },
});
