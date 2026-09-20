import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { AccountFamily, AdminUserSummary, AppRole } from '@/domain/database';
import { AdminAccountFamilyPanel } from '@/features/account-families/AdminAccountFamilyPanel';
import {
  buildAdminUserListItems,
  getAdminUserStats,
} from '@/features/admin/admin-user-list';
import { AdminSectionHeader } from '@/features/admin/AdminSectionHeader';
import { useAuth } from '@/features/auth/auth-context';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { supabase } from '@/features/auth/supabase';
import { AdminBusManagementPanel } from '@/features/bus-management/AdminBusManagementPanel';
import { useBusManagement } from '@/features/bus-management/bus-management-context';
import { AdminDailyProgramPanel } from '@/features/daily-program/AdminDailyProgramPanel';
import { useDailyProgram } from '@/features/daily-program/daily-program-context';
import { localISODate, visibleDailyPrograms } from '@/features/daily-program/daily-program-state';
import { AdminGeneralAlarmPanel } from '@/features/general-alarm/AdminGeneralAlarmPanel';
import { AdminGroupCheckPanel } from '@/features/group-check/AdminGroupCheckPanel';
import { useGroupCheck } from '@/features/group-check/group-check-context';
import { AdminQuestionRoundPanel } from '@/features/question-round/AdminQuestionRoundPanel';
import { useQuestionRound } from '@/features/question-round/question-round-context';
import { useI18n } from '@/features/i18n/i18n';
import {
  getOriginalErrorMessage,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';
import { AdminMeetingPointPanel } from '@/features/trip-guidance/AdminMeetingPointPanel';
import { AdminTripGuidancePanel } from '@/features/trip-guidance/AdminTripGuidancePanel';
import { useTripGuidance } from '@/features/trip-guidance/trip-guidance-context';
import { useTheme } from '@/hooks/use-theme';
import { AdminTripGroupPanel } from '@/features/trip-groups/AdminTripGroupPanel';
import { useTripGroups } from '@/features/trip-groups/trip-group-context';

const adminPageSize = 200;
const assignableRoles: AppRole[] = ['user', 'medical_staff', 'organization_team', 'admin'];

type AdminSection =
  | 'alarm'
  | 'bus'
  | 'families'
  | 'guidance'
  | 'groups'
  | 'navigation'
  | 'program'
  | 'questions'
  | 'status'
  | 'users';
type RoleFeedback = {
  message?: string;
  type: 'error' | 'success';
  userId: string;
};
type DutyFeedback = {
  message?: string;
  type: 'error' | 'push-error' | 'success';
  userId: string;
};

const dutyPushTimeoutMs = 8_000;

async function dispatchDutyPush(notificationId: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutResult = new Promise<null>((resolve) => {
    timeout = setTimeout(() => resolve(null), dutyPushTimeoutMs);
  });

  try {
    return await Promise.race([
      supabase.functions.invoke<{ accepted?: number; claimed?: number }>(
        'dispatch-emergency-duty',
        { body: { notificationId } },
      ),
      timeoutResult,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchAllAdminUsers() {
  const allUsers: AdminUserSummary[] = [];

  for (let from = 0; ; from += adminPageSize) {
    const { data, error } = await withSupabaseReadTimeout((signal) =>
      supabase
        .rpc('admin_list_users')
        .range(from, from + adminPageSize - 1)
        .abortSignal(signal),
    );

    if (error) {
      throw error;
    }

    const page = data ?? [];
    allUsers.push(...page);

    if (page.length < adminPageSize) {
      return allUsers;
    }
  }
}

async function fetchAdminFamilies() {
  const { data, error } = await withSupabaseReadTimeout((signal) =>
    supabase.rpc('admin_list_account_families').abortSignal(signal),
  );

  if (error) {
    throw error;
  }

  return data ?? [];
}

export default function AdminScreen() {
  return (
    <RequireAuth admin returnTo="/admin">
      <AdminContent />
    </RequireAuth>
  );
}

function AdminContent() {
  const theme = useTheme();
  const { isRTL, language, t } = useI18n();
  const { profile, refreshProfile } = useAuth();
  const { activeBoarding, hasSyncError: hasBusSyncError } = useBusManagement();
  const {
    hasSyncError: hasDailyProgramSyncError,
    programs: dailyPrograms,
  } = useDailyProgram();
  const upcomingDailyProgramCount = visibleDailyPrograms(
    dailyPrograms,
    localISODate(),
  ).length;
  const { activeCheck, hasSyncError: hasGroupCheckSyncError } = useGroupCheck();
  const {
    groups: tripGroups,
    hasSyncError: hasTripGroupSyncError,
  } = useTripGroups();
  const { activeRound, hasSyncError: hasQuestionRoundSyncError } = useQuestionRound();
  const {
    activeGuidance,
    hasSyncError: hasTripGuidanceSyncError,
    navigationDestinations,
  } = useTripGuidance();
  const hasNavigationTarget = navigationDestinations.length > 0;
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [families, setFamilies] = useState<AccountFamily[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [readErrorMessage, setReadErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [expandedRoleUserId, setExpandedRoleUserId] = useState<string | null>(null);
  const [roleFeedback, setRoleFeedback] = useState<RoleFeedback | null>(null);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [dutyFeedback, setDutyFeedback] = useState<DutyFeedback | null>(null);
  const [updatingDutyUserId, setUpdatingDutyUserId] = useState<string | null>(null);
  const usersRequestSequence = useRef(0);
  const hasError = readErrorMessage !== null;
  const [expandedSections, setExpandedSections] = useState<Record<AdminSection, boolean>>({
    alarm: false,
    bus: false,
    families: false,
    guidance: false,
    groups: false,
    navigation: false,
    program: false,
    questions: false,
    status: false,
    users: false,
  });

  const userStats = useMemo(() => getAdminUserStats(users), [users]);
  const userListItems = useMemo(
    () => buildAdminUserListItems(users, searchQuery, language),
    [language, searchQuery, users],
  );

  const loadUsers = useCallback(async () => {
    const requestSequence = ++usersRequestSequence.current;
    setReadErrorMessage(null);
    setIsLoading(true);

    try {
      const [nextUsers, nextFamilies] = await Promise.all([
        fetchAllAdminUsers(),
        fetchAdminFamilies(),
      ]);

      if (requestSequence === usersRequestSequence.current) {
        setUsers(nextUsers);
        setFamilies(nextFamilies);
      }
    } catch (error) {
      if (requestSequence === usersRequestSequence.current) {
        setReadErrorMessage(getOriginalErrorMessage(error));
      }
    } finally {
      if (requestSequence === usersRequestSequence.current) {
        setHasLoaded(true);
        setIsLoading(false);
      }
    }
  }, []);

  const assignRole = useCallback(
    async (userId: string, role: AppRole) => {
      setRoleFeedback(null);
      setDutyFeedback(null);
      setUpdatingRoleUserId(userId);

      try {
        const { error } = await supabase.rpc('admin_set_user_role', {
          p_role: role,
          p_user_id: userId,
        });

        if (error) {
          setRoleFeedback({
            message: error.message,
            type: 'error',
            userId,
          });
          return;
        }

        setUsers((current) =>
          current.map((user) =>
            user.user_id === userId
              ? { ...user, emergency_on_duty: false, role }
              : user,
          ),
        );
        setRoleFeedback({ type: 'success', userId });
        setExpandedRoleUserId(null);

        if (profile?.user_id === userId) {
          await refreshProfile();
        }
      } catch (error) {
        const message = getOriginalErrorMessage(error);
        if (message) setRoleFeedback({ message, type: 'error', userId });
      } finally {
        setUpdatingRoleUserId(null);
      }
    },
    [profile, refreshProfile],
  );

  const assignDuty = useCallback(async (userId: string, onDuty: boolean) => {
    setDutyFeedback(null);
    setUpdatingDutyUserId(userId);

    try {
      const { data, error } = await supabase.rpc('admin_set_emergency_duty', {
        p_on_duty: onDuty,
        p_user_id: userId,
      });
      if (error || !data?.[0]) throw error ?? new Error('Missing duty assignment result.');

      const result = data[0];
      setUsers((current) =>
        current.map((user) =>
          user.user_id === userId
            ? { ...user, emergency_on_duty: result.emergency_on_duty }
            : user,
        ),
      );

      if (!result.notification_id) {
        setDutyFeedback({ type: 'success', userId });
        return;
      }

      try {
        const dispatch = await dispatchDutyPush(result.notification_id);
        if (dispatch?.error) {
          setDutyFeedback({ message: dispatch.error.message, type: 'error', userId });
          return;
        }
        const pushAccepted = Boolean(
          dispatch && (dispatch.data?.accepted ?? 0) > 0,
        );
        setDutyFeedback({ type: pushAccepted ? 'success' : 'push-error', userId });
      } catch (error) {
        const message = getOriginalErrorMessage(error);
        if (message) setDutyFeedback({ message, type: 'error', userId });
      }
    } catch (error) {
      const message = getOriginalErrorMessage(error);
      if (message) setDutyFeedback({ message, type: 'error', userId });
    } finally {
      setUpdatingDutyUserId(null);
    }
  }, []);

  useEffect(() => {
    const initialLoadTimeout = setTimeout(() => void loadUsers(), 0);

    return () => {
      clearTimeout(initialLoadTimeout);
      usersRequestSequence.current += 1;
    };
  }, [loadUsers]);

  const toggleSection = (section: AdminSection) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const toggleUserDetails = (userId: string) => {
    setRoleFeedback(null);
    setDutyFeedback(null);
    setExpandedRoleUserId(null);
    setExpandedUserId((current) => (current === userId ? null : userId));
  };

  return (
    <SafeAreaView
      edges={['right', 'bottom', 'left']}
      style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
          <FlatList
        contentContainerStyle={styles.content}
        data={expandedSections.users && hasLoaded && !hasError ? userListItems : []}
        extraData={{
          expandedRoleUserId,
          expandedUserId,
          roleFeedback,
          dutyFeedback,
          updatingDutyUserId,
          updatingRoleUserId,
        }}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.key}
        refreshControl={
          <RefreshControl
            colors={[theme.accent]}
            onRefresh={() => void loadUsers()}
            refreshing={isLoading && hasLoaded}
            tintColor={theme.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <View style={styles.intro}>
              <ThemedText type="title">{t('admin.title')}</ThemedText>
              <ThemedText themeColor="textSecondary">{t('admin.description')}</ThemedText>
            </View>

            <View style={styles.sections}>
              <View style={styles.section}>
                <AdminSectionHeader
                  description={t('admin.section.bus.description')}
                  expanded={expandedSections.bus}
                  icon="bus"
                  onToggle={() => toggleSection('bus')}
                  status={t('admin.section.bus.status')}
                  statusColor="accent"
                  title={t('admin.section.bus.title')}
                />
                {expandedSections.bus ? (
                  <AdminBusManagementPanel families={families} users={users} />
                ) : null}
              </View>

              <View style={styles.section}>
                <AdminSectionHeader
                  description={t('admin.section.groups.description')}
                  expanded={expandedSections.groups}
                  icon="people"
                  onToggle={() => toggleSection('groups')}
                  status={t(
                    hasTripGroupSyncError
                      ? 'admin.section.groups.error'
                      : tripGroups.length > 0
                        ? 'admin.section.groups.active'
                        : 'admin.section.groups.inactive',
                    { count: tripGroups.length },
                  )}
                  statusColor={
                    hasTripGroupSyncError
                      ? 'danger'
                      : tripGroups.length > 0
                        ? 'success'
                        : 'textSecondary'
                  }
                  title={t('admin.section.groups.title')}
                />
                {expandedSections.groups ? <AdminTripGroupPanel /> : null}
              </View>

              <View style={styles.section}>
                <AdminSectionHeader
                  description={t('admin.section.alarm.description')}
                  expanded={expandedSections.alarm}
                  icon="warning"
                  onToggle={() => toggleSection('alarm')}
                  status={t(
                    hasBusSyncError
                      ? 'admin.section.alarm.error'
                      : activeBoarding
                        ? 'admin.section.alarm.active'
                        : 'admin.section.alarm.inactive',
                  )}
                  statusColor={
                    hasBusSyncError ? 'danger' : activeBoarding ? 'warning' : 'textSecondary'
                  }
                  title={t('admin.section.alarm.title')}
                />
                {expandedSections.alarm ? <AdminGeneralAlarmPanel /> : null}
              </View>

              <View style={styles.section}>
                <AdminSectionHeader
                  description={t('admin.section.program.description')}
                  expanded={expandedSections.program}
                  icon="book"
                  onToggle={() => toggleSection('program')}
                  status={t(
                    hasDailyProgramSyncError
                      ? 'admin.section.program.error'
                      : upcomingDailyProgramCount > 0
                        ? 'admin.section.program.active'
                        : 'admin.section.program.inactive',
                    { count: upcomingDailyProgramCount },
                  )}
                  statusColor={
                    hasDailyProgramSyncError
                      ? 'danger'
                      : upcomingDailyProgramCount > 0
                        ? 'success'
                        : 'textSecondary'
                  }
                  title={t('admin.section.program.title')}
                />
                {expandedSections.program ? <AdminDailyProgramPanel /> : null}
              </View>

              <View style={styles.section}>
                <AdminSectionHeader
                  description={t('admin.section.guidance.description')}
                  expanded={expandedSections.guidance}
                  icon="map"
                  onToggle={() => toggleSection('guidance')}
                  status={t(
                    hasTripGuidanceSyncError
                      ? 'admin.section.guidance.error'
                      : activeGuidance
                        ? 'admin.section.guidance.active'
                        : 'admin.section.guidance.inactive',
                  )}
                  statusColor={
                    hasTripGuidanceSyncError
                      ? 'danger'
                      : activeGuidance
                        ? 'success'
                        : 'textSecondary'
                  }
                  title={t('admin.section.guidance.title')}
                />
                {expandedSections.guidance ? <AdminTripGuidancePanel /> : null}
              </View>

              <View style={styles.section}>
                <AdminSectionHeader
                  description={t('admin.section.navigation.description')}
                  expanded={expandedSections.navigation}
                  icon="external-link"
                  onToggle={() => toggleSection('navigation')}
                  status={t(
                    hasTripGuidanceSyncError
                      ? 'admin.section.navigation.error'
                      : hasNavigationTarget
                        ? 'admin.section.navigation.active'
                        : 'admin.section.navigation.inactive',
                    { count: navigationDestinations.length },
                  )}
                  statusColor={
                    hasTripGuidanceSyncError
                      ? 'danger'
                      : hasNavigationTarget
                        ? 'success'
                        : 'textSecondary'
                  }
                  title={t('admin.section.navigation.title')}
                />
                {expandedSections.navigation ? <AdminMeetingPointPanel /> : null}
              </View>

              <View style={styles.section}>
                <AdminSectionHeader
                  description={t('admin.section.status.description')}
                  expanded={expandedSections.status}
                  icon="confirm"
                  onToggle={() => toggleSection('status')}
                  status={t(
                    hasGroupCheckSyncError
                      ? 'admin.section.status.error'
                      : activeCheck
                        ? 'admin.section.status.active'
                        : 'admin.section.status.inactive',
                  )}
                  statusColor={
                    hasGroupCheckSyncError ? 'danger' : activeCheck ? 'warning' : 'textSecondary'
                  }
                  title={t('admin.section.status.title')}
                />
                {expandedSections.status ? <AdminGroupCheckPanel /> : null}
              </View>

              <View style={styles.section}>
                <AdminSectionHeader
                  description={t('admin.section.questions.description')}
                  expanded={expandedSections.questions}
                  icon="question"
                  onToggle={() => toggleSection('questions')}
                  status={t(
                    hasQuestionRoundSyncError
                      ? 'admin.section.questions.error'
                      : activeRound
                        ? 'admin.section.questions.open'
                        : 'admin.section.questions.closed',
                  )}
                  statusColor={
                    hasQuestionRoundSyncError
                      ? 'danger'
                      : activeRound
                        ? 'success'
                        : 'textSecondary'
                  }
                  title={t('admin.section.questions.title')}
                />
                {expandedSections.questions ? <AdminQuestionRoundPanel /> : null}
              </View>

              <View style={styles.section}>
                <AdminSectionHeader
                  description={t('admin.section.families.description')}
                  expanded={expandedSections.families}
                  icon="people"
                  onToggle={() => toggleSection('families')}
                  status={
                    hasError
                      ? t('admin.section.families.error')
                      : !hasLoaded
                        ? t('admin.section.families.loading')
                        : t('admin.section.families.count', {
                            count: families.length,
                          })
                  }
                  statusColor={hasError ? 'danger' : 'textSecondary'}
                  title={t('admin.section.families.title')}
                />
                {expandedSections.families ? (
                  isLoading && !hasLoaded ? (
                    <Card style={styles.state}>
                      <ActivityIndicator color={theme.accent} size="large" />
                      <ThemedText themeColor="textSecondary">
                        {t('accountFamilies.loading')}
                      </ThemedText>
                    </Card>
                  ) : hasError ? (
                    <Card style={styles.state}>
                      <ThemedText type="heading">{t('admin.errorTitle')}</ThemedText>
                      <ThemedText themeColor="textSecondary">
                        {readErrorMessage}
                      </ThemedText>
                      <Button
                        icon="refresh"
                        label={t('admin.retry')}
                        onPress={() => void loadUsers()}
                      />
                    </Card>
                  ) : (
                    <AdminAccountFamilyPanel
                      families={families}
                      onChanged={loadUsers}
                      users={users}
                    />
                  )
                ) : null}
              </View>

              <View style={styles.section}>
                <AdminSectionHeader
                  description={t('admin.section.users.description')}
                  expanded={expandedSections.users}
                  icon="people"
                  onToggle={() => toggleSection('users')}
                  status={
                    hasError
                      ? t('admin.section.users.error')
                      : !hasLoaded
                        ? t('admin.section.users.loading')
                        : t('admin.section.users.count', { count: users.length })
                  }
                  statusColor={hasError ? 'danger' : 'textSecondary'}
                  title={t('admin.section.users.title')}
                />

                {expandedSections.users ? (
                  isLoading && !hasLoaded ? (
                    <Card style={styles.state}>
                      <ActivityIndicator color={theme.accent} size="large" />
                      <ThemedText themeColor="textSecondary">{t('admin.loading')}</ThemedText>
                    </Card>
                  ) : hasError ? (
                    <Card style={styles.state}>
                      <ThemedText type="heading">{t('admin.errorTitle')}</ThemedText>
                      <ThemedText themeColor="textSecondary">
                        {readErrorMessage}
                      </ThemedText>
                      <Button
                        icon="refresh"
                        label={t('admin.retry')}
                        onPress={() => void loadUsers()}
                      />
                    </Card>
                  ) : users.length === 0 ? (
                    <Card style={styles.state}>
                      <ThemedText type="heading">{t('admin.emptyTitle')}</ThemedText>
                      <ThemedText themeColor="textSecondary">{t('admin.emptyBody')}</ThemedText>
                    </Card>
                  ) : (
                    <View style={styles.usersTools}>
                      <Card style={styles.overviewCard}>
                        <ThemedText type="small">
                          {t('admin.userCount', { count: users.length })}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('admin.personCount', { count: userStats.representedPeople })}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('admin.brotherCount', { count: userStats.brotherAccounts })}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('admin.sisterCount', { count: userStats.sisterAccounts })}
                        </ThemedText>
                        {userStats.unknownMemberTypeAccounts > 0 ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            {t('admin.unknownMemberTypeCount', {
                              count: userStats.unknownMemberTypeAccounts,
                            })}
                          </ThemedText>
                        ) : null}
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('admin.familyCount', { count: families.length })}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('admin.totalLuggageCount', { count: userStats.luggageCount })}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('admin.totalSimCardCount', { count: userStats.simCardCount })}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('admin.memberTypeCountHint')}
                        </ThemedText>
                      </Card>

                      <View
                        style={[
                          styles.searchField,
                          { backgroundColor: theme.surface, borderColor: theme.border },
                        ]}>
                        <SymbolIcon color={theme.textSecondary} name="search" size={18} />
                        <TextInput
                          accessibilityLabel={t('admin.searchA11y')}
                          autoCapitalize="words"
                          autoCorrect={false}
                          onChangeText={setSearchQuery}
                          placeholder={t('admin.searchPlaceholder')}
                          placeholderTextColor={theme.textSecondary}
                          returnKeyType="search"
                          style={[
                            styles.searchInput,
                            {
                              color: theme.text,
                              textAlign: isRTL ? 'right' : 'left',
                              writingDirection: isRTL ? 'rtl' : 'ltr',
                            },
                          ]}
                          value={searchQuery}
                        />
                      </View>
                    </View>
                  )
                ) : null}
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          expandedSections.users &&
          hasLoaded &&
          !hasError &&
          users.length > 0 &&
          searchQuery.trim() ? (
            <Card style={styles.state}>
              <ThemedText type="heading">{t('admin.searchEmptyTitle')}</ThemedText>
              <ThemedText themeColor="textSecondary">{t('admin.searchEmptyBody')}</ThemedText>
            </Card>
          ) : null
        }
        renderItem={({ item }) => {
          const renderUser = (user: AdminUserSummary) => (
            <AdminUserDisclosure
              expanded={expandedUserId === user.user_id}
              key={user.user_id}
              onAssignRole={(role) => void assignRole(user.user_id, role)}
              onAssignDuty={(onDuty) => void assignDuty(user.user_id, onDuty)}
              onToggleDetails={() => toggleUserDetails(user.user_id)}
              onToggleRoleAssignment={() => {
                setRoleFeedback(null);
                setExpandedRoleUserId((current) =>
                  current === user.user_id ? null : user.user_id,
                );
              }}
              roleAssignmentExpanded={expandedRoleUserId === user.user_id}
              roleFeedback={
                roleFeedback?.userId === user.user_id ? roleFeedback : null
              }
              roleChoicesDisabled={
                updatingRoleUserId !== null || updatingDutyUserId !== null
              }
              dutyFeedback={
                dutyFeedback?.userId === user.user_id ? dutyFeedback : null
              }
              dutyUpdateDisabled={
                updatingDutyUserId !== null || updatingRoleUserId !== null
              }
              updatingDuty={updatingDutyUserId === user.user_id}
              updatingRole={updatingRoleUserId === user.user_id}
              user={user}
            />
          );

          if (item.type === 'user') {
            return renderUser(item.user);
          }

          return (
            <Card
              style={[
                styles.familyPacket,
                { backgroundColor: theme.backgroundElement },
              ]}>
              <View style={styles.familyPacketHeader}>
                <ThemedText style={styles.familyPacketName}>
                  {item.familyName ?? t('accountFamilies.unknownFamily')}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('accountFamilies.memberCount', { count: item.members.length })}
                </ThemedText>
              </View>
              <View style={styles.familyMembers}>{item.members.map(renderUser)}</View>
            </Card>
          );
        }}
          />
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AdminUserDisclosure({
  dutyFeedback,
  dutyUpdateDisabled,
  expanded,
  onAssignDuty,
  onAssignRole,
  onToggleDetails,
  onToggleRoleAssignment,
  roleAssignmentExpanded,
  roleChoicesDisabled,
  roleFeedback,
  updatingRole,
  updatingDuty,
  user,
}: {
  dutyFeedback: DutyFeedback | null;
  dutyUpdateDisabled: boolean;
  expanded: boolean;
  onAssignDuty: (onDuty: boolean) => void;
  onAssignRole: (role: AppRole) => void;
  onToggleDetails: () => void;
  onToggleRoleAssignment: () => void;
  roleAssignmentExpanded: boolean;
  roleChoicesDisabled: boolean;
  roleFeedback: RoleFeedback | null;
  updatingRole: boolean;
  updatingDuty: boolean;
  user: AdminUserSummary;
}) {
  const theme = useTheme();
  const { isRTL, t } = useI18n();
  const chevronRotation = expanded ? '90deg' : isRTL ? '180deg' : '0deg';

  return (
    <View
      style={[
        styles.userDisclosure,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}>
      <Pressable
        accessibilityLabel={t(
          expanded ? 'admin.details.hide' : 'admin.details.show',
          { name: user.display_name },
        )}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggleDetails}
        style={({ pressed }) => [
          styles.userSummary,
          pressed && styles.userSummaryPressed,
        ]}>
        <ThemedText style={styles.userName}>
          {user.display_name}
        </ThemedText>
        <View style={[styles.userChevron, { transform: [{ rotate: chevronRotation }] }]}>
          <SymbolIcon color={theme.textSecondary} name="chevron" size={22} />
        </View>
      </Pressable>

      {expanded ? (
        <View style={[styles.userDetails, { borderColor: theme.border }]}>
          <View style={styles.userRole}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('admin.roleLabel')}
            </ThemedText>
            <View
              style={[
                styles.roleBadge,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}>
              <ThemedText type="tinyBold">{t(`admin.role.${user.role}`)}</ThemedText>
            </View>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t('admin.partySize', { count: user.party_size })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('admin.memberType', {
              memberType: t(`admin.memberType.${user.member_type ?? 'unknown'}`),
            })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('admin.luggageCount', { count: user.luggage_count })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('admin.simCardCount', { count: user.sim_card_count })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {user.family_name
              ? t('admin.accountFamily', { name: user.family_name })
              : t('admin.accountFamilyUnassigned')}
          </ThemedText>

          <Button
            disabled={roleChoicesDisabled}
            icon={roleAssignmentExpanded ? 'close' : 'settings'}
            label={t(
              roleAssignmentExpanded
                ? 'admin.roleAssignment.close'
                : 'admin.roleAssignment.title',
            )}
            onPress={onToggleRoleAssignment}
            style={[styles.roleAssignmentButton, { backgroundColor: theme.surface }]}
            variant="secondary"
          />

          {roleAssignmentExpanded ? (
            <View style={[styles.roleAssignment, { borderColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('admin.roleAssignment.body')}
              </ThemedText>
              <View accessibilityRole="radiogroup" style={styles.roleChoices}>
                {assignableRoles.map((role) => (
                  <RoleChoice
                    disabled={roleChoicesDisabled}
                    key={role}
                    label={t(`admin.role.${role}`)}
                    onPress={() => onAssignRole(role)}
                    selected={user.role === role}
                  />
                ))}
              </View>

              {updatingRole ? (
                <View style={styles.roleProgress}>
                  <ActivityIndicator color={theme.accent} size="small" />
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('admin.roleAssignment.saving')}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          ) : null}

          {roleFeedback ? (
            <ThemedText
              accessibilityLiveRegion="polite"
              type="small"
              themeColor={roleFeedback.type === 'success' ? 'success' : 'danger'}>
              {roleFeedback.type === 'success'
                ? t('admin.roleAssignment.saved')
                : roleFeedback.message}
            </ThemedText>
          ) : null}

          {user.role === 'medical_staff' || user.role === 'organization_team' ? (
            <View style={[styles.dutyAssignment, { borderColor: theme.border }]}>
              <View style={styles.dutyHeader}>
                <View style={styles.dutyText}>
                  <ThemedText type="smallBold">{t('admin.duty.title')}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('admin.duty.body')}
                  </ThemedText>
                </View>
                <View
                  style={[
                    styles.dutyBadge,
                    {
                      backgroundColor: user.emergency_on_duty
                        ? theme.successSoft
                        : theme.background,
                      borderColor: user.emergency_on_duty ? theme.success : theme.border,
                    },
                  ]}>
                  <ThemedText
                    type="tinyBold"
                    themeColor={user.emergency_on_duty ? 'success' : 'textSecondary'}>
                    {t(user.emergency_on_duty ? 'admin.duty.on' : 'admin.duty.off')}
                  </ThemedText>
                </View>
              </View>
              <Button
                disabled={dutyUpdateDisabled}
                icon="alarm"
                label={t(
                  user.emergency_on_duty
                    ? 'admin.duty.remove'
                    : 'admin.duty.assign',
                )}
                onPress={() => onAssignDuty(!user.emergency_on_duty)}
                variant={user.emergency_on_duty ? 'secondary' : 'primary'}
              />
              {updatingDuty ? (
                <View style={styles.roleProgress}>
                  <ActivityIndicator color={theme.accent} size="small" />
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('admin.duty.saving')}
                  </ThemedText>
                </View>
              ) : null}
              {dutyFeedback ? (
                <ThemedText
                  accessibilityLiveRegion="polite"
                  type="small"
                  themeColor={dutyFeedback.type === 'success' ? 'success' : 'danger'}>
                  {dutyFeedback.type === 'error'
                    ? dutyFeedback.message
                    : t(`admin.duty.${dutyFeedback.type}`)}
                </ThemedText>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    width: '100%',
  },
  headerContent: {
    gap: Spacing.four,
  },
  intro: {
    gap: Spacing.two,
  },
  sections: {
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  overviewCard: {
    borderRadius: 12,
    gap: Spacing.half,
  },
  usersTools: {
    gap: Spacing.two,
  },
  searchField: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    minHeight: 42,
    paddingVertical: Spacing.two,
  },
  state: {
    alignItems: 'center',
    gap: Spacing.three,
    justifyContent: 'center',
    minHeight: 180,
  },
  familyPacket: {
    borderRadius: 12,
    gap: Spacing.three,
  },
  familyPacketHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  familyPacketName: {
    flex: 1,
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 24,
    minWidth: 180,
  },
  familyMembers: {
    gap: Spacing.two,
  },
  userDisclosure: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  userSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  userSummaryPressed: {
    opacity: 0.72,
  },
  userName: {
    flex: 1,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 24,
  },
  userChevron: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  userDetails: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  userRole: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  roleBadge: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: Spacing.two,
  },
  roleAssignment: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  roleAssignmentButton: {
    alignSelf: 'flex-start',
  },
  dutyAssignment: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    marginTop: Spacing.one,
    paddingTop: Spacing.three,
  },
  dutyHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  dutyText: {
    flex: 1,
    gap: Spacing.half,
  },
  dutyBadge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  roleChoices: {
    gap: Spacing.two,
  },
  roleProgress: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  roleChoice: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  roleChoiceLabel: {
    flex: 1,
  },
  roleRadio: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  roleRadioDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.55,
  },
});

function RoleChoice({
  disabled,
  label,
  onPress,
  selected,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const theme = useTheme();
  const isDisabled = disabled || selected;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.roleChoice,
        {
          backgroundColor: selected ? theme.accentSoft : theme.background,
          borderColor: selected ? theme.accent : theme.border,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <View
        style={[
          styles.roleRadio,
          { borderColor: selected ? theme.accent : theme.textSecondary },
        ]}>
        {selected ? (
          <View style={[styles.roleRadioDot, { backgroundColor: theme.accent }]} />
        ) : null}
      </View>
      <ThemedText type="smallBold" style={styles.roleChoiceLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}
