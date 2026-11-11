import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, FlatList, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AdminDashboard } from '@/features/admin/AdminDashboard';
import type { AdminSection } from '@/features/admin/admin-sections';
import { Button, type ButtonProps } from '@/components/ui/button';
import type { AccountFamily, AdminUserSummary } from '@/domain/database';
import { AdminAccountFamilyPanel } from '@/features/account-families/AdminAccountFamilyPanel';
import { AdminDeleteUserDialog } from '@/features/admin/AdminDeleteUserDialog';
import { AdminTravelOrganizationPanel } from '@/features/admin/AdminTravelOrganizationPanel';
import { buildAdminUserListItems, type AdminUserListItem } from '@/features/admin/admin-user-list';
import { AdminBusManagementPanel } from '@/features/bus-management/AdminBusManagementPanel';

const mockRouter = { push: jest.fn() };
let mockFocusCallback: (() => void | (() => void)) | undefined;
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (callback: () => void | (() => void)) => {
    mockFocusCallback = callback;
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(callback, [callback]);
  },
}));

type Result<T> = { data: T | null; error: { message: string } | null };
const mockReadUsers = jest.fn<() => Promise<Result<AdminUserSummary[]>>>();
const mockReadFamilies = jest.fn<() => Promise<Result<AccountFamily[]>>>();
const mockSave = jest.fn<(args: unknown) => Promise<Result<AccountFamily>>>();
const mockDelete = jest.fn<(args: unknown) => Promise<Result<AccountFamily>>>();
const mockSetSick = jest.fn<(args: unknown) => Promise<Result<boolean>>>();
const mockSetBatteryEmpty = jest.fn<(args: unknown) => Promise<Result<boolean>>>();
const mockDeleteUser = jest.fn<(args: unknown) => Promise<{
  data: string | null;
  error: { code: string; message: string } | null;
}>>();
let mockCurrentUserId = 'current-admin';

jest.mock('@/features/auth/supabase', () => ({ supabase: {
  rpc: (name: string, args: unknown) => {
    if (name === 'admin_upsert_account_family') return mockSave(args);
    if (name === 'admin_delete_account_family') return mockDelete(args);
    if (name === 'admin_delete_user') return mockDeleteUser(args);
    if (name === 'admin_set_user_sick') return mockSetSick(args);
    if (name === 'admin_set_user_battery_empty') return mockSetBatteryEmpty(args);
    if (name === 'admin_list_account_families') return { abortSignal: () => mockReadFamilies() };
    if (name === 'admin_list_users') return { range: () => ({ abortSignal: () => mockReadUsers() }) };
    throw new Error(`Unexpected RPC: ${name}`);
  },
} }));
jest.mock('@/features/auth/RequireAuth', () => ({ RequireAuth: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ profile: { user_id: mockCurrentUserId }, refreshProfile: jest.fn() }) }));
jest.mock('@/features/bus-management/bus-management-context', () => ({ useBusManagement: () => ({ activeTrip: null }) }));
jest.mock('@/features/daily-program/daily-program-context', () => ({ useDailyProgram: () => ({ programs: [] }) }));
jest.mock('@/features/group-check/group-check-context', () => ({ useGroupCheck: () => ({ activeCheck: null }) }));
jest.mock('@/features/trip-groups/trip-group-context', () => ({ useTripGroups: () => ({ groups: [] }) }));
jest.mock('@/features/wake-up-call/wake-up-call-context', () => ({ useWakeUpCall: () => ({ call: null, scheduledCalls: [] }) }));
jest.mock('@/features/question-round/question-round-context', () => ({ useQuestionRound: () => ({ activeRound: null }) }));
jest.mock('@/features/trip-guidance/trip-guidance-context', () => ({ useTripGuidance: () => ({ navigationDestinations: [] }) }));
jest.mock('@/features/admin/AdminRegistrationPanel', () => ({ AdminRegistrationPanel: () => null }));
jest.mock('@/features/admin/AdminTravelOrganizationPanel', () => ({ AdminTravelOrganizationPanel: () => null }));
jest.mock('@/features/admin/AdminPushPanel', () => ({ AdminPushPanel: () => null }));
jest.mock('@/features/bus-management/AdminBusManagementPanel', () => ({ AdminBusManagementPanel: () => null }));
jest.mock('@/features/general-alarm/AdminGeneralAlarmPanel', () => ({ AdminGeneralAlarmPanel: () => null }));
jest.mock('@/features/daily-program/AdminDailyProgramPanel', () => ({ AdminDailyProgramPanel: () => null }));
jest.mock('@/features/group-check/AdminGroupCheckPanel', () => ({ AdminGroupCheckPanel: () => null }));
jest.mock('@/features/question-round/AdminQuestionRoundPanel', () => ({ AdminQuestionRoundPanel: () => null }));
jest.mock('@/features/trip-guidance/AdminMeetingPointPanel', () => ({ AdminMeetingPointPanel: () => null }));
jest.mock('@/features/emergency/AdminEmergencySendRestriction', () => ({ AdminEmergencySendRestriction: () => null }));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({
  t: (key: string, values?: { name?: string; count?: number }) => {
    if (key.startsWith('admin.deleteUser.') && values?.name) return `${key}: ${values.name}`;
    if (['admin.personCount', 'admin.userCount', 'admin.familyCount'].includes(key)) return `${key}: ${values?.count}`;
    return key;
  },
  language: 'de', isRTL: false,
}) }));
jest.mock('@/constants/theme', () => ({ MaxContentWidth: 1100, Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 40 } }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ background: '#fff', surface: '#fff', accent: '#175', text: '#111', textSecondary: '#666', border: '#888' }) }));
jest.mock('@/components/ui/symbol-icon', () => ({ SymbolIcon: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual<typeof import('react-native')>('react-native').View }));
jest.mock('@/components/themed-text', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ThemedText: ({ children }: { children: React.ReactNode }) => <MockText>{children}</MockText> };
});
jest.mock('@/components/ui/card', () => {
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Card: ({ children }: { children: React.ReactNode }) => <MockView>{children}</MockView> };
});
jest.mock('@/components/ui/button', () => {
  const { Pressable: MockPressable, Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Button: ({ disabled, onPress, label }: ButtonProps) => <MockPressable disabled={disabled} onPress={onPress}><MockText>{label}</MockText></MockPressable> };
});

const family: AccountFamily = {
  id: 7, name: 'Familie Beispiel', created_by_profile_id: 1,
  created_at: '2026-10-29T12:00:00Z', updated_at: '2026-10-29T12:00:00Z',
};
const otherFamily = { ...family, id: 8, name: 'Andere Familie' };
const users: AdminUserSummary[] = ['Amina', 'Bilal', 'Cem', 'Dalia'].map((display_name, index) => ({
  user_id: `user-${index}`, display_name, family_id: null, family_name: null,
  member_type: 'brother', party_size: index + 1, luggage_count: index,
  sim_card_count: 0, emergency_on_duty: false, role: 'user',
}));
const assignedUsers = users.map((user, index) => ({
  ...user, family_id: index < 2 ? family.id : otherFamily.id,
  family_name: index < 2 ? family.name : otherFamily.name,
}));
let renderer: ReactTestRenderer | null;
const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;

function root() {
  if (!renderer) throw new Error('Admin screen has not been rendered.');
  return renderer.root;
}
function panel() { return root().findByType(AdminAccountFamilyPanel); }
function familyNameInput() {
  return panel().findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'accountFamilies.name')!;
}
function listItems(): AdminUserListItem[] {
  if (root().findByType(AdminDashboard).props.section === 'users') {
    return root().findByType(FlatList).props.data;
  }
  return buildAdminUserListItems(panel().props.users, '', 'de');
}
function listedUsers() {
  return listItems().flatMap(item => item.type === 'user' ? [item.user] : item.members)
    .sort((left, right) => left.user_id.localeCompare(right.user_id));
}
function button(label: string) {
  return root().findAllByType(Button).find(node => node.props.label === `accountFamilies.${label}`)!;
}
function hasText(text: string) { return root().findAllByType(Text).some(node => node.props.children === text); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function showSection(section: AdminSection) {
  await act(async () => { renderer!.update(<AdminDashboard section={section} />); });
}
async function render(section: AdminSection = 'families') {
  await act(async () => { renderer = create(<AdminDashboard section={section} />); });
  await act(async () => { jest.advanceTimersByTime(0); });
}
async function nameFamily(name: string) {
  await act(async () => {
    familyNameInput().props.onChangeText(name);
  });
}
async function toggleMember(index: number) {
  await act(async () => {
    panel().findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'accountFamilies.memberSearch')!
      .props.onChangeText(users[index].display_name);
  });
  await act(async () => {
    panel().find(node => node.props.label === users[index].display_name && typeof node.props.onPress === 'function').props.onPress();
  });
}
async function press(label: string) {
  await act(async () => { button(label).props.onPress(); });
}
async function confirmDelete() {
  const confirmation = jest.spyOn(Alert, 'alert');
  await press('delete');
  const destructive = confirmation.mock.calls[0][2]!.find(action => action.style === 'destructive')!;
  await act(async () => { destructive.onPress!(); });
}
async function expandUser(userId: string) {
  await act(async () => {
    root().find(node => node.props.user?.user_id === userId && typeof node.props.onToggleDetails === 'function')
      .props.onToggleDetails();
  });
}
function adminButton(label: string) {
  return root().findAllByType(Button).find(node => node.props.label === `admin.deleteUser.${label}`)!;
}
async function requestUserDeletion(userId = users[0].user_id) {
  await expandUser(userId);
  await act(async () => { adminButton('action').props.onPress(); });
}
async function confirmUserDeletion() {
  await act(async () => { adminButton('confirm').props.onPress(); });
}

describe('admin family and user synchronization', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.useFakeTimers();
    renderer = null;
    mockReadUsers.mockReset().mockResolvedValue({ data: users, error: null });
    mockReadFamilies.mockReset().mockResolvedValue({ data: [], error: null });
    mockSave.mockReset().mockResolvedValue({ data: family, error: null });
    mockDelete.mockReset().mockResolvedValue({ data: family, error: null });
    mockSetSick.mockReset().mockResolvedValue({ data: true, error: null });
    mockSetBatteryEmpty.mockReset().mockResolvedValue({ data: true, error: null });
    mockDeleteUser.mockReset().mockResolvedValue({ data: users[0].user_id, error: null });
    mockCurrentUserId = 'current-admin';
  });
  afterEach(async () => {
    await act(async () => { renderer?.unmount(); });
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct; });

  it('saves and clears battery-empty status, replaces sickness and locks concurrent status writes', async () => {
    mockReadUsers.mockResolvedValue({ data: users.map((user, index) => ({ ...user, is_sick: index === 0 })), error: null });
    const saving = deferred<Result<boolean>>();
    mockSetBatteryEmpty.mockReturnValueOnce(saving.promise);
    await render('users'); await expandUser(users[0].user_id);
    const mark = root().findAllByType(Button).find(node => node.props.label === 'admin.batteryEmpty.mark')!;
    const sick = root().findAllByType(Button).find(node => node.props.label === 'admin.sickness.clear')!;
    await act(async () => { mark.props.onPress(); mark.props.onPress(); sick.props.onPress(); });
    expect(mockSetBatteryEmpty).toHaveBeenCalledTimes(1);
    expect(mockSetSick).not.toHaveBeenCalled();
    expect(mockSetBatteryEmpty).toHaveBeenCalledWith({ p_user_id: users[0].user_id, p_is_battery_empty: true });
    expect(adminButton('action').props.disabled).toBe(true);
    await act(async () => { saving.resolve({ data: true, error: null }); });
    expect(listedUsers()[0]).toMatchObject({ is_sick: false, is_battery_empty: true });
    expect(hasText('admin.batteryEmpty.label')).toBe(true);
    mockSetBatteryEmpty.mockResolvedValueOnce({ data: false, error: null });
    await act(async () => { root().findAllByType(Button).find(node => node.props.label === 'admin.batteryEmpty.clear')!.props.onPress(); });
    expect(listedUsers()[0]).toMatchObject({ is_sick: false, is_battery_empty: false });
    await act(async () => { root().findAllByType(Button).find(node => node.props.label === 'admin.batteryEmpty.mark')!.props.onPress(); });
    await act(async () => { root().findAllByType(Button).find(node => node.props.label === 'admin.sickness.mark')!.props.onPress(); });
    expect(listedUsers()[0]).toMatchObject({ is_sick: true, is_battery_empty: false });
    expect(hasText('admin.batteryEmpty.label')).toBe(false);
  });

  it('keeps sickness after a failed battery-empty update and permits retry', async () => {
    mockReadUsers.mockResolvedValue({ data: users.map(user => ({ ...user, is_sick: true })), error: null });
    mockSetBatteryEmpty.mockResolvedValueOnce({ data: null, error: { message: 'Denied' } });
    await render('users'); await expandUser(users[0].user_id);
    await act(async () => { root().findAllByType(Button).find(node => node.props.label === 'admin.batteryEmpty.mark')!.props.onPress(); });
    expect(listedUsers()[0].is_sick).toBe(true);
    expect(listedUsers()[0].is_battery_empty).toBeUndefined();
    expect(hasText('admin.sickness.error')).toBe(true);
    expect(root().findAllByType(Button).find(node => node.props.label === 'admin.batteryEmpty.mark')!.props.disabled).toBe(false);
  });

  it('saves and clears a sick marker, locking duplicate submissions and other account mutations', async () => {
    const saving = deferred<Result<boolean>>();
    mockSetSick.mockReturnValueOnce(saving.promise);
    await render('users'); await expandUser(users[0].user_id);
    const mark = root().findAllByType(Button).find(node => node.props.label === 'admin.sickness.mark')!;
    await act(async () => { mark.props.onPress(); mark.props.onPress(); });
    expect(mockSetSick).toHaveBeenCalledTimes(1);
    expect(mockSetSick).toHaveBeenCalledWith({ p_user_id: users[0].user_id, p_is_sick: true });
    expect(adminButton('action').props.disabled).toBe(true);
    expect(listedUsers()[0].is_sick).toBeUndefined();
    await act(async () => { saving.resolve({ data: true, error: null }); });
    expect(listedUsers()[0].is_sick).toBe(true);
    expect(hasText('admin.sickness.label')).toBe(true);
    mockSetSick.mockResolvedValueOnce({ data: false, error: null });
    await act(async () => { root().findAllByType(Button).find(node => node.props.label === 'admin.sickness.clear')!.props.onPress(); });
    expect(mockSetSick).toHaveBeenLastCalledWith({ p_user_id: users[0].user_id, p_is_sick: false });
    expect(listedUsers()[0].is_sick).toBe(false);
    expect(hasText('admin.sickness.label')).toBe(false);
  });

  it.each([
    { data: null, error: { message: 'Denied' } },
    { data: null, error: null },
    { data: false, error: null },
  ])('keeps the prior sick status and permits retry after an unsuccessful update: %j', async result => {
    mockSetSick.mockResolvedValueOnce(result);
    await render('users'); await expandUser(users[0].user_id);
    await act(async () => { root().findAllByType(Button).find(node => node.props.label === 'admin.sickness.mark')!.props.onPress(); });
    expect(listedUsers()).toEqual(users);
    expect(hasText('admin.sickness.error')).toBe(true);
    expect(root().findAllByType(Button).find(node => node.props.label === 'admin.sickness.mark')!.props.disabled).toBe(false);
  });

  it('ignores a refresh started before a confirmed sickness update', async () => {
    const reading = deferred<Result<AdminUserSummary[]>>();
    await render('users'); await expandUser(users[0].user_id);
    mockReadUsers.mockReturnValueOnce(reading.promise);
    await act(async () => { root().findByType(FlatList).props.refreshControl.props.onRefresh(); });
    await act(async () => { root().findAllByType(Button).find(node => node.props.label === 'admin.sickness.mark')!.props.onPress(); });
    await act(async () => { reading.resolve({ data: users, error: null }); });
    expect(listedUsers()[0].is_sick).toBe(true);
    expect(root().findByType(FlatList).props.refreshControl.props.refreshing).toBe(false);
  });

  it('groups confirmed members and supplies the updated choices to each admin section', async () => {
    const saving = deferred<Result<AccountFamily>>();
    mockSave.mockReturnValueOnce(saving.promise);
    await render();
    await nameFamily('  Familie Beispiel  ');
    await toggleMember(0); await toggleMember(1);
    await press('create');
    expect(listItems().every(item => item.type === 'user')).toBe(true);
    expect(button('create').props.disabled).toBe(true);
    await act(async () => { saving.resolve({ data: family, error: null }); });

    expect(mockSave).toHaveBeenCalledWith({ p_family_id: null, p_name: family.name, p_member_user_ids: ['user-0', 'user-1'] });
    expect(listItems()[0]).toMatchObject({ type: 'family', familyId: family.id, familyName: family.name, members: [{ user_id: 'user-0' }, { user_id: 'user-1' }] });
    expect(listItems()).toHaveLength(3);
    expect(panel().props.families).toEqual([family]);
    expect(hasText('accountFamilies.feedback.saved')).toBe(true);
    expect(familyNameInput().props.value).toBe('');
    for (const [section, consumer] of [['organization', AdminTravelOrganizationPanel], ['transport', AdminBusManagementPanel]] as const) {
      await showSection(section);
      const props = root().findByType(consumer).props;
      expect(props.families).toEqual([family]);
      expect(props.users.slice(0, 2).map((user: AdminUserSummary) => user.family_id)).toEqual([family.id, family.id]);
    }
    expect(mockReadUsers).toHaveBeenCalledTimes(1);
    expect(mockReadFamilies).toHaveBeenCalledTimes(1);
  });

  it('renames a family, releases deselected members and moves selected members from another family', async () => {
    mockReadUsers.mockResolvedValue({ data: assignedUsers, error: null });
    mockReadFamilies.mockResolvedValue({ data: [family, otherFamily], error: null });
    const renamed = { ...family, name: 'Neue Familie' };
    mockSave.mockResolvedValue({ data: renamed, error: null });
    await render(); await press('edit');
    await nameFamily(renamed.name);
    await toggleMember(0); await toggleMember(2);
    await press('save');

    expect(panel().props.users).toEqual([
      { ...users[0], family_id: null, family_name: null },
      { ...users[1], family_id: family.id, family_name: renamed.name },
      { ...users[2], family_id: family.id, family_name: renamed.name },
      assignedUsers[3],
    ]);
    expect(listItems().filter(item => item.type === 'family').map(item => item.members.map(member => member.user_id)))
      .toEqual([['user-3'], ['user-1', 'user-2']]);
    expect(panel().props.families).toEqual([otherFamily, renamed]);
  });

  it('ungroups members immediately after a confirmed deletion and keeps other families', async () => {
    mockReadUsers.mockResolvedValue({ data: assignedUsers, error: null });
    mockReadFamilies.mockResolvedValue({ data: [family, otherFamily], error: null });
    const deleting = deferred<Result<AccountFamily>>();
    mockDelete.mockReturnValueOnce(deleting.promise);
    await render(); await confirmDelete();
    expect(panel().props.families).toHaveLength(2);
    await act(async () => { deleting.resolve({ data: family, error: null }); });

    expect(mockDelete).toHaveBeenCalledWith({ p_family_id: family.id });
    expect(panel().props.families).toEqual([otherFamily]);
    expect(panel().props.users.slice(0, 2)).toEqual(users.slice(0, 2));
    expect(panel().props.users.slice(2)).toEqual(assignedUsers.slice(2));
    expect(listItems().map(item => item.type)).toEqual(['family', 'user', 'user']);
    expect(hasText('accountFamilies.feedback.deleted')).toBe(true);
    expect(mockReadUsers).toHaveBeenCalledTimes(1);
  });

  it.each([
    { data: null, error: { message: 'Saving failed' } },
    { data: null, error: null },
  ])('keeps the draft and existing assignments after an unsuccessful save: %j', async result => {
    mockSave.mockResolvedValueOnce(result);
    await render(); await nameFamily(family.name); await toggleMember(0); await press('create');
    expect(panel().props.families).toEqual([]);
    expect(panel().props.users).toEqual(users);
    expect(familyNameInput().props.value).toBe(family.name);
    expect(hasText('accountFamilies.feedback.saved')).toBe(false);
    expect(hasText(result.error?.message ?? 'accountFamilies.feedback.error')).toBe(true);
    expect(button('create').props.disabled).toBe(false);
  });

  it('keeps the family and editor after a failed deletion', async () => {
    mockReadUsers.mockResolvedValue({ data: assignedUsers, error: null });
    mockReadFamilies.mockResolvedValue({ data: [family, otherFamily], error: null });
    mockDelete.mockResolvedValueOnce({ data: null, error: { message: 'Deletion failed' } });
    await render(); await press('edit'); await confirmDelete();
    expect(panel().props.families).toEqual([family, otherFamily]);
    expect(panel().props.users).toEqual(assignedUsers);
    expect(familyNameInput().props.value).toBe(family.name);
    expect(hasText('Deletion failed')).toBe(true);
  });

  it.each([false, true])('ignores a refresh started before saving, including a late error (%s)', async fails => {
    const reading = deferred<Result<AdminUserSummary[]>>();
    await render();
    mockReadUsers.mockReturnValueOnce(reading.promise);
    await act(async () => { root().findByType(FlatList).props.refreshControl.props.onRefresh(); });
    await nameFamily(family.name); await toggleMember(0); await press('create');
    await act(async () => {
      reading.resolve(fails ? { data: null, error: { message: 'Old read failed' } } : { data: users, error: null });
    });
    expect(panel().props.families).toEqual([family]);
    expect(listItems()[0]).toMatchObject({ type: 'family', familyId: family.id });
    expect(hasText('Old read failed')).toBe(false);
    expect(root().findByType(FlatList).props.refreshControl.props.refreshing).toBe(false);

    // A later deliberate refresh still loads the authoritative server state.
    mockReadUsers.mockResolvedValue({ data: users, error: null });
    await act(async () => { root().findByType(FlatList).props.refreshControl.props.onRefresh(); });
    expect(panel().props.families).toEqual([]);
    expect(listItems().every(item => item.type === 'user')).toBe(true);
  });

  it('keeps the pull-to-refresh indicator hidden during an automatic focus refresh', async () => {
    await render('users');
    const backgroundRead = deferred<Result<AdminUserSummary[]>>();
    mockReadUsers.mockReturnValueOnce(backgroundRead.promise);

    await act(async () => {
      mockFocusCallback!();
      jest.advanceTimersByTime(0);
    });
    expect(mockReadUsers).toHaveBeenCalledTimes(2);
    expect(root().findByType(FlatList).props.refreshControl.props.refreshing).toBe(false);
    expect(listedUsers()).toEqual(users);
    await act(async () => { backgroundRead.resolve({ data: users, error: null }); });

    const manualRead = deferred<Result<AdminUserSummary[]>>();
    mockReadUsers.mockReturnValueOnce(manualRead.promise);
    await act(async () => { root().findByType(FlatList).props.refreshControl.props.onRefresh(); });
    expect(root().findByType(FlatList).props.refreshControl.props.refreshing).toBe(true);
    await act(async () => { manualRead.resolve({ data: users, error: null }); });
    expect(root().findByType(FlatList).props.refreshControl.props.refreshing).toBe(false);
  });

  it('identifies the account in a confirmation and leaves it untouched when cancelled', async () => {
    await render('users'); await requestUserDeletion();
    expect(root().findByType(AdminDeleteUserDialog).props.user).toEqual(users[0]);
    expect(hasText(`admin.deleteUser.body: ${users[0].display_name}`)).toBe(true);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    await act(async () => { adminButton('cancel').props.onPress(); });
    expect(root().findAllByType(AdminDeleteUserDialog)).toHaveLength(0);
    expect(listedUsers()).toEqual(users);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('prevents deleting the current admin from the user list', async () => {
    mockCurrentUserId = users[0].user_id;
    await render('users'); await expandUser(mockCurrentUserId);
    expect(adminButton('action').props.disabled).toBe(true);
    expect(hasText('admin.deleteUser.ownAccount')).toBe(true);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('locks duplicate confirmation and cancellation while deleting, then updates all account consumers', async () => {
    mockReadUsers.mockResolvedValue({ data: assignedUsers, error: null });
    mockReadFamilies.mockResolvedValue({ data: [family, otherFamily], error: null });
    const deleting = deferred<Awaited<ReturnType<typeof mockDeleteUser>>>();
    mockDeleteUser.mockReturnValueOnce(deleting.promise);
    await render('users');
    await requestUserDeletion();
    const confirm = root().findByType(AdminDeleteUserDialog).props.onConfirm;
    await act(async () => { confirm(); confirm(); });
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith({ p_user_id: users[0].user_id });
    expect(adminButton('deleting').props.disabled).toBe(true);
    expect(adminButton('cancel').props.disabled).toBe(true);
    expect(listedUsers()).toHaveLength(4);
    expect(hasText('admin.personCount: 10')).toBe(true);
    await act(async () => { deleting.resolve({ data: users[0].user_id, error: null }); });

    expect(root().findAllByType(AdminDeleteUserDialog)).toHaveLength(0);
    expect(listedUsers()).toEqual(assignedUsers.slice(1));
    expect(hasText('admin.familyCount: 2')).toBe(true);
    expect(listItems().filter(item => item.type === 'family').flatMap(item => item.members.map(member => member.user_id)))
      .toEqual(['user-2', 'user-3', 'user-1']);
    expect(hasText('admin.personCount: 9')).toBe(true);
    expect(hasText('admin.userCount: 3')).toBe(true);
    expect(hasText('admin.familyCount: 2')).toBe(true);
    for (const [section, consumer] of [['organization', AdminTravelOrganizationPanel], ['transport', AdminBusManagementPanel]] as const) {
      await showSection(section);
      expect(root().findByType(consumer).props.users).toEqual(assignedUsers.slice(1));
    }
    await showSection('users');
    expect(hasText(`admin.deleteUser.deleted: ${users[0].display_name}`)).toBe(true);
    expect(mockReadUsers).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['42501', 'denied'], ['P0002', 'notFound'], ['22023', 'ownAccount'],
    ['P0001', 'lastAdmin'], ['OTHER', 'error'],
  ])('keeps the account and allows retry after server rejection %s', async (code, message) => {
    mockDeleteUser.mockResolvedValueOnce({ data: null, error: { code, message: 'Server rejection' } });
    await render('users'); await requestUserDeletion(); await confirmUserDeletion();
    expect(listedUsers()).toEqual(users);
    expect(hasText(`admin.deleteUser.${message}`)).toBe(true);
    expect(adminButton('confirm').props.disabled).toBe(false);
    expect(root().findByType(AdminDeleteUserDialog).props.user).toEqual(users[0]);
    await confirmUserDeletion();
    expect(listedUsers()).toEqual(users.slice(1));
  });

  it.each([null, 'wrong-account'])('does not treat an unconfirmed response as a deletion (%s)', async data => {
    mockDeleteUser.mockResolvedValueOnce({ data, error: null });
    await render('users'); await requestUserDeletion(); await confirmUserDeletion();
    expect(listedUsers()).toEqual(users);
    expect(hasText('admin.deleteUser.error')).toBe(true);
    expect(hasText(`admin.deleteUser.deleted: ${users[0].display_name}`)).toBe(false);
  });

  it.each([false, true])('does not resurrect a deleted user after an earlier refresh settles (error: %s)', async fails => {
    const reading = deferred<Result<AdminUserSummary[]>>();
    await render('users');
    mockReadUsers.mockReturnValueOnce(reading.promise);
    await act(async () => { root().findByType(FlatList).props.refreshControl.props.onRefresh(); });
    await requestUserDeletion(); await confirmUserDeletion();
    await act(async () => {
      reading.resolve(fails ? { data: null, error: { message: 'Old read failed' } } : { data: users, error: null });
    });
    expect(listedUsers()).toEqual(users.slice(1));
    expect(hasText('Old read failed')).toBe(false);
    expect(root().findByType(FlatList).props.refreshControl.props.refreshing).toBe(false);
  });
});
