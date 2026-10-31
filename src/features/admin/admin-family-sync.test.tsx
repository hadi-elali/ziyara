import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, FlatList, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import AdminScreen from '@/app/admin';
import { Button, type ButtonProps } from '@/components/ui/button';
import type { AccountFamily, AdminUserSummary } from '@/domain/database';
import { AdminAccountFamilyPanel } from '@/features/account-families/AdminAccountFamilyPanel';
import { AdminSectionHeader } from '@/features/admin/AdminSectionHeader';
import { AdminTravelOrganizationPanel } from '@/features/admin/AdminTravelOrganizationPanel';
import type { AdminUserListItem } from '@/features/admin/admin-user-list';
import { AdminBusManagementPanel } from '@/features/bus-management/AdminBusManagementPanel';

type Result<T> = { data: T | null; error: { message: string } | null };
const mockReadUsers = jest.fn<() => Promise<Result<AdminUserSummary[]>>>();
const mockReadFamilies = jest.fn<() => Promise<Result<AccountFamily[]>>>();
const mockSave = jest.fn<(args: unknown) => Promise<Result<AccountFamily>>>();
const mockDelete = jest.fn<(args: unknown) => Promise<Result<AccountFamily>>>();

jest.mock('@/features/auth/supabase', () => ({ supabase: {
  rpc: (name: string, args: unknown) => {
    if (name === 'admin_upsert_account_family') return mockSave(args);
    if (name === 'admin_delete_account_family') return mockDelete(args);
    if (name === 'admin_list_account_families') return { abortSignal: () => mockReadFamilies() };
    if (name === 'admin_list_users') return { range: () => ({ abortSignal: () => mockReadUsers() }) };
    throw new Error(`Unexpected RPC: ${name}`);
  },
} }));
jest.mock('@/features/auth/RequireAuth', () => ({ RequireAuth: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ profile: null, refreshProfile: jest.fn() }) }));
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
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({ t: (key: string) => key, language: 'de', isRTL: false }) }));
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
function listItems(): AdminUserListItem[] { return root().findByType(FlatList).props.data; }
function button(label: string) {
  return root().findAllByType(Button).find(node => node.props.label === `accountFamilies.${label}`)!;
}
function hasText(text: string) { return root().findAllByType(Text).some(node => node.props.children === text); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function toggleSection(title: string) {
  await act(async () => {
    root().findAllByType(AdminSectionHeader).find(node => node.props.title === title)!.props.onToggle();
  });
}
async function render() {
  await act(async () => { renderer = create(<AdminScreen />); });
  await act(async () => { jest.advanceTimersByTime(0); });
  await toggleSection('admin.section.families.title');
  await toggleSection('admin.section.users.title');
}
async function nameFamily(name: string) {
  await act(async () => {
    panel().findByType(TextInput).props.onChangeText(name);
  });
}
async function toggleMember(index: number) {
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

describe('admin family synchronization', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.useFakeTimers();
    renderer = null;
    mockReadUsers.mockReset().mockResolvedValue({ data: users, error: null });
    mockReadFamilies.mockReset().mockResolvedValue({ data: [], error: null });
    mockSave.mockReset().mockResolvedValue({ data: family, error: null });
    mockDelete.mockReset().mockResolvedValue({ data: family, error: null });
  });
  afterEach(async () => {
    await act(async () => { renderer?.unmount(); });
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct; });

  it('groups confirmed members immediately and updates group/bus choices without another read', async () => {
    const saving = deferred<Result<AccountFamily>>();
    mockSave.mockReturnValueOnce(saving.promise);
    await render();
    await toggleSection('admin.section.organization.title');
    await toggleSection('admin.transport.title');
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
    expect(panel().findByType(TextInput).props.value).toBe('');
    for (const consumer of [AdminTravelOrganizationPanel, AdminBusManagementPanel]) {
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
    expect(panel().findByType(TextInput).props.value).toBe(family.name);
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
    expect(panel().findByType(TextInput).props.value).toBe(family.name);
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
});
