import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
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
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { AccountFamily, AdminUserSummary, AppRole } from '@/domain/database';
import {
  AdminAccountFamilyPanel,
  type AccountFamilyChange,
} from '@/features/account-families/AdminAccountFamilyPanel';
import {
  buildAdminUserListItems,
  getAdminUserStats,
} from '@/features/admin/admin-user-list';
import { AdminSectionHeader } from '@/features/admin/AdminSectionHeader';
import type { AdminSection } from '@/features/admin/admin-sections';
import { adminSectionRoute } from '@/features/navigation/routes';
import { AdminDeleteUserDialog } from '@/features/admin/AdminDeleteUserDialog';
import { AdminPushPanel } from '@/features/admin/AdminPushPanel';
import { AdminRegistrationPanel } from '@/features/admin/AdminRegistrationPanel';
import { AdminTravelOrganizationPanel } from '@/features/admin/AdminTravelOrganizationPanel';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import { AdminBusManagementPanel } from '@/features/bus-management/AdminBusManagementPanel';
import { AdminGeneralAlarmPanel } from '@/features/general-alarm/AdminGeneralAlarmPanel';
import { useWakeUpCall } from '@/features/wake-up-call/wake-up-call-context';
import { useBusManagement } from '@/features/bus-management/bus-management-context';
import { AdminDailyProgramPanel } from '@/features/daily-program/AdminDailyProgramPanel';
import { useDailyProgram } from '@/features/daily-program/daily-program-context';
import { localISODate, visibleDailyPrograms } from '@/features/daily-program/daily-program-state';
import { AdminGroupCheckPanel } from '@/features/group-check/AdminGroupCheckPanel';
import { useGroupCheck } from '@/features/group-check/group-check-context';
import { AdminQuestionRoundPanel } from '@/features/question-round/AdminQuestionRoundPanel';
import { AdminEmergencySendRestriction } from '@/features/emergency/AdminEmergencySendRestriction';
import { useQuestionRound } from '@/features/question-round/question-round-context';
import { useI18n } from '@/features/i18n/i18n';
import {
  getOriginalErrorMessage,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';
import { AdminMeetingPointPanel } from '@/features/trip-guidance/AdminMeetingPointPanel';
import { useTripGuidance } from '@/features/trip-guidance/trip-guidance-context';
import { useTheme } from '@/hooks/use-theme';
import { useTripGroups } from '@/features/trip-groups/trip-group-context';

const adminPageSize = 200;
const assignableRoles: AppRole[] = ['user', 'medical_staff', 'organization_team', 'scholar', 'admin'];

type RoleFeedback = {
  message?: string;
  type: 'error' | 'success';
  userId: string;
};

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

export function AdminDashboard({ section }: { section?: AdminSection }) {
  const router = useRouter();
  const theme = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(Math.min(width, MaxContentWidth) - Spacing.three * 2);
  const columnCount = Math.max(1, Math.min(4, Math.floor((gridWidth + 12) / (160 * fontScale + 12))));
  const tileSize = Math.floor((gridWidth - 12 * (columnCount - 1)) / columnCount);
  const { isRTL, language, t } = useI18n();
  const { profile, refreshProfile } = useAuth();
  const { activeTrip, hasSyncError: hasBusSyncError } = useBusManagement();
  const {
    hasSyncError: hasDailyProgramSyncError,
    programs: dailyPrograms,
  } = useDailyProgram();
  const upcomingDailyProgramCount = visibleDailyPrograms(
    dailyPrograms,
    localISODate(),
  ).length;
  const { activeCheck, hasSyncError: hasGroupCheckSyncError } = useGroupCheck();
  const { groups, hasSyncError: hasTripGroupSyncError } = useTripGroups();
  const { call: wakeUpCall, scheduledCalls, error: wakeUpError } = useWakeUpCall();
  const { activeRound, hasSyncError: hasQuestionRoundSyncError } = useQuestionRound();
  const {
    hasSyncError: hasTripGuidanceSyncError,
    navigationDestinations,
  } = useTripGuidance();
  const hasNavigationTarget = navigationDestinations.length > 0;
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [families, setFamilies] = useState<AccountFamily[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [readErrorMessage, setReadErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [expandedRoleUserId, setExpandedRoleUserId] = useState<string | null>(null);
  const [roleFeedback, setRoleFeedback] = useState<RoleFeedback | null>(null);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [updatingStatusUserId, setUpdatingStatusUserId] = useState<string | null>(null);
  const [updatingStatusKind, setUpdatingStatusKind] = useState<'sick' | 'batteryEmpty' | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<RoleFeedback | null>(null);
  const statusChangeInProgress = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserSummary | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [deletedUserName, setDeletedUserName] = useState<string | null>(null);
  const deletionInProgress = useRef(false);
  const usersRequestSequence = useRef(0);
  const hasError = readErrorMessage !== null;

  const userStats = useMemo(() => getAdminUserStats(users), [users]);
  const userListItems = useMemo(
    () => buildAdminUserListItems(users, searchQuery, language),
    [language, searchQuery, users],
  );

  const loadUsers = useCallback(async (showRefreshIndicator = false) => {
    const requestSequence = ++usersRequestSequence.current;
    setReadErrorMessage(null);
    setIsLoading(true);
    setIsRefreshing(showRefreshIndicator);

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
        setIsRefreshing(false);
      }
    }
  }, []);

  const applyFamilyChange = useCallback(
    (change: AccountFamilyChange) => {
      // Reads started before this confirmed mutation must not restore old assignments.
      usersRequestSequence.current += 1;
      setReadErrorMessage(null);
      setIsLoading(false);
      setIsRefreshing(false);

      const familyId = change.type === 'saved' ? change.family.id : change.familyId;
      const memberUserIds = new Set(change.type === 'saved' ? change.memberUserIds : []);

      setFamilies((current) => {
        const remaining = current.filter((family) => family.id !== familyId);
        return change.type === 'saved'
          ? [...remaining, change.family].sort((left, right) =>
              left.name.localeCompare(right.name, language),
            )
          : remaining;
      });
      setUsers((current) => current.map((user) => {
        if (change.type === 'saved' && memberUserIds.has(user.user_id)) {
          return { ...user, family_id: change.family.id, family_name: change.family.name };
        }

        return user.family_id === familyId
          ? { ...user, family_id: null, family_name: null }
          : user;
      }));
    },
    [language],
  );

  const assignRole = useCallback(
    async (userId: string, role: AppRole) => {
      if (deletionInProgress.current || statusChangeInProgress.current) return;
      setRoleFeedback(null);
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
            user.user_id === userId ? { ...user, role } : user,
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

  const toggleUserStatus = async (user: AdminUserSummary, kind: 'sick' | 'batteryEmpty') => {
    if (statusChangeInProgress.current || deletionInProgress.current || updatingRoleUserId !== null) return;
    const enabled = (kind === 'sick' ? user.is_sick : user.is_battery_empty) !== true;
    statusChangeInProgress.current = true;
    setUpdatingStatusUserId(user.user_id);
    setUpdatingStatusKind(kind);
    setStatusFeedback(null);
    try {
      const { data, error } = kind === 'sick'
        ? await supabase.rpc('admin_set_user_sick', { p_user_id: user.user_id, p_is_sick: enabled })
        : await supabase.rpc('admin_set_user_battery_empty', { p_user_id: user.user_id, p_is_battery_empty: enabled });
      if (error || data !== enabled) {
        setStatusFeedback({ type: 'error', userId: user.user_id, message: t('admin.sickness.error') });
        return;
      }
      // Earlier list reads must not undo a confirmed status change.
      usersRequestSequence.current += 1;
      setReadErrorMessage(null);
      setIsLoading(false);
      setIsRefreshing(false);
      setUsers((current) => current.map((entry) => entry.user_id === user.user_id
        ? { ...entry, ...(kind === 'sick'
          ? { is_sick: data, ...(data ? { is_battery_empty: false } : {}) }
          : { is_battery_empty: data, ...(data ? { is_sick: false } : {}) }) } : entry));
      setStatusFeedback({ type: 'success', userId: user.user_id });
      if (profile?.user_id === user.user_id) await refreshProfile();
    } catch {
      setStatusFeedback({ type: 'error', userId: user.user_id, message: t('admin.sickness.error') });
    } finally {
      statusChangeInProgress.current = false;
      setUpdatingStatusUserId(null);
      setUpdatingStatusKind(null);
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget || deletionInProgress.current || statusChangeInProgress.current || updatingRoleUserId !== null) return;
    if (deleteTarget.user_id === profile?.user_id) {
      setDeleteErrorMessage(t('admin.deleteUser.ownAccount'));
      return;
    }

    const target = deleteTarget;
    deletionInProgress.current = true;
    setDeletingUserId(target.user_id);
    setDeleteErrorMessage(null);

    try {
      const { data, error } = await supabase.rpc('admin_delete_user', {
        p_user_id: target.user_id,
      });
      if (error) {
        const messageKey = error.code === '42501'
          ? 'admin.deleteUser.denied'
          : error.code === 'P0002'
            ? 'admin.deleteUser.notFound'
            : error.code === '22023'
              ? 'admin.deleteUser.ownAccount'
              : error.code === 'P0001'
                ? 'admin.deleteUser.lastAdmin'
                : 'admin.deleteUser.error';
        setDeleteErrorMessage(t(messageKey));
        return;
      }
      if (data !== target.user_id) {
        setDeleteErrorMessage(t('admin.deleteUser.error'));
        return;
      }

      // Earlier list reads must not restore an account after its confirmed deletion.
      usersRequestSequence.current += 1;
      setReadErrorMessage(null);
      setIsLoading(false);
      setIsRefreshing(false);
      setUsers((current) => current.filter((user) => user.user_id !== target.user_id));
      setExpandedUserId((current) => current === target.user_id ? null : current);
      setExpandedRoleUserId((current) => current === target.user_id ? null : current);
      setRoleFeedback((current) => current?.userId === target.user_id ? null : current);
      setDeletedUserName(target.display_name);
      setDeleteTarget(null);
    } catch {
      setDeleteErrorMessage(t('admin.deleteUser.error'));
    } finally {
      deletionInProgress.current = false;
      setDeletingUserId(null);
    }
  };

  useFocusEffect(useCallback(() => {
    const initialLoadTimeout = setTimeout(() => void loadUsers(), 0);

    return () => {
      clearTimeout(initialLoadTimeout);
      usersRequestSequence.current += 1;
      setIsRefreshing(false);
    };
  }, [loadUsers]));

  const toggleUserDetails = (userId: string) => {
    setRoleFeedback(null);
    setStatusFeedback(null);
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
        data={section === 'users' && hasLoaded && !hasError ? userListItems : []}
        extraData={{
          expandedRoleUserId,
          expandedUserId,
          roleFeedback,
          updatingRoleUserId,
          deletingUserId,
          updatingStatusUserId,
          updatingStatusKind,
          statusFeedback,
        }}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.key}
        refreshControl={
          <RefreshControl
            colors={[theme.accent]}
            onRefresh={() => void loadUsers(true)}
            refreshing={isRefreshing}
            tintColor={theme.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerContent}>
            {!section ? (
              <View style={styles.headerContent}>
                <View style={styles.intro}>
                  <ThemedText type="title">{t('admin.title')}</ThemedText>
                </View>

                <View
                  onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
                  style={[styles.grid, isRTL && styles.gridRTL]}>
                  <View style={{ width: tileSize }}>
                    <AdminSectionHeader
                      label={t('admin.tile.organization')}
                      description={t('admin.section.organization.description')}
                      icon="people"
                      onPress={() => router.push(adminSectionRoute('organization'))}
                      status={t(
                        hasTripGroupSyncError
                          ? 'admin.section.organization.error'
                          : 'tripGroups.groupCount',
                        { count: groups.length },
                      )}
                      statusColor={
                        hasTripGroupSyncError ? 'danger' : groups.length ? 'success' : 'textSecondary'
                      }
                      title={t('admin.section.organization.title')}
                    />
                  </View>
                  <View style={{ width: tileSize }}>
                    <AdminSectionHeader
                      description={t('wakeUp.description')}
                      icon="clock"
                      onPress={() => router.push(adminSectionRoute('alarm'))}
                      title={t('wakeUp.title')}
                      status={t(
                        wakeUpError ? 'admin.section.organization.error' : wakeUpCall ? 'wakeUp.active' : scheduledCalls.length ? 'wakeUp.plannedCount' : 'wakeUp.inactive',
                        { count: scheduledCalls.length },
                      )}
                      statusColor={wakeUpError ? 'danger' : wakeUpCall ? 'warning' : 'textSecondary'}
                    />
                  </View>
                  <View style={{ width: tileSize }}>
                    <AdminSectionHeader
                      label={t('admin.tile.push')}
                      description={t('adminPush.description')}
                      icon="alarm"
                      onPress={() => router.push(adminSectionRoute('push'))}
                      title={t('adminPush.title')}
                      status={t('adminPush.recipients')}
                    />
                  </View>
                  <View style={{ width: tileSize }}>
                    <AdminSectionHeader
                      description={t('admin.transport.description')}
                      icon="bus"
                      onPress={() => router.push(adminSectionRoute('transport'))}
                      title={t('admin.transport.title')}
                      status={activeTrip?.name ?? t('admin.organization.overview.noActiveTrip')}
                      statusColor={hasBusSyncError ? 'danger' : activeTrip ? 'success' : 'textSecondary'}
                    />
                  </View>
                  <View style={{ width: tileSize }}>
                    <AdminSectionHeader
                      description={t('admin.section.program.description')}
                      icon="book"
                      onPress={() => router.push(adminSectionRoute('program'))}
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
                  </View>
                  <View style={{ width: tileSize }}>
                    <AdminSectionHeader
                      label={t('admin.tile.navigation')}
                      description={t('admin.section.navigation.description')}
                      icon="map"
                      onPress={() => router.push(adminSectionRoute('navigation'))}
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
                  </View>
                  <View style={{ width: tileSize }}>
                    <AdminSectionHeader
                      description={t('admin.section.status.description')}
                      icon="confirm"
                      onPress={() => router.push(adminSectionRoute('status'))}
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
                  </View>
                  <View style={{ width: tileSize }}>
                    <AdminSectionHeader
                      description={t('admin.section.questions.description')}
                      icon="question"
                      onPress={() => router.push(adminSectionRoute('questions'))}
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
                  </View>
                  <View style={{ width: tileSize }}>
                    <AdminSectionHeader
                      description={t('admin.section.families.description')}
                      icon="people"
                      onPress={() => router.push(adminSectionRoute('families'))}
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
                  </View>
                  <View style={{ width: tileSize }}>
                    <AdminSectionHeader
                      description={t('admin.section.users.description')}
                      icon="account"
                      onPress={() => router.push(adminSectionRoute('users'))}
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
                  </View>
                  <View style={{ width: tileSize }}>
                    <AdminSectionHeader
                      description={t('admin.registration.description')}
                      icon="settings"
                      onPress={() => router.push(adminSectionRoute('registration'))}
                      status={t('admin.manage')}
                      title={t('admin.registration.title')}
                    />
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.sections}>
              {section === 'organization' ? (
                <View style={styles.section}>
                  <ThemedText accessibilityRole="header" type="heading">{t('admin.section.organization.title')}</ThemedText>
                  <ThemedText themeColor="textSecondary">{t('admin.section.organization.description')}</ThemedText>
                  {!hasLoaded ? (
                    <ActivityIndicator color={theme.accent} />
                  ) : hasError ? (
                    <Card style={styles.state}>
                      <ThemedText themeColor="danger">{readErrorMessage}</ThemedText>
                      <Button icon="refresh" label={t('admin.retry')} onPress={() => void loadUsers()} />
                    </Card>
                  ) : (
                    <AdminTravelOrganizationPanel families={families} users={users} />
                  )}
                </View>
              ) : null}

              {section === 'alarm' ? (
                <View style={styles.section}>
                  <ThemedText accessibilityRole="header" type="heading">{t('wakeUp.title')}</ThemedText>
                  <ThemedText themeColor="textSecondary">{t('wakeUp.description')}</ThemedText>
                  <AdminGeneralAlarmPanel
                    users={users}
                    isLoadingUsers={isLoading}
                    usersError={readErrorMessage}
                    onRetryUsers={() => void loadUsers()}
                  />
                </View>
              ) : null}

              {section === 'push' ? (
                <View style={styles.section}>
                  <ThemedText accessibilityRole="header" type="heading">{t('adminPush.title')}</ThemedText>
                  <ThemedText themeColor="textSecondary">{t('adminPush.description')}</ThemedText>
                  <AdminPushPanel />
                </View>
              ) : null}

              {section === 'transport' ? (
                <View style={styles.section}>
                  <ThemedText accessibilityRole="header" type="heading">{t('admin.transport.title')}</ThemedText>
                  <ThemedText themeColor="textSecondary">{t('admin.transport.description')}</ThemedText>
                  <AdminBusManagementPanel families={families} users={users} />
                </View>
              ) : null}

              {section === 'program' ? (
                <View style={styles.section}>
                  <ThemedText accessibilityRole="header" type="heading">{t('admin.section.program.title')}</ThemedText>
                  <ThemedText themeColor="textSecondary">{t('admin.section.program.description')}</ThemedText>
                  <AdminDailyProgramPanel />
                </View>
              ) : null}

              {section === 'navigation' ? (
                <View style={styles.section}>
                  <AdminMeetingPointPanel />
                </View>
              ) : null}

              {section === 'status' ? (
                <View style={styles.section}>
                  <ThemedText accessibilityRole="header" type="heading">{t('admin.section.status.title')}</ThemedText>
                  <ThemedText themeColor="textSecondary">{t('admin.section.status.description')}</ThemedText>
                  <AdminGroupCheckPanel />
                </View>
              ) : null}

              {section === 'questions' ? (
                <View style={styles.section}>
                  <ThemedText accessibilityRole="header" type="heading">{t('admin.section.questions.title')}</ThemedText>
                  <ThemedText themeColor="textSecondary">{t('admin.section.questions.description')}</ThemedText>
                  <AdminQuestionRoundPanel />
                </View>
              ) : null}

              {section === 'families' ? (
                <View style={styles.section}>
                  <ThemedText accessibilityRole="header" type="heading">{t('admin.section.families.title')}</ThemedText>
                  <ThemedText themeColor="textSecondary">{t('admin.section.families.description')}</ThemedText>
                  {isLoading && !hasLoaded ? (
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
                      onChanged={applyFamilyChange}
                      users={users}
                    />
                  )}
                </View>
              ) : null}

              {section === 'registration' ? (
                <View style={styles.section}>
                  <AdminRegistrationPanel />
                </View>
              ) : null}

              {section === 'users' ? (
                <View style={styles.section}>
                  <ThemedText accessibilityRole="header" type="heading">{t('admin.section.users.title')}</ThemedText>
                  <ThemedText themeColor="textSecondary">{t('admin.section.users.description')}</ThemedText>
                  {deletedUserName ? (
                    <ThemedText accessibilityLiveRegion="polite" themeColor="success" type="small">
                      {t('admin.deleteUser.deleted', { name: deletedUserName })}
                    </ThemedText>
                  ) : null}

                  {isLoading && !hasLoaded ? (
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
                  )}
                </View>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          section === 'users' &&
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
              onDelete={() => {
                setDeleteTarget(user);
                setDeleteErrorMessage(null);
                setDeletedUserName(null);
              }}
              deletionDisabled={updatingRoleUserId !== null || deletingUserId !== null || updatingStatusUserId !== null}
              onToggleSick={() => void toggleUserStatus(user, 'sick')}
              onToggleBatteryEmpty={() => void toggleUserStatus(user, 'batteryEmpty')}
              statusDisabled={updatingRoleUserId !== null || deletingUserId !== null || updatingStatusUserId !== null}
              statusFeedback={statusFeedback?.userId === user.user_id ? statusFeedback : null}
              updatingSick={updatingStatusUserId === user.user_id && updatingStatusKind === 'sick'}
              updatingBatteryEmpty={updatingStatusUserId === user.user_id && updatingStatusKind === 'batteryEmpty'}
              ownAccount={profile?.user_id === user.user_id}
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
                updatingRoleUserId !== null || deletingUserId !== null || updatingStatusUserId !== null
              }
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
      {deleteTarget ? (
        <AdminDeleteUserDialog
          errorMessage={deleteErrorMessage}
          isDeleting={deletingUserId !== null}
          onCancel={() => { if (!deletionInProgress.current) setDeleteTarget(null); }}
          onConfirm={() => void deleteUser()}
          user={deleteTarget}
        />
      ) : null}
    </SafeAreaView>
  );
}

function AdminUserDisclosure({
  deletionDisabled,
  expanded,
  onAssignRole,
  onDelete,
  onToggleDetails,
  onToggleRoleAssignment,
  onToggleSick,
  onToggleBatteryEmpty,
  updatingBatteryEmpty,
  statusDisabled,
  statusFeedback,
  updatingSick,
  roleAssignmentExpanded,
  roleChoicesDisabled,
  roleFeedback,
  ownAccount,
  updatingRole,
  user,
}: {
  deletionDisabled: boolean;
  expanded: boolean;
  onAssignRole: (role: AppRole) => void;
  onDelete: () => void;
  onToggleDetails: () => void;
  onToggleRoleAssignment: () => void;
  onToggleSick: () => void;
  onToggleBatteryEmpty: () => void;
  updatingBatteryEmpty: boolean;
  statusDisabled: boolean;
  statusFeedback: RoleFeedback | null;
  updatingSick: boolean;
  roleAssignmentExpanded: boolean;
  roleChoicesDisabled: boolean;
  roleFeedback: RoleFeedback | null;
  ownAccount: boolean;
  updatingRole: boolean;
  user: AdminUserSummary;
}) {
  const theme = useTheme();
  const { isRTL, t } = useI18n();
  const chevronRotation = expanded ? '90deg' : isRTL ? '180deg' : '0deg';
  const hasSpecialRole = user.role !== 'user';
  const roleAppearance = {
    admin: { backgroundColor: theme.roleAdminSoft, color: theme.roleAdmin },
    medical_staff: { backgroundColor: theme.roleMedicalSoft, color: theme.roleMedical },
    organization_team: {
      backgroundColor: theme.roleOrganizationSoft,
      color: theme.roleOrganization,
    },
    scholar: { backgroundColor: theme.backgroundSelected, color: theme.textSecondary },
    user: { backgroundColor: theme.surface, color: theme.textSecondary },
  }[user.role];
  const roleLabel = t(`admin.role.${user.role}`);
  const roleBadge = (
    <View
      style={[
        styles.roleBadge,
        {
          backgroundColor: roleAppearance.backgroundColor,
          borderColor: roleAppearance.color,
        },
      ]}>
      <ThemedText style={{ color: roleAppearance.color }} type="tinyBold">
        {roleLabel}
      </ThemedText>
    </View>
  );

  return (
    <View
      style={[
        styles.userDisclosure,
        {
          backgroundColor: theme.surface,
          borderColor: hasSpecialRole ? roleAppearance.color : theme.border,
        },
      ]}>
      <Pressable
        accessibilityLabel={[t(
          expanded ? 'admin.details.hide' : 'admin.details.show',
          { name: user.display_name },
        ), hasSpecialRole ? `${t('admin.roleLabel')}: ${roleLabel}` : null,
        user.is_sick ? t('admin.sickness.label') : null,
        user.is_battery_empty ? t('admin.batteryEmpty.label') : null]
          .filter(Boolean)
          .join(', ')}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggleDetails}
        style={({ pressed }) => [
          styles.userSummary,
          isRTL && { flexDirection: 'row-reverse' },
          pressed && styles.userSummaryPressed,
        ]}>
        <View style={[styles.userIdentity, isRTL && { flexDirection: 'row-reverse' }]}>
          <ThemedText
            style={[
              styles.userName,
              hasSpecialRole && { color: roleAppearance.color },
            ]}>
            {user.display_name}
          </ThemedText>
          {hasSpecialRole ? roleBadge : null}
          {user.is_battery_empty ? (
            <ThemedText type="smallBold" themeColor="warning">
              {t('admin.batteryEmpty.label')}
            </ThemedText>
          ) : null}
          {user.is_sick ? (
            <ThemedText type="smallBold" themeColor="warning">
              {t('admin.sickness.label')}
            </ThemedText>
          ) : null}
        </View>
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
            {roleBadge}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {user.age == null
              ? t('admin.ageUnknown')
              : t('admin.age', { count: user.age })}
          </ThemedText>
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
            disabled={statusDisabled}
            icon={user.is_sick ? 'confirm' : 'warning'}
            label={t(updatingSick
              ? 'admin.sickness.saving'
              : user.is_sick ? 'admin.sickness.clear' : 'admin.sickness.mark')}
            onPress={onToggleSick}
            variant="secondary"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('admin.sickness.body')}
          </ThemedText>
          <Button
            disabled={statusDisabled}
            icon={user.is_battery_empty ? 'confirm' : 'warning'}
            label={t(updatingBatteryEmpty
              ? 'admin.sickness.saving'
              : user.is_battery_empty ? 'admin.batteryEmpty.clear' : 'admin.batteryEmpty.mark')}
            onPress={onToggleBatteryEmpty}
            variant="secondary"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('admin.batteryEmpty.body')}
          </ThemedText>
          {statusFeedback ? (
            <ThemedText
              accessibilityLiveRegion="polite"
              type="small"
              themeColor={statusFeedback.type === 'success' ? 'success' : 'danger'}>
              {statusFeedback.type === 'success' ? t('admin.sickness.saved') : statusFeedback.message}
            </ThemedText>
          ) : null}

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

          <AdminEmergencySendRestriction userId={user.user_id} defaultOpen />

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
          <Button
            disabled={deletionDisabled || ownAccount}
            icon="close"
            label={t('admin.deleteUser.action')}
            onPress={onDelete}
            variant="danger"
          />
          {ownAccount ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('admin.deleteUser.ownAccount')}
            </ThemedText>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridRTL: {
    flexDirection: 'row-reverse',
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
  userIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    minWidth: 0,
  },
  userName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 24,
    maxWidth: '100%',
  },
  userChevron: {
    alignItems: 'center',
    flexShrink: 0,
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
    maxWidth: '100%',
    minHeight: 28,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  roleAssignment: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  roleAssignmentButton: {
    alignSelf: 'flex-start',
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
